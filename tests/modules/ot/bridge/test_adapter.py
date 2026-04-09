"""Tests for the IgnitionBridgeAdapter."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import pytest

from forge.core.models.adapter import AdapterState
from forge.modules.ot.bridge.adapter import IgnitionBridgeAdapter, _map_ignition_quality
from forge.modules.ot.bridge.client import IgnitionRestClient
from forge.modules.ot.bridge.models import (
    BridgeConfig,
    BridgeState,
    IgnitionQuality,
)
from forge.modules.ot.bridge.tag_mapper import TagMapper
from forge.modules.ot.opcua_client.paths import PathNormalizer
from forge.core.models.contextual_record import QualityCode as CoreQualityCode


# ---------------------------------------------------------------------------
# Mock transport (shared with test_client.py pattern)
# ---------------------------------------------------------------------------


class MockTransport:
    """Minimal mock HTTP transport for adapter tests."""

    def __init__(self) -> None:
        self.call_count = 0
        self._post_response: dict[str, Any] = {}
        self._get_response: dict[str, Any] = {}
        self._should_fail = False

    def set_post_response(self, resp: dict[str, Any]) -> None:
        self._post_response = resp

    def set_get_response(self, resp: dict[str, Any]) -> None:
        self._get_response = resp

    def set_should_fail(self, fail: bool) -> None:
        self._should_fail = fail

    async def post(self, url: str, **kwargs: Any) -> dict[str, Any]:
        self.call_count += 1
        if self._should_fail:
            raise ConnectionError("Mock failure")
        return self._post_response

    async def get(self, url: str, **kwargs: Any) -> dict[str, Any]:
        self.call_count += 1
        if self._should_fail:
            raise ConnectionError("Mock failure")
        return self._get_response


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_adapter(
    *,
    auto_discover: bool = False,
    **config_kwargs: Any,
) -> tuple[IgnitionBridgeAdapter, MockTransport]:
    transport = MockTransport()
    config = BridgeConfig(auto_discover=auto_discover, **config_kwargs)
    normalizer = PathNormalizer(site_prefix="WH", namespace_map={2: "WHK01"})
    client = IgnitionRestClient(config, transport)
    mapper = TagMapper(config, normalizer)
    adapter = IgnitionBridgeAdapter(config, client, mapper)
    return adapter, transport


# ---------------------------------------------------------------------------
# Quality mapping
# ---------------------------------------------------------------------------


class TestQualityMapping:
    """Tests for Ignition → Core quality mapping."""

    def test_good(self):
        assert _map_ignition_quality(IgnitionQuality.GOOD) == CoreQualityCode.GOOD

    def test_uncertain(self):
        assert _map_ignition_quality(IgnitionQuality.UNCERTAIN) == CoreQualityCode.UNCERTAIN

    def test_bad_variants_all_map_to_bad(self):
        for q in [
            IgnitionQuality.BAD,
            IgnitionQuality.BAD_STALE,
            IgnitionQuality.BAD_DISABLED,
            IgnitionQuality.BAD_NOT_FOUND,
            IgnitionQuality.BAD_ACCESS_DENIED,
            IgnitionQuality.ERROR,
        ]:
            assert _map_ignition_quality(q) == CoreQualityCode.BAD


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


class TestLifecycle:
    """Tests for adapter lifecycle management."""

    @pytest.mark.asyncio
    async def test_configure_sets_connecting(self):
        adapter, _ = _make_adapter()
        await adapter.configure({})
        assert adapter.state == AdapterState.CONNECTING

    @pytest.mark.asyncio
    async def test_start_success(self):
        adapter, transport = _make_adapter()
        transport.set_post_response({})  # login
        transport.set_get_response({"version": "8.1.33", "gatewayName": "WHK01"})

        await adapter.configure({})
        await adapter.start()

        assert adapter.state == AdapterState.HEALTHY
        assert adapter.bridge_health.state == BridgeState.HEALTHY
        assert adapter.bridge_health.ignition_version == "8.1.33"

    @pytest.mark.asyncio
    async def test_start_failure(self):
        adapter, transport = _make_adapter(username="admin", password="secret")
        transport.set_should_fail(True)

        await adapter.configure({})
        await adapter.start()

        assert adapter.state == AdapterState.DEGRADED
        assert adapter.bridge_health.state == BridgeState.FAILED

    @pytest.mark.asyncio
    async def test_stop(self):
        adapter, transport = _make_adapter()
        transport.set_post_response({})
        transport.set_get_response({})

        await adapter.configure({})
        await adapter.start()
        await adapter.stop()

        assert adapter.state == AdapterState.STOPPED
        assert adapter.bridge_health.state == BridgeState.STOPPED

    @pytest.mark.asyncio
    async def test_health_returns_adapter_health(self):
        adapter, transport = _make_adapter()
        transport.set_post_response({})
        transport.set_get_response({})

        await adapter.configure({})
        await adapter.start()
        health = await adapter.health()

        assert health.adapter_id == "ignition-bridge"
        assert health.state == AdapterState.HEALTHY
        assert health.uptime_seconds > 0


# ---------------------------------------------------------------------------
# Collect
# ---------------------------------------------------------------------------


class TestCollect:
    """Tests for the collect() async generator."""

    @pytest.mark.asyncio
    async def test_collect_empty_when_no_tags(self):
        adapter, transport = _make_adapter()
        transport.set_post_response({})
        transport.set_get_response({})

        await adapter.configure({})
        await adapter.start()

        records = []
        async for record in adapter.collect():
            records.append(record)
        assert len(records) == 0

    @pytest.mark.asyncio
    async def test_collect_yields_records(self):
        adapter, transport = _make_adapter()
        transport.set_post_response({})
        transport.set_get_response({})

        await adapter.configure({})
        await adapter.start()

        # Add tags manually
        adapter.add_tags(["[WHK01]Distillery01/TIT_2010/Out_PV"])

        # Set up tag read response
        transport.set_post_response({
            "results": [
                {"value": 72.5, "quality": "Good", "timestamp": 1712678400000, "dataType": "Float8"},
            ]
        })

        records = []
        async for record in adapter.collect():
            records.append(record)

        assert len(records) == 1
        assert records[0].source.system == "ignition-bridge"
        assert records[0].source.adapter_id == "ignition-bridge"
        assert records[0].value.raw == 72.5
        assert records[0].value.quality == CoreQualityCode.GOOD
        assert "ignition_path" in records[0].context.extra

    @pytest.mark.asyncio
    async def test_collect_tracks_health(self):
        adapter, transport = _make_adapter()
        transport.set_post_response({})
        transport.set_get_response({})
        await adapter.configure({})
        await adapter.start()

        adapter.add_tags(["[WHK01]tag1"])
        transport.set_post_response({
            "results": [{"value": 1, "quality": "Good"}]
        })

        async for _ in adapter.collect():
            pass

        assert adapter.bridge_health.total_polls == 1
        assert adapter.bridge_health.tags_polled == 1
        assert adapter.bridge_health.tags_good == 1

    @pytest.mark.asyncio
    async def test_collect_multiple_tags(self):
        adapter, transport = _make_adapter()
        transport.set_post_response({})
        transport.set_get_response({})
        await adapter.configure({})
        await adapter.start()

        adapter.add_tags([
            "[WHK01]tag1",
            "[WHK01]tag2",
            "[WHK01]tag3",
        ])

        transport.set_post_response({
            "results": [
                {"value": 1.0, "quality": "Good"},
                {"value": 2.0, "quality": "Good"},
                {"value": 3.0, "quality": "Bad"},
            ]
        })

        records = []
        async for record in adapter.collect():
            records.append(record)

        assert len(records) == 3
        assert adapter.bridge_health.tags_good == 2
        assert adapter.bridge_health.tags_bad == 1

    @pytest.mark.asyncio
    async def test_collect_lineage_chain(self):
        adapter, transport = _make_adapter()
        transport.set_post_response({})
        transport.set_get_response({})
        await adapter.configure({})
        await adapter.start()

        adapter.add_tags(["[WHK01]tag1"])
        transport.set_post_response({
            "results": [{"value": 42, "quality": "Good"}]
        })

        async for record in adapter.collect():
            assert record.lineage.adapter_id == "ignition-bridge"
            assert "ignition_rest_poll" in record.lineage.transformation_chain
            assert "tag_mapper" in record.lineage.transformation_chain


# ---------------------------------------------------------------------------
# Tag management
# ---------------------------------------------------------------------------


class TestTagManagement:
    """Tests for add/remove tag operations."""

    @pytest.mark.asyncio
    async def test_add_tags(self):
        adapter, _ = _make_adapter()
        added = adapter.add_tags([
            "[WHK01]tag1",
            "[WHK01]tag2",
        ])
        assert added == 2
        assert adapter.active_tag_count == 2

    @pytest.mark.asyncio
    async def test_add_duplicate_tag(self):
        adapter, _ = _make_adapter()
        adapter.add_tags(["[WHK01]tag1"])
        added = adapter.add_tags(["[WHK01]tag1"])
        assert added == 0  # Already exists
        assert adapter.active_tag_count == 1

    @pytest.mark.asyncio
    async def test_add_excluded_tag(self):
        adapter, _ = _make_adapter(tag_provider="WHK01")
        added = adapter.add_tags(["[OTHER]tag1"])
        assert added == 0  # Wrong provider

    @pytest.mark.asyncio
    async def test_remove_tags(self):
        adapter, _ = _make_adapter()
        adapter.add_tags(["[WHK01]tag1", "[WHK01]tag2"])
        removed = adapter.remove_tags(["[WHK01]tag1"])
        assert removed == 1
        assert adapter.active_tag_count == 1

    @pytest.mark.asyncio
    async def test_remove_nonexistent_tag(self):
        adapter, _ = _make_adapter()
        removed = adapter.remove_tags(["[WHK01]nonexistent"])
        assert removed == 0


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------


class TestDiscovery:
    """Tests for tag discovery via Ignition browse."""

    @pytest.mark.asyncio
    async def test_discover_returns_tag_metadata(self):
        adapter, transport = _make_adapter()
        transport.set_post_response({})
        transport.set_get_response({
            "nodes": [
                {
                    "name": "TIT_2010",
                    "path": "[WHK01]TIT_2010",
                    "tagType": "AtomicTag",
                    "hasChildren": False,
                    "dataType": "Float8",
                },
            ]
        })

        await adapter.configure({})
        await adapter.start()

        discovered = await adapter.discover()
        assert len(discovered) == 1
        assert discovered[0]["source"] == "ignition-bridge"
        assert discovered[0]["ignition_path"] == "[WHK01]TIT_2010"


# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------


class TestManifest:
    """Tests for adapter manifest properties."""

    def test_manifest_is_read_only(self):
        adapter, _ = _make_adapter()
        assert adapter.manifest.adapter_id == "ignition-bridge"
        assert adapter.manifest.capabilities.read is True
        assert adapter.manifest.capabilities.write is False
        assert adapter.manifest.capabilities.subscribe is False
        assert adapter.manifest.capabilities.backfill is False
        assert adapter.manifest.capabilities.discover is True
        assert adapter.manifest.type == "BRIDGE"
