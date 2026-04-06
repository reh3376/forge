# ruff: noqa: UP017
"""Tests for Pydantic ↔ Protobuf serialization round-trips.

These tests verify that every Forge model type can be converted to a
proto-compatible dict and back without data loss.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from forge.core.models.adapter import (
    AdapterHealth,
    AdapterManifest,
    AdapterState,
    AdapterTier,
    DataContract,
)
from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordContext,
    RecordTimestamp,
    RecordValue,
)
from forge.transport.serialization import (
    proto_to_pydantic,
    pydantic_to_proto,
)

# ═══════════════════════════════════════════════════════════════════════════
# ContextualRecord round-trip tests
# ═══════════════════════════════════════════════════════════════════════════


class TestContextualRecordRoundTrip:
    """Full ContextualRecord round-trip: Pydantic → proto dict → Pydantic."""

    def test_full_record_round_trip(self, sample_record: ContextualRecord) -> None:
        proto_dict = pydantic_to_proto(sample_record)
        restored = proto_to_pydantic(proto_dict, "ContextualRecord")

        assert restored.record_id == sample_record.record_id
        assert restored.source.adapter_id == sample_record.source.adapter_id
        assert restored.source.system == sample_record.source.system
        assert restored.source.tag_path == sample_record.source.tag_path
        assert restored.source.connection_id == sample_record.source.connection_id

    def test_timestamp_round_trip(self, sample_record: ContextualRecord) -> None:
        proto_dict = pydantic_to_proto(sample_record)
        restored = proto_to_pydantic(proto_dict, "ContextualRecord")

        # Timestamps should be within 1ms (nanosecond rounding)
        src_delta = abs(
            (restored.timestamp.source_time - sample_record.timestamp.source_time)
            .total_seconds()
        )
        assert src_delta < 0.001

        assert restored.timestamp.server_time is not None

    def test_value_round_trip_float(self, sample_record: ContextualRecord) -> None:
        proto_dict = pydantic_to_proto(sample_record)
        restored = proto_to_pydantic(proto_dict, "ContextualRecord")

        assert restored.value.raw == pytest.approx(78.4)
        assert restored.value.engineering_units == "°F"
        assert restored.value.quality == QualityCode.GOOD
        assert restored.value.data_type == "float64"

    def test_context_round_trip(self, sample_record: ContextualRecord) -> None:
        proto_dict = pydantic_to_proto(sample_record)
        restored = proto_to_pydantic(proto_dict, "ContextualRecord")

        assert restored.context.equipment_id == "FERM-003"
        assert restored.context.area == "Fermentation"
        assert restored.context.site == "Louisville"
        assert restored.context.batch_id == "B2026-0405-003"
        assert restored.context.shift == "B"
        assert restored.context.operator_id == "OP-042"

    def test_context_extra_round_trip(self, sample_record: ContextualRecord) -> None:
        proto_dict = pydantic_to_proto(sample_record)
        restored = proto_to_pydantic(proto_dict, "ContextualRecord")

        # Simple string extra
        assert restored.context.extra["line"] == "Line-1"
        # Nested dict extra (JSON-encoded in proto, decoded back)
        assert restored.context.extra["nested"] == {"key": "val"}

    def test_lineage_round_trip(self, sample_record: ContextualRecord) -> None:
        proto_dict = pydantic_to_proto(sample_record)
        restored = proto_to_pydantic(proto_dict, "ContextualRecord")

        assert restored.lineage.schema_ref == "forge://schemas/whk-wms/v0.1.0"
        assert restored.lineage.adapter_id == "whk-wms"
        assert restored.lineage.adapter_version == "0.1.0"
        assert restored.lineage.transformation_chain == ["collect", "enrich_context"]


# ═══════════════════════════════════════════════════════════════════════════
# RecordValue typed_value round-trips (the tricky part)
# ═══════════════════════════════════════════════════════════════════════════


class TestRecordValueTypedValues:
    """Test every oneof variant in RecordValue.raw → typed_value."""

    def _round_trip_value(self, raw: object, expected_raw: object = None) -> None:
        """Helper: create RecordValue, serialize, deserialize, compare raw."""
        value = RecordValue(raw=raw, data_type="test")
        proto_dict = pydantic_to_proto(value)
        restored = proto_to_pydantic(proto_dict, "RecordValue")
        if expected_raw is not None:
            assert restored.raw == expected_raw
        else:
            assert restored.raw == raw

    def test_float_value(self) -> None:
        self._round_trip_value(78.4)

    def test_integer_value(self) -> None:
        self._round_trip_value(42)

    def test_large_integer(self) -> None:
        """Integers should use integer_value, not number_value (no float precision loss)."""
        self._round_trip_value(2**53 + 1)

    def test_zero(self) -> None:
        self._round_trip_value(0)

    def test_negative_float(self) -> None:
        self._round_trip_value(-273.15)

    def test_string_value(self) -> None:
        self._round_trip_value("hello world")

    def test_empty_string(self) -> None:
        self._round_trip_value("")

    def test_bool_true(self) -> None:
        self._round_trip_value(True)

    def test_bool_false(self) -> None:
        self._round_trip_value(False)

    def test_bytes_value(self) -> None:
        self._round_trip_value(b"\x00\x01\x02\xff")

    def test_dict_value(self) -> None:
        """Dicts should be JSON-encoded via json_value."""
        self._round_trip_value({"key": "val", "num": 42})

    def test_list_value(self) -> None:
        """Lists should be JSON-encoded via json_value."""
        self._round_trip_value([1, 2, "three"])

    def test_nested_dict(self) -> None:
        nested = {"a": {"b": {"c": [1, 2, 3]}}}
        self._round_trip_value(nested)

    def test_none_value(self) -> None:
        self._round_trip_value(None)

    def test_nan_as_string(self) -> None:
        """NaN can't round-trip through proto double, so it becomes a string."""
        value = RecordValue(raw=float("nan"), data_type="float64")
        proto_dict = pydantic_to_proto(value)
        restored = proto_to_pydantic(proto_dict, "RecordValue")
        assert restored.raw == "nan"

    def test_inf_as_string(self) -> None:
        """Inf can't round-trip through proto double, so it becomes a string."""
        value = RecordValue(raw=float("inf"), data_type="float64")
        proto_dict = pydantic_to_proto(value)
        restored = proto_to_pydantic(proto_dict, "RecordValue")
        assert restored.raw == "inf"

    def test_quality_codes_round_trip(self) -> None:
        for qc in QualityCode:
            value = RecordValue(raw="test", quality=qc, data_type="string")
            proto_dict = pydantic_to_proto(value)
            restored = proto_to_pydantic(proto_dict, "RecordValue")
            assert restored.quality == qc


# ═══════════════════════════════════════════════════════════════════════════
# RecordTimestamp edge cases
# ═══════════════════════════════════════════════════════════════════════════


class TestTimestampEdgeCases:
    """Timestamp conversion edge cases."""

    def test_naive_datetime_assumed_utc(self) -> None:
        """Naive datetimes should be treated as UTC."""
        ts = RecordTimestamp(
            source_time=datetime(2026, 1, 1, 0, 0, 0),
            ingestion_time=datetime(2026, 1, 1, 0, 0, 1),
        )
        proto_dict = pydantic_to_proto(ts)
        restored = proto_to_pydantic(proto_dict, "RecordTimestamp")
        assert restored.source_time.tzinfo == timezone.utc

    def test_none_server_time(self) -> None:
        """server_time is optional — should survive round-trip as None."""
        ts = RecordTimestamp(
            source_time=datetime(2026, 1, 1, tzinfo=timezone.utc),
            server_time=None,
            ingestion_time=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        proto_dict = pydantic_to_proto(ts)
        restored = proto_to_pydantic(proto_dict, "RecordTimestamp")
        assert restored.server_time is None

    def test_sub_millisecond_precision(self) -> None:
        """Verify nanosecond fields are populated."""
        ts = RecordTimestamp(
            source_time=datetime(2026, 1, 1, 0, 0, 0, 123456, tzinfo=timezone.utc),
            ingestion_time=datetime(2026, 1, 1, 0, 0, 0, 0, tzinfo=timezone.utc),
        )
        proto_dict = pydantic_to_proto(ts)
        assert proto_dict["source_time"]["nanos"] > 0


# ═══════════════════════════════════════════════════════════════════════════
# RecordContext edge cases
# ═══════════════════════════════════════════════════════════════════════════


class TestContextEdgeCases:
    """RecordContext serialization edge cases."""

    def test_empty_context(self) -> None:
        """All-None context should round-trip cleanly."""
        ctx = RecordContext()
        proto_dict = pydantic_to_proto(ctx)
        restored = proto_to_pydantic(proto_dict, "RecordContext")
        assert restored.equipment_id is None
        assert restored.extra == {}

    def test_extra_with_numeric_string(self) -> None:
        """Extra values that look like JSON numbers should decode as numbers."""
        ctx = RecordContext(extra={"count": 42, "rate": 3.14})
        proto_dict = pydantic_to_proto(ctx)
        restored = proto_to_pydantic(proto_dict, "RecordContext")
        assert restored.extra["count"] == 42
        assert restored.extra["rate"] == pytest.approx(3.14)

    def test_extra_with_plain_string(self) -> None:
        """Extra values that are plain strings should stay as strings."""
        ctx = RecordContext(extra={"note": "hello world"})
        proto_dict = pydantic_to_proto(ctx)
        restored = proto_to_pydantic(proto_dict, "RecordContext")
        assert restored.extra["note"] == "hello world"


# ═══════════════════════════════════════════════════════════════════════════
# AdapterManifest round-trip tests
# ═══════════════════════════════════════════════════════════════════════════


class TestManifestRoundTrip:
    """AdapterManifest round-trip tests."""

    def test_full_manifest_round_trip(self, sample_manifest: AdapterManifest) -> None:
        proto_dict = pydantic_to_proto(sample_manifest)
        restored = proto_to_pydantic(proto_dict, "AdapterManifest")

        assert restored.adapter_id == "whk-wms"
        assert restored.name == "Whiskey House WMS Adapter"
        assert restored.version == "0.1.0"
        assert restored.protocol == "graphql+amqp"
        assert restored.tier == AdapterTier.MES_MOM

    def test_capabilities_round_trip(self, sample_manifest: AdapterManifest) -> None:
        proto_dict = pydantic_to_proto(sample_manifest)
        restored = proto_to_pydantic(proto_dict, "AdapterManifest")

        assert restored.capabilities.read is True
        assert restored.capabilities.write is False
        assert restored.capabilities.subscribe is True

    def test_connection_params_round_trip(self, sample_manifest: AdapterManifest) -> None:
        proto_dict = pydantic_to_proto(sample_manifest)
        restored = proto_to_pydantic(proto_dict, "AdapterManifest")

        assert len(restored.connection_params) == 2
        assert restored.connection_params[0].name == "graphql_url"
        assert restored.connection_params[0].required is True
        assert restored.connection_params[1].secret is True

    def test_data_contract_round_trip(self, sample_manifest: AdapterManifest) -> None:
        proto_dict = pydantic_to_proto(sample_manifest)
        restored = proto_to_pydantic(proto_dict, "AdapterManifest")

        assert restored.data_contract.schema_ref == "forge://schemas/whk-wms/v0.1.0"
        assert restored.data_contract.context_fields == [
            "equipment_id", "lot_id", "batch_id",
        ]

    def test_auth_methods_round_trip(self, sample_manifest: AdapterManifest) -> None:
        proto_dict = pydantic_to_proto(sample_manifest)
        restored = proto_to_pydantic(proto_dict, "AdapterManifest")

        assert restored.auth_methods == ["azure_entra_id", "bearer_token"]

    def test_tier_enum_round_trip(self) -> None:
        """Verify all tier values round-trip correctly."""
        for tier in AdapterTier:
            manifest = AdapterManifest(
                adapter_id="test",
                name="Test",
                version="0.1.0",
                protocol="test",
                tier=tier,
                data_contract=DataContract(schema_ref="test"),
            )
            proto_dict = pydantic_to_proto(manifest)
            restored = proto_to_pydantic(proto_dict, "AdapterManifest")
            assert restored.tier == tier


# ═══════════════════════════════════════════════════════════════════════════
# AdapterHealth round-trip tests
# ═══════════════════════════════════════════════════════════════════════════


class TestHealthRoundTrip:
    """AdapterHealth round-trip tests."""

    def test_full_health_round_trip(self, sample_health: AdapterHealth) -> None:
        proto_dict = pydantic_to_proto(sample_health)
        restored = proto_to_pydantic(proto_dict, "AdapterHealth")

        assert restored.adapter_id == "whk-wms"
        assert restored.state == AdapterState.HEALTHY
        assert restored.records_collected == 1234
        assert restored.records_failed == 5
        assert restored.uptime_seconds == pytest.approx(3600.5)

    def test_health_with_error(self) -> None:
        health = AdapterHealth(
            adapter_id="test",
            state=AdapterState.FAILED,
            error_message="Connection refused",
        )
        proto_dict = pydantic_to_proto(health)
        restored = proto_to_pydantic(proto_dict, "AdapterHealth")

        assert restored.state == AdapterState.FAILED
        assert restored.error_message == "Connection refused"

    def test_health_none_timestamps(self) -> None:
        health = AdapterHealth(
            adapter_id="test",
            state=AdapterState.REGISTERED,
        )
        proto_dict = pydantic_to_proto(health)
        restored = proto_to_pydantic(proto_dict, "AdapterHealth")

        assert restored.last_check is None
        assert restored.last_healthy is None

    def test_all_states_round_trip(self) -> None:
        """Verify all adapter states round-trip correctly."""
        for state in AdapterState:
            health = AdapterHealth(adapter_id="test", state=state)
            proto_dict = pydantic_to_proto(health)
            restored = proto_to_pydantic(proto_dict, "AdapterHealth")
            assert restored.state == state


# ═══════════════════════════════════════════════════════════════════════════
# Public API error handling
# ═══════════════════════════════════════════════════════════════════════════


class TestPublicApiErrors:
    """Test error handling for the public API functions."""

    def test_pydantic_to_proto_unknown_type(self) -> None:
        with pytest.raises(TypeError, match="No proto converter"):
            pydantic_to_proto("not a model")

    def test_proto_to_pydantic_unknown_type(self) -> None:
        with pytest.raises(KeyError, match="No Pydantic converter"):
            proto_to_pydantic({}, "UnknownType")
