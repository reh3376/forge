"""Tests for MES context mapper -- shift, event type, MQTT topic, field mappings."""

from __future__ import annotations

from datetime import UTC, datetime

from forge.adapters.whk_mes.context import (
    build_record_context,
    derive_shift,
    extract_equipment_from_topic,
    normalize_event_type,
)


class TestDeriveShift:
    """Test shift enrichment rule (shared with WMS)."""

    def test_daytime_utc(self):
        # 14:00 UTC -> ~10:00 Louisville (EDT) -> day
        ts = datetime(2026, 4, 6, 14, 0, tzinfo=UTC)
        assert derive_shift(ts) == "day"

    def test_nighttime_utc(self):
        # 02:00 UTC -> ~22:00 Louisville previous day -> night
        ts = datetime(2026, 4, 6, 2, 0, tzinfo=UTC)
        assert derive_shift(ts) == "night"

    def test_morning_boundary(self):
        # 10:00 UTC -> ~06:00 Louisville (EDT) -> day (exact boundary)
        ts = datetime(2026, 4, 6, 10, 0, tzinfo=UTC)
        assert derive_shift(ts) == "day"

    def test_evening_boundary(self):
        # 22:00 UTC -> ~18:00 Louisville (EDT) -> night (exact boundary)
        ts = datetime(2026, 4, 6, 22, 0, tzinfo=UTC)
        assert derive_shift(ts) == "night"

    def test_naive_timestamp_assumed_utc(self):
        ts = datetime(2026, 4, 6, 14, 0)
        shift = derive_shift(ts)
        assert shift in ("day", "night")

    def test_late_night_utc(self):
        # 23:30 UTC -> ~19:30 Louisville -> night
        ts = datetime(2026, 4, 6, 23, 30, tzinfo=UTC)
        assert derive_shift(ts) == "night"


class TestNormalizeEventType:
    """Test event type normalization (enrichment rule 2)."""

    def test_explicit_step_started(self):
        raw = {"event_type": "step_started"}
        assert normalize_event_type(raw) == "step.started"

    def test_explicit_batch_completed(self):
        raw = {"eventType": "batch_completed"}
        assert normalize_event_type(raw) == "batch.completed"

    def test_explicit_phase_started(self):
        raw = {"event_type": "PhaseStarted"}
        assert normalize_event_type(raw) == "phase.started"

    def test_explicit_deviation_detected(self):
        raw = {"event_type": "deviation_detected"}
        assert normalize_event_type(raw) == "quality.deviation_detected"

    def test_explicit_parameter_override(self):
        raw = {"type": "parameter_override"}
        assert normalize_event_type(raw) == "parameter.override"

    def test_mqtt_topic_step_execution(self):
        raw = {}
        result = normalize_event_type(
            raw, mqtt_topic="production/StepExecution/step_completed"
        )
        assert result == "step.completed"

    def test_mqtt_topic_unknown_entity(self):
        raw = {}
        result = normalize_event_type(
            raw, mqtt_topic="production/NewEntity/some_action"
        )
        assert result == "newentity.some_action"

    def test_rabbitmq_exchange_batch(self):
        raw = {}
        result = normalize_event_type(
            raw, exchange_name="wh.whk01.distillery01.batch"
        )
        assert result == "batch.event"

    def test_rabbitmq_exchange_recipe(self):
        raw = {}
        result = normalize_event_type(
            raw, exchange_name="wh.whk01.distillery01.recipe"
        )
        assert result == "recipe.event"

    def test_rabbitmq_exchange_test(self):
        raw = {}
        result = normalize_event_type(
            raw, exchange_name="wh.whk01.distillery01.test"
        )
        assert result == "quality.event"

    def test_unknown_fallback(self):
        raw = {}
        assert normalize_event_type(raw) == "unknown"

    def test_compound_key_with_colons(self):
        raw = {"event_type": "StepExecution::step_started"}
        result = normalize_event_type(raw)
        assert result == "step.started"

    def test_case_insensitive(self):
        raw = {"event_type": "BATCH_STATUS_CHANGED"}
        assert normalize_event_type(raw) == "batch.status_changed"


class TestExtractEquipmentFromTopic:
    """Test MQTT topic -> equipment_id extraction (enrichment rule 3)."""

    def test_standard_pattern(self):
        topic = "mes/equipment/MASH-TUN-01/events"
        assert extract_equipment_from_topic(topic) == "MASH-TUN-01"

    def test_production_prefix(self):
        topic = "production/equipment/STILL-02/events"
        assert extract_equipment_from_topic(topic) == "STILL-02"

    def test_no_match(self):
        topic = "some/other/topic/path"
        assert extract_equipment_from_topic(topic) is None

    def test_nested_events_subpath(self):
        topic = "mes/equipment/FERM-TANK-03/events/temperature"
        assert extract_equipment_from_topic(topic) == "FERM-TANK-03"

    def test_case_insensitive(self):
        topic = "MES/Equipment/COOKER-01/events"
        assert extract_equipment_from_topic(topic) == "COOKER-01"


class TestBuildRecordContext:
    """Test the full context builder."""

    def test_returns_record_context(self):
        raw = {
            "batch_id": "BATCH-001",
            "production_order_id": "PRO-001",
            "recipe_id": "RCP-001",
            "equipment_id": "EQ-001",
            "timestamp": "2026-04-06T14:30:00Z",
            "event_type": "batch_started",
        }
        ctx = build_record_context(raw)
        assert ctx is not None

    def test_equipment_id(self):
        raw = {"equipment_id": "MASH-TUN-01", "timestamp": "2026-04-06T14:30:00Z"}
        ctx = build_record_context(raw)
        assert ctx.equipment_id == "MASH-TUN-01"

    def test_batch_id(self):
        raw = {"batchId": "B-001", "timestamp": "2026-04-06T14:30:00Z"}
        ctx = build_record_context(raw)
        assert ctx.batch_id == "B-001"

    def test_lot_id(self):
        raw = {"lotId": "LOT-001", "timestamp": "2026-04-06T14:30:00Z"}
        ctx = build_record_context(raw)
        assert ctx.lot_id == "LOT-001"

    def test_shift_enrichment(self):
        raw = {"batch_id": "B-001", "timestamp": "2026-04-06T14:30:00Z"}
        ctx = build_record_context(raw)
        assert ctx.shift in ("day", "night")

    def test_event_type_in_extra(self):
        raw = {
            "batch_id": "B-001",
            "event_type": "batch_started",
            "timestamp": "2026-04-06T14:30:00Z",
        }
        ctx = build_record_context(raw)
        assert ctx.extra.get("event_type") == "batch.started"

    def test_production_order_in_extra(self):
        raw = {"productionOrderId": "PRO-001", "timestamp": "2026-04-06T14:30:00Z"}
        ctx = build_record_context(raw)
        assert ctx.extra.get("production_order_id") == "PRO-001"

    def test_recipe_id_from_nested(self):
        raw = {"recipe": {"id": "RCP-042"}, "timestamp": "2026-04-06T14:30:00Z"}
        ctx = build_record_context(raw)
        assert ctx.recipe_id == "RCP-042"

    def test_equipment_from_mqtt_topic(self):
        raw = {"timestamp": "2026-04-06T14:30:00Z"}
        ctx = build_record_context(raw, mqtt_topic="mes/equipment/STILL-01/events")
        assert ctx.equipment_id == "STILL-01"

    def test_z_suffix_timestamp(self):
        raw = {"batch_id": "B-001", "timestamp": "2026-04-06T14:30:00Z"}
        ctx = build_record_context(raw)
        assert ctx.extra.get("event_timestamp") is not None

    def test_empty_event(self):
        ctx = build_record_context({})
        assert ctx is not None
        assert ctx.site == "WHK-Distillery"

    def test_operator_from_user_id(self):
        raw = {"userId": "USR-023", "timestamp": "2026-04-06T14:30:00Z"}
        ctx = build_record_context(raw)
        assert ctx.operator_id == "USR-023"

    def test_whiskey_type_in_extra(self):
        raw = {
            "whiskeyType": "Wheated Bourbon",
            "batch_id": "B-001",
            "timestamp": "2026-04-06T14:30:00Z",
        }
        ctx = build_record_context(raw)
        assert ctx.extra.get("whiskey_type") == "Wheated Bourbon"

    def test_equipment_phase_in_extra(self):
        raw = {
            "equipment_phase": "Mashing",
            "batch_id": "B-001",
            "timestamp": "2026-04-06T14:30:00Z",
        }
        ctx = build_record_context(raw)
        assert ctx.extra.get("equipment_phase") == "Mashing"

    def test_process_step_in_extra(self):
        raw = {
            "processStep": "Saccharification Rest",
            "batch_id": "B-001",
            "timestamp": "2026-04-06T14:30:00Z",
        }
        ctx = build_record_context(raw)
        assert ctx.extra.get("process_step") == "Saccharification Rest"

    def test_material_id_in_extra(self):
        raw = {"itemId": "ITEM-001", "batch_id": "B-001", "timestamp": "2026-04-06T14:30:00Z"}
        ctx = build_record_context(raw)
        assert ctx.extra.get("material_id") == "ITEM-001"

    def test_quality_result_in_extra(self):
        raw = {"testId": "TEST-001", "batch_id": "B-001", "timestamp": "2026-04-06T14:30:00Z"}
        ctx = build_record_context(raw)
        assert ctx.extra.get("quality_result_id") == "TEST-001"

    def test_work_order_aliases_production_order(self):
        raw = {"production_order_id": "PRO-001", "timestamp": "2026-04-06T14:30:00Z"}
        ctx = build_record_context(raw)
        assert ctx.extra.get("work_order_id") == "PRO-001"

    def test_nested_equipment_phase_name(self):
        raw = {
            "equipmentPhase": {"name": "Fermentation", "equipment": {"id": "FERM-01"}},
            "timestamp": "2026-04-06T14:30:00Z",
        }
        ctx = build_record_context(raw)
        assert ctx.extra.get("equipment_phase") == "Fermentation"
        assert ctx.equipment_id == "FERM-01"

    def test_event_type_from_rabbitmq_exchange(self):
        raw = {"batch_id": "B-001", "timestamp": "2026-04-06T14:30:00Z"}
        ctx = build_record_context(raw, exchange_name="wh.whk01.distillery01.equipmentphase")
        assert ctx.extra.get("event_type") == "phase.event"

    def test_schedule_order_id_in_extra(self):
        raw = {
            "scheduleOrderId": "SO-001",
            "batch_id": "B-001",
            "timestamp": "2026-04-06T14:30:00Z",
        }
        ctx = build_record_context(raw)
        assert ctx.extra.get("schedule_order_id") == "SO-001"
