"""Tests for the WMS context mapper and enrichment rules."""

from datetime import UTC, datetime

from forge.adapters.whk_wms.context import (
    build_record_context,
    compose_location,
    derive_shift,
    normalize_event_type,
)
from forge.core.models.contextual_record import RecordContext

# ── Shift Enrichment ───────────────────────────────────────────────


class TestDeriveShift:
    """Test shift_id derivation from event timestamp."""

    def test_day_shift_morning(self):
        # 10 AM Louisville = day shift
        dt = datetime(2026, 4, 6, 14, 0, 0, tzinfo=UTC)  # ~10 AM EDT
        assert derive_shift(dt) == "day"

    def test_night_shift_evening(self):
        # 11 PM Louisville = night shift
        dt = datetime(2026, 4, 7, 3, 0, 0, tzinfo=UTC)  # ~11 PM EDT
        assert derive_shift(dt) == "night"

    def test_night_shift_early_morning(self):
        # 2 AM Louisville = night shift
        dt = datetime(2026, 4, 6, 6, 0, 0, tzinfo=UTC)  # ~2 AM EDT
        assert derive_shift(dt) == "night"

    def test_day_shift_boundary_start(self):
        # Exactly 06:00 Louisville = day shift
        dt = datetime(2026, 4, 6, 10, 0, 0, tzinfo=UTC)  # 06:00 EDT
        assert derive_shift(dt) == "day"

    def test_night_shift_boundary_start(self):
        # Exactly 18:00 Louisville = night shift
        dt = datetime(2026, 4, 6, 22, 0, 0, tzinfo=UTC)  # 18:00 EDT
        assert derive_shift(dt) == "night"

    def test_naive_timestamp_assumed_utc(self):
        # Naive datetime treated as UTC
        dt = datetime(2026, 4, 6, 15, 0, 0)  # 15:00 UTC = 11:00 EDT = day
        assert derive_shift(dt) == "day"


# ── Location Composition ──────────────────────────────────────────


class TestComposeLocation:
    """Test physical_asset_id composition from warehouse topology."""

    def test_full_location(self):
        raw = {
            "warehouse": "WH01",
            "building": "B03",
            "floor": 2,
            "rick": 15,
            "position": 4,
        }
        assert compose_location(raw) == "WH01-B03-F2-R15-P4"

    def test_warehouse_only(self):
        raw = {"warehouse": "WH01"}
        assert compose_location(raw) == "WH01"

    def test_missing_warehouse_returns_none(self):
        raw = {"floor": 2, "rick": 15}
        assert compose_location(raw) is None

    def test_partial_location(self):
        raw = {"warehouse": "WH01", "floor": 3}
        assert compose_location(raw) == "WH01-F3"

    def test_alternative_key_names(self):
        raw = {
            "warehouse_id": "WH02",
            "building_id": "B01",
            "floor_number": 1,
            "rick_number": 5,
            "position_number": 12,
        }
        assert compose_location(raw) == "WH02-B01-F1-R5-P12"


# ── Event Type Normalization ──────────────────────────────────────


class TestNormalizeEventType:
    """Test event type normalization from WMS data."""

    def test_explicit_type_gets_prefix(self):
        raw = {"event_type": "fill.completed"}
        assert normalize_event_type(raw) == "barrel.fill.completed"

    def test_already_prefixed(self):
        raw = {"event_type": "barrel.transfer"}
        assert normalize_event_type(raw) == "barrel.transfer"

    def test_rabbitmq_exchange_lookup(self):
        raw = {}
        result = normalize_event_type(
            raw, exchange_name="wh.whk01.distillery01.barrel"
        )
        assert result == "barrel.state_change"

    def test_unknown_fallback(self):
        raw = {}
        assert normalize_event_type(raw) == "unknown"

    def test_type_field_alias(self):
        raw = {"type": "gauge"}
        assert normalize_event_type(raw) == "barrel.gauge"

    def test_uns_exchange(self):
        raw = {}
        result = normalize_event_type(raw, exchange_name="uns.barrel.state")
        assert result == "barrel.state_change"


# ── Full Context Building ─────────────────────────────────────────


class TestBuildRecordContext:
    """Test full context building from raw WMS events."""

    def test_returns_record_context(self):
        raw = {"barrel_id": "B1", "event_timestamp": "2026-04-06T14:30:00+00:00"}
        ctx = build_record_context(raw)
        assert isinstance(ctx, RecordContext)

    def test_populates_equipment_id(self):
        raw = {"barrelId": "BRL-001"}
        ctx = build_record_context(raw)
        assert ctx.equipment_id == "BRL-001"

    def test_populates_lot_id(self):
        raw = {"lotId": "LOT-001"}
        ctx = build_record_context(raw)
        assert ctx.lot_id == "LOT-001"

    def test_populates_shift_from_timestamp(self):
        raw = {"event_timestamp": "2026-04-06T14:30:00+00:00"}
        ctx = build_record_context(raw)
        assert ctx.shift is not None
        assert ctx.shift in ("day", "night")

    def test_populates_extra_facts_fields(self):
        raw = {
            "barrelId": "BRL-001",
            "event_timestamp": "2026-04-06T14:30:00+00:00",
            "event_type": "fill",
            "customerId": "CUST-42",
            "warehouse": "WH01",
            "floor": 2,
            "rick": 15,
            "position": 4,
        }
        ctx = build_record_context(raw)
        assert "manufacturing_unit_id" in ctx.extra
        assert "physical_asset_id" in ctx.extra
        assert "business_entity_id" in ctx.extra
        assert "event_type" in ctx.extra
        assert "event_timestamp" in ctx.extra

    def test_z_suffix_timestamp_parsing(self):
        """Python 3.10 requires Z → +00:00 replacement."""
        raw = {"event_timestamp": "2026-04-06T14:30:00Z"}
        ctx = build_record_context(raw)
        assert ctx.shift is not None

    def test_empty_raw_event(self):
        ctx = build_record_context({})
        assert ctx.shift is None
        assert ctx.equipment_id is None
        assert ctx.lot_id is None

    def test_operator_from_created_by_id(self):
        raw = {"createdById": "USR-017"}
        ctx = build_record_context(raw)
        assert ctx.operator_id == "USR-017"

    def test_recipe_from_mashbill_id(self):
        raw = {"mashbillId": "MB-003"}
        ctx = build_record_context(raw)
        assert ctx.recipe_id == "MB-003"
