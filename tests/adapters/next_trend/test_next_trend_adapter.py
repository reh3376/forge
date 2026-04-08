"""Tests for the NextTrend Historian adapter.

Covers manifest loading, configuration validation, lifecycle state
machine, record collection, context building, record building,
backfill, subscription, discovery, and FACTS spec conformance.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest

from forge.adapters.next_trend.adapter import NextTrendAdapter
from forge.adapters.next_trend.config import NextTrendConfig
from forge.adapters.next_trend.context import (
    _quality_label,
    build_record_context,
)
from forge.adapters.next_trend.record_builder import (
    _assess_quality,
    _historian_tag_path,
    _normalize_value,
    _parse_timestamp,
    build_contextual_record,
)
from forge.core.models.adapter import AdapterState, AdapterTier
from forge.core.models.contextual_record import QualityCode


# ── Fixtures ──────────────────────────────────────────────────────


@pytest.fixture()
def tag_meta() -> dict[str, Any]:
    """A realistic NextTrend tag metadata dict."""
    return {
        "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        "name": "WH/WHK01/Distillery01/Temperature",
        "data_type": "Float64",
        "unit": "°F",
        "description": "Still column top temperature",
        "source": "OPC-UA:ns=2;s=Distillery01.TIC_100",
        "retention_tier": "critical-90d",
        "asset_id": "asset-001",
    }


@pytest.fixture()
def value_point() -> dict[str, Any]:
    """A realistic NextTrend value point."""
    return {
        "ts": "2026-04-07T12:00:00+00:00",
        "value": 145.7,
        "quality": 192,
    }


@pytest.fixture()
def tag_value_record(
    tag_meta: dict[str, Any], value_point: dict[str, Any]
) -> dict[str, Any]:
    """Combined tag_meta + value_point for inject_records()."""
    return {
        "tag_meta": tag_meta,
        "value_point": value_point,
    }


@pytest.fixture()
def adapter_params() -> dict[str, Any]:
    """Minimal valid configuration params."""
    return {
        "api_base_url": "http://localhost:3011/api/v1",
        "api_key": "ntv1_" + "a" * 64,
    }


# ── Manifest Tests ────────────────────────────────────────────────


class TestManifest:
    """Verify manifest loads correctly from manifest.json."""

    def test_adapter_id(self):
        assert NextTrendAdapter.manifest.adapter_id == "next-trend"

    def test_version(self):
        assert NextTrendAdapter.manifest.version == "0.1.0"

    def test_type_is_ingestion(self):
        assert NextTrendAdapter.manifest.type == "INGESTION"

    def test_protocol(self):
        assert NextTrendAdapter.manifest.protocol == "rest+sse"

    def test_tier_is_historian(self):
        assert NextTrendAdapter.manifest.tier == AdapterTier.HISTORIAN

    def test_capabilities(self):
        caps = NextTrendAdapter.manifest.capabilities
        assert caps.read is True
        assert caps.write is False
        assert caps.subscribe is True
        assert caps.backfill is True
        assert caps.discover is True

    def test_connection_params_count(self):
        assert len(NextTrendAdapter.manifest.connection_params) == 9

    def test_required_params(self):
        required = [
            p.name
            for p in NextTrendAdapter.manifest.connection_params
            if p.required
        ]
        assert required == ["api_base_url"]

    def test_auth_methods(self):
        assert "api_key" in NextTrendAdapter.manifest.auth_methods
        assert "bearer_token" in NextTrendAdapter.manifest.auth_methods

    def test_data_contract_schema_ref(self):
        assert (
            NextTrendAdapter.manifest.data_contract.schema_ref
            == "forge://schemas/next-trend/v0.1.0"
        )

    def test_data_contract_context_fields(self):
        fields = NextTrendAdapter.manifest.data_contract.context_fields
        assert "tag_name" in fields
        assert "tag_id" in fields
        assert "data_type" in fields
        assert "quality" in fields

    def test_metadata_source_language(self):
        assert NextTrendAdapter.manifest.metadata["source_language"] == "Rust"

    def test_metadata_framework(self):
        assert "Axum" in NextTrendAdapter.manifest.metadata["source_framework"]

    def test_manifest_json_exists(self):
        manifest_path = (
            Path(__file__).parent.parent.parent.parent
            / "src"
            / "forge"
            / "adapters"
            / "next_trend"
            / "manifest.json"
        )
        assert manifest_path.exists()


# ── Configuration Tests ───────────────────────────────────────────


class TestConfig:
    """Verify config validation and auth logic."""

    def test_api_key_auth(self):
        config = NextTrendConfig(
            api_base_url="http://localhost:3011/api/v1",
            api_key="ntv1_" + "a" * 64,
        )
        assert config.api_key is not None
        assert config.auth_header == {"X-Api-Key": config.api_key}
        assert config.uses_jwt is False

    def test_jwt_auth(self):
        config = NextTrendConfig(
            api_base_url="http://localhost:3011/api/v1",
            username="admin",
            password="changeme",
        )
        assert config.uses_jwt is True
        assert config.auth_header == {}

    def test_no_auth_raises(self):
        with pytest.raises(ValueError, match="requires either api_key"):
            NextTrendConfig(
                api_base_url="http://localhost:3011/api/v1",
            )

    def test_api_key_takes_precedence(self):
        config = NextTrendConfig(
            api_base_url="http://localhost:3011/api/v1",
            api_key="ntv1_" + "b" * 64,
            username="admin",
            password="changeme",
        )
        assert config.uses_jwt is False
        assert "X-Api-Key" in config.auth_header

    def test_frozen_config(self):
        config = NextTrendConfig(
            api_base_url="http://localhost:3011/api/v1",
            api_key="ntv1_" + "c" * 64,
        )
        with pytest.raises(Exception):
            config.api_base_url = "http://other"

    def test_defaults(self):
        config = NextTrendConfig(
            api_key="ntv1_" + "d" * 64,
        )
        assert config.api_base_url == "http://localhost:3011/api/v1"
        assert config.poll_interval_ms == 5000
        assert config.history_query_limit == 10_000
        assert config.tag_prefix_filter == ""
        assert config.connect_timeout_ms == 5000
        assert config.request_timeout_ms == 30_000

    def test_poll_interval_bounds(self):
        with pytest.raises(Exception):
            NextTrendConfig(
                api_key="ntv1_" + "e" * 64,
                poll_interval_ms=100,  # below 500
            )


# ── Context Builder Tests ─────────────────────────────────────────


class TestContextBuilder:
    """Verify RecordContext construction from tag metadata."""

    def test_basic_context(self, tag_meta, value_point):
        ctx = build_record_context(tag_meta, value_point)
        assert ctx.equipment_id == tag_meta["id"]
        assert ctx.area == "WH/WHK01"
        assert ctx.extra["tag_name"] == "WH/WHK01/Distillery01/Temperature"
        assert ctx.extra["data_type"] == "Float64"
        assert ctx.extra["unit"] == "°F"
        assert ctx.extra["quality"] == "GOOD"
        assert ctx.extra["quality_code"] == 192

    def test_context_without_value_point(self, tag_meta):
        ctx = build_record_context(tag_meta, None)
        assert ctx.extra["quality"] == "UNKNOWN"
        assert ctx.extra["quality_code"] == -1

    def test_context_preserves_optional_fields(self, tag_meta, value_point):
        ctx = build_record_context(tag_meta, value_point)
        assert ctx.extra["source"] == tag_meta["source"]
        assert ctx.extra["retention_tier"] == tag_meta["retention_tier"]
        assert ctx.extra["asset_id"] == tag_meta["asset_id"]
        assert ctx.extra["description"] == tag_meta["description"]

    def test_area_derivation_short_path(self):
        ctx = build_record_context({"name": "Temperature"}, None)
        assert ctx.area == "Temperature"

    def test_area_derivation_two_segments(self):
        ctx = build_record_context({"name": "WH/WHK01"}, None)
        assert ctx.area == "WH/WHK01"

    def test_quality_label_mapping(self):
        assert _quality_label(192) == "GOOD"
        assert _quality_label(64) == "UNCERTAIN"
        assert _quality_label(0) == "BAD"
        assert _quality_label(None) == "UNKNOWN"
        assert _quality_label(128) == "OPC_128"


# ── Record Builder Tests ──────────────────────────────────────────


class TestRecordBuilder:
    """Verify ContextualRecord construction."""

    def test_build_record(self, tag_meta, value_point):
        ctx = build_record_context(tag_meta, value_point)
        record = build_contextual_record(
            tag_meta=tag_meta,
            value_point=value_point,
            context=ctx,
        )
        assert record.source.adapter_id == "next-trend"
        assert record.source.system == "next-trend"
        assert record.source.tag_path == "historian.tag.WH.WHK01.Distillery01.Temperature"
        assert record.value.raw == 145.7
        assert record.value.engineering_units == "°F"
        assert record.value.quality == QualityCode.GOOD
        assert record.timestamp.source_time is not None
        assert record.lineage.schema_ref == "forge://schemas/next-trend/v0.1.0"

    def test_tag_path_translation(self):
        assert _historian_tag_path("WH/WHK01/Distillery01/Temp") == (
            "historian.tag.WH.WHK01.Distillery01.Temp"
        )
        assert _historian_tag_path("SimpleTag") == "historian.tag.SimpleTag"

    def test_timestamp_parsing(self):
        # RFC 3339 with offset
        dt = _parse_timestamp("2026-04-07T12:00:00+00:00")
        assert dt.year == 2026
        assert dt.tzinfo is not None

        # RFC 3339 with Z
        dt = _parse_timestamp("2026-04-07T12:00:00Z")
        assert dt.year == 2026

        # Unix timestamp
        dt = _parse_timestamp(1775649600.0)
        assert isinstance(dt, datetime)

        # None
        dt = _parse_timestamp(None)
        assert isinstance(dt, datetime)

        # Datetime passthrough
        now = datetime.now(tz=timezone.utc)
        assert _parse_timestamp(now) is now

    def test_normalize_value_float(self):
        assert _normalize_value(42.5, "Float64") == 42.5
        assert _normalize_value("42.5", "Float64") == 42.5
        assert _normalize_value(42, "Float64") == 42.0

    def test_normalize_value_int(self):
        assert _normalize_value(42, "Int64") == 42
        assert _normalize_value("42", "Int64") == 42

    def test_normalize_value_bool(self):
        assert _normalize_value(True, "Boolean") is True
        assert _normalize_value("true", "Boolean") is True
        assert _normalize_value("false", "Boolean") is False

    def test_normalize_value_string(self):
        assert _normalize_value(42, "String") == "42"

    def test_normalize_value_none(self):
        assert _normalize_value(None, "Float64") is None

    def test_quality_assessment(self):
        assert _assess_quality(192) == QualityCode.GOOD
        assert _assess_quality(64) == QualityCode.UNCERTAIN
        assert _assess_quality(0) == QualityCode.BAD
        assert _assess_quality(None) == QualityCode.UNCERTAIN
        assert _assess_quality(200) == QualityCode.GOOD  # >= 192

    def test_record_lineage(self, tag_meta, value_point):
        ctx = build_record_context(tag_meta, value_point)
        record = build_contextual_record(
            tag_meta=tag_meta,
            value_point=value_point,
            context=ctx,
        )
        assert len(record.lineage.transformation_chain) == 3
        assert "nexttrend.rest.TagValue" in record.lineage.transformation_chain[0]
        assert record.lineage.adapter_id == "next-trend"
        assert record.lineage.adapter_version == "0.1.0"


# ── Lifecycle Tests ───────────────────────────────────────────────


class TestLifecycle:
    """Verify adapter state machine transitions."""

    @pytest.fixture()
    def adapter(self):
        return NextTrendAdapter()

    @pytest.mark.asyncio()
    async def test_configure_sets_registered(self, adapter, adapter_params):
        await adapter.configure(adapter_params)
        assert adapter.state == AdapterState.REGISTERED

    @pytest.mark.asyncio()
    async def test_start_without_configure_raises(self, adapter):
        with pytest.raises(RuntimeError, match="not configured"):
            await adapter.start()

    @pytest.mark.asyncio()
    async def test_start_with_injected_records(
        self, adapter, adapter_params, tag_value_record
    ):
        await adapter.configure(adapter_params)
        adapter.inject_records([tag_value_record])
        await adapter.start()
        assert adapter.state == AdapterState.HEALTHY

    @pytest.mark.asyncio()
    async def test_stop_clears_state(
        self, adapter, adapter_params, tag_value_record
    ):
        await adapter.configure(adapter_params)
        adapter.inject_records([tag_value_record])
        await adapter.start()
        await adapter.stop()
        assert adapter.state == AdapterState.STOPPED

    @pytest.mark.asyncio()
    async def test_health_returns_status(
        self, adapter, adapter_params, tag_value_record
    ):
        await adapter.configure(adapter_params)
        adapter.inject_records([tag_value_record])
        await adapter.start()
        health = await adapter.health()
        assert health.adapter_id == "next-trend"
        assert health.state == AdapterState.HEALTHY

    @pytest.mark.asyncio()
    async def test_adapter_id_from_manifest(self, adapter):
        assert adapter.adapter_id == "next-trend"


# ── Collection Tests ──────────────────────────────────────────────


class TestCollection:
    """Verify record collection from injected data."""

    @pytest.fixture()
    async def started_adapter(self, adapter_params, tag_value_record):
        adapter = NextTrendAdapter()
        await adapter.configure(adapter_params)
        adapter.inject_records([tag_value_record])
        await adapter.start()
        return adapter

    @pytest.mark.asyncio()
    async def test_collect_yields_records(self, started_adapter):
        records = [r async for r in started_adapter.collect()]
        assert len(records) == 1

    @pytest.mark.asyncio()
    async def test_collect_record_structure(
        self, started_adapter, tag_meta
    ):
        records = [r async for r in started_adapter.collect()]
        record = records[0]
        assert record.source.adapter_id == "next-trend"
        assert "historian.tag" in record.source.tag_path
        assert record.value.raw == 145.7
        assert record.value.quality == QualityCode.GOOD

    @pytest.mark.asyncio()
    async def test_collect_increments_counter(self, started_adapter):
        _ = [r async for r in started_adapter.collect()]
        health = await started_adapter.health()
        assert health.records_collected == 1

    @pytest.mark.asyncio()
    async def test_collect_drains_injected(self, started_adapter):
        _ = [r async for r in started_adapter.collect()]
        records2 = [r async for r in started_adapter.collect()]
        assert len(records2) == 0

    @pytest.mark.asyncio()
    async def test_collect_multiple_records(self, adapter_params):
        adapter = NextTrendAdapter()
        await adapter.configure(adapter_params)
        records_data = [
            {
                "tag_meta": {
                    "id": f"tag-{i}",
                    "name": f"WH/WHK01/Tag{i}",
                    "data_type": "Float64",
                },
                "value_point": {
                    "ts": "2026-04-07T12:00:00Z",
                    "value": float(i * 10),
                    "quality": 192,
                },
            }
            for i in range(5)
        ]
        adapter.inject_records(records_data)
        await adapter.start()
        collected = [r async for r in adapter.collect()]
        assert len(collected) == 5


# ── Backfill Tests ────────────────────────────────────────────────


class TestBackfill:
    """Verify historical data backfill."""

    @pytest.mark.asyncio()
    async def test_backfill_yields_records(
        self, adapter_params, tag_value_record
    ):
        adapter = NextTrendAdapter()
        await adapter.configure(adapter_params)
        adapter.inject_backfill_records([tag_value_record])
        await adapter.start()

        start = datetime(2026, 4, 1, tzinfo=timezone.utc)
        end = datetime(2026, 4, 7, tzinfo=timezone.utc)

        records = [r async for r in adapter.backfill(["Temperature"], start, end)]
        assert len(records) == 1
        assert records[0].source.adapter_id == "next-trend"

    @pytest.mark.asyncio()
    async def test_backfill_increments_counter(
        self, adapter_params, tag_value_record
    ):
        adapter = NextTrendAdapter()
        await adapter.configure(adapter_params)
        adapter.inject_backfill_records([tag_value_record])
        await adapter.start()

        start = datetime(2026, 4, 1, tzinfo=timezone.utc)
        end = datetime(2026, 4, 7, tzinfo=timezone.utc)
        _ = [r async for r in adapter.backfill(["Temperature"], start, end)]

        health = await adapter.health()
        assert health.records_collected >= 1


# ── Subscription Tests ────────────────────────────────────────────


class TestSubscription:
    """Verify SSE subscription management."""

    @pytest.mark.asyncio()
    async def test_subscribe_returns_id(self, adapter_params):
        adapter = NextTrendAdapter()
        await adapter.configure(adapter_params)
        sub_id = await adapter.subscribe(
            tags=["historian.tag.Temperature"],
            callback=lambda x: None,
        )
        assert sub_id is not None
        assert len(sub_id) == 36  # UUID format

    @pytest.mark.asyncio()
    async def test_unsubscribe(self, adapter_params):
        adapter = NextTrendAdapter()
        await adapter.configure(adapter_params)
        sub_id = await adapter.subscribe(
            tags=["historian.tag.Temperature"],
            callback=lambda x: None,
        )
        await adapter.unsubscribe(sub_id)
        # Should not raise


# ── Discovery Tests ───────────────────────────────────────────────


class TestDiscovery:
    """Verify tag discovery returns standard types."""

    @pytest.mark.asyncio()
    async def test_discover_returns_tags(self, adapter_params):
        adapter = NextTrendAdapter()
        await adapter.configure(adapter_params)
        tags = await adapter.discover()
        assert len(tags) > 0

    @pytest.mark.asyncio()
    async def test_discover_tag_structure(self, adapter_params):
        adapter = NextTrendAdapter()
        await adapter.configure(adapter_params)
        tags = await adapter.discover()
        for tag in tags:
            assert "tag_path" in tag
            assert "data_type" in tag
            assert "description" in tag
            assert tag["tag_path"].startswith("historian.tag.")

    @pytest.mark.asyncio()
    async def test_discover_includes_common_types(self, adapter_params):
        adapter = NextTrendAdapter()
        await adapter.configure(adapter_params)
        tags = await adapter.discover()
        tag_paths = [t["tag_path"] for t in tags]
        assert "historian.tag.temperature" in tag_paths
        assert "historian.tag.pressure" in tag_paths
        assert "historian.tag.status" in tag_paths


# ── FACTS Spec Tests ──────────────────────────────────────────────


class TestFACTSSpec:
    """Verify FACTS governance spec passes all checks."""

    @pytest.fixture()
    def spec(self) -> dict[str, Any]:
        spec_path = (
            Path(__file__).parent.parent.parent.parent
            / "src"
            / "forge"
            / "governance"
            / "facts"
            / "specs"
            / "next-trend.facts.json"
        )
        return json.loads(spec_path.read_text())

    def test_spec_loads(self, spec):
        assert spec["adapter_identity"]["adapter_id"] == "next-trend"

    def test_spec_tier(self, spec):
        assert spec["adapter_identity"]["tier"] == "HISTORIAN"

    def test_spec_protocol(self, spec):
        assert spec["adapter_identity"]["protocol"] == "rest+sse"

    def test_spec_capabilities_match_manifest(self, spec):
        caps = spec["capabilities"]
        m_caps = NextTrendAdapter.manifest.capabilities
        assert caps["read"] == m_caps.read
        assert caps["write"] == m_caps.write
        assert caps["subscribe"] == m_caps.subscribe
        assert caps["backfill"] == m_caps.backfill
        assert caps["discover"] == m_caps.discover

    def test_spec_has_integrity_block(self, spec):
        assert "integrity" in spec
        assert "spec_hash" in spec["integrity"]
        assert "hash_method" in spec["integrity"]

    @pytest.mark.asyncio()
    async def test_facts_runner_passes(self, spec):
        from forge.governance.facts.runners.facts_runner import FACTSRunner
        from forge.governance.shared.runner import VerdictStatus

        runner = FACTSRunner()
        report = await runner.run(target="next-trend", spec=spec)
        errors = [
            v for v in report.verdicts if v.status == VerdictStatus.FAIL
        ]
        assert len(errors) == 0, (
            f"FACTS runner failed: "
            + "; ".join(f"[{e.check_id}] {e.message}" for e in errors)
        )

    @pytest.mark.asyncio()
    async def test_hash_verification(self, spec):
        from forge.governance.shared.runner import verify_spec_hash

        ok, msg = verify_spec_hash(spec)
        assert ok, f"Hash mismatch: {msg}"

    def test_data_sources_count(self, spec):
        sources = spec["data_contract"]["data_sources"]
        assert len(sources) == 5

    def test_context_mappings_count(self, spec):
        mappings = spec["context_mapping"]["mappings"]
        assert len(mappings) == 8
