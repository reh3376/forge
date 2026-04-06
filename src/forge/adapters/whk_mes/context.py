"""MES context mapper -- transforms raw MES events into RecordContext.

Implements the 15 context field mappings and 3 enrichment rules
defined in the whk-mes FACTS spec (context_mapping section):

Mandatory context fields (6):
    production_order_id, batch_id, recipe_id,
    equipment_id, event_timestamp, event_type

Optional context fields (10):
    lot_id, shift_id, operator_id, schedule_order_id,
    work_order_id, whiskey_type, equipment_phase,
    process_step, quality_result_id, material_id

Enrichment rules (3):
    1. shift_id -- derive from event_timestamp using Louisville shifts
       (shared with WMS for cross-spoke consistency)
    2. event_type -- map MES domain events to normalized Forge identifiers
       (StepExecution::step_started -> step.started, etc.)
    3. equipment_id -- extract from MQTT topic path when processing
       raw equipment tag data (mes/equipment/{id}/events)
"""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime
from typing import Any
from zoneinfo import ZoneInfo

from forge.core.models.contextual_record import RecordContext

logger = logging.getLogger(__name__)

# Louisville timezone for shift enrichment (shared with WMS adapter)
_LOUISVILLE_TZ = ZoneInfo("America/Kentucky/Louisville")

# Day shift runs 06:00-18:00 Louisville time per FACTS spec
_DAY_SHIFT_START_HOUR = 6
_DAY_SHIFT_END_HOUR = 18

# MES domain event types -> normalized Forge event identifiers
# Covers the 30+ event types documented in the FACTS spec
_MES_EVENT_TO_FORGE: dict[str, str] = {
    # Step execution events
    "step_started": "step.started",
    "step_completed": "step.completed",
    "step_paused": "step.paused",
    "step_resumed": "step.resumed",
    "step_held": "step.held",
    "step_aborted": "step.aborted",
    # Phase events
    "phase_started": "phase.started",
    "phase_completed": "phase.completed",
    "phasecompleted": "phase.completed",
    "phasestarted": "phase.started",
    # Mashing events
    "mashing_started": "mashing.started",
    "mashing_completed": "mashing.completed",
    "mashing_step_completed": "mashing.step_completed",
    # Batch events
    "batch_created": "batch.created",
    "batch_started": "batch.started",
    "batch_completed": "batch.completed",
    "batch_status_changed": "batch.status_changed",
    "batchstatuschanged": "batch.status_changed",
    # Production events
    "production_order_created": "production.order_created",
    "production_order_started": "production.order_started",
    "production_order_completed": "production.order_completed",
    "schedule_order_queued": "production.schedule_queued",
    # Parameter events
    "parameter_override": "parameter.override",
    "parameter_recorded": "parameter.recorded",
    # Quality events
    "sample_taken": "quality.sample_taken",
    "test_completed": "quality.test_completed",
    "deviation_detected": "quality.deviation_detected",
    # Equipment events
    "equipment_state_changed": "equipment.state_changed",
    "changeover_started": "equipment.changeover_started",
    "changeover_completed": "equipment.changeover_completed",
    # Inventory events
    "material_consumed": "inventory.material_consumed",
    "material_received": "inventory.material_received",
    "inventory_transfer": "inventory.transfer",
}

# RabbitMQ exchange prefix for MES domain events
_MES_EXCHANGE_PREFIX = "wh.whk01.distillery01."

# RabbitMQ exchange name -> entity type for event normalization
_EXCHANGE_TO_ENTITY: dict[str, str] = {
    "productionorder": "production",
    "recipe": "recipe",
    "batch": "batch",
    "scheduleorder": "schedule",
    "equipmentphase": "phase",
    "phaseparameter": "parameter",
    "operation": "operation",
    "unitprocedure": "procedure",
    "item": "inventory",
    "itemreceipt": "inventory",
    "inventory": "inventory",
    "inventorytransfer": "inventory",
    "lot": "lot",
    "bom": "recipe",
    "bomitem": "recipe",
    "test": "quality",
    "testparameter": "quality",
    "purchaseorder": "procurement",
    "salesorder": "sales",
    "customer": "business",
    "vendor": "business",
    "whiskeytype": "recipe",
    "asset": "equipment",
    "barrel": "barrel",
    "barrelevent": "barrel",
}

# MQTT topic pattern for equipment ID extraction (enrichment rule 3)
_MQTT_EQUIPMENT_PATTERN = re.compile(
    r"(?:mes|production)/equipment/([^/]+)/",
    re.IGNORECASE,
)


def derive_shift(event_time: datetime) -> str:
    """Derive shift_id from event timestamp using Louisville time.

    WHK runs two 12-hour shifts:
        day:   06:00-18:00 America/Kentucky/Louisville
        night: 18:00-06:00 America/Kentucky/Louisville

    If the timestamp is timezone-naive, it is assumed UTC.

    This logic is identical to the WMS adapter for cross-spoke
    consistency -- both spokes use the same shift definitions.
    """
    if event_time.tzinfo is None:
        event_time = event_time.replace(tzinfo=UTC)
    local_time = event_time.astimezone(_LOUISVILLE_TZ)
    hour = local_time.hour
    if _DAY_SHIFT_START_HOUR <= hour < _DAY_SHIFT_END_HOUR:
        return "day"
    return "night"


def normalize_event_type(
    raw: dict[str, Any],
    *,
    exchange_name: str | None = None,
    mqtt_topic: str | None = None,
) -> str:
    """Normalize MES event type to Forge convention.

    Priority:
        1. Explicit event_type / type field in raw data
        2. EntityType::eventType compound key from MQTT publish rules
        3. RabbitMQ exchange name -> entity category
        4. Fallback: "unknown"

    MES event types use a richer vocabulary than WMS. The MQTT
    publish rules use a compound key (entityType_eventType) that
    maps to Forge's dot-separated convention.
    """
    # 1. Explicit event type from payload
    explicit = (
        raw.get("event_type")
        or raw.get("eventType")
        or raw.get("type")
    )
    if explicit:
        key = str(explicit).lower().strip().replace("::", "_").replace(" ", "_")
        mapped = _MES_EVENT_TO_FORGE.get(key)
        if mapped:
            return mapped
        # For compound keys like "stepexecution_step_started",
        # try just the event part after the entity prefix
        if "_" in key:
            # Split on first underscore to separate entity from event
            parts = key.split("_", 1)
            event_mapped = _MES_EVENT_TO_FORGE.get(parts[1])
            if event_mapped:
                return event_mapped
        # If not in lookup, return as-is with dots
        return key.replace("_", ".", 1) if "_" in key else key

    # 2. MQTT topic may carry event type info
    if mqtt_topic:
        # production/{entityType}/{eventType} pattern
        parts = mqtt_topic.strip("/").split("/")
        if len(parts) >= 3:
            event = parts[-1].lower()
            # Try event part directly first (most specific)
            mapped = _MES_EVENT_TO_FORGE.get(event)
            if mapped:
                return mapped
            # Try compound entity_event key
            entity = parts[-2].lower()
            compound = f"{entity}_{event}"
            mapped = _MES_EVENT_TO_FORGE.get(compound)
            if mapped:
                return mapped
            return f"{entity}.{event}"

    # 3. RabbitMQ exchange name -> entity category
    if exchange_name:
        name = exchange_name.lower()
        if name.startswith(_MES_EXCHANGE_PREFIX):
            entity_key = name[len(_MES_EXCHANGE_PREFIX):]
        else:
            entity_key = name
        category = _EXCHANGE_TO_ENTITY.get(entity_key)
        if category:
            return f"{category}.event"

    return "unknown"


def extract_equipment_from_topic(mqtt_topic: str) -> str | None:
    """Extract equipment ID from an MQTT topic path.

    Enrichment rule 3 from the FACTS spec: extract equipment_id
    from topic pattern 'mes/equipment/{equipment_id}/events'.

    Returns None if the topic doesn't match the expected pattern.
    """
    match = _MQTT_EQUIPMENT_PATTERN.search(mqtt_topic)
    if match:
        return match.group(1)
    return None


def build_record_context(
    raw_event: dict[str, Any],
    *,
    exchange_name: str | None = None,
    mqtt_topic: str | None = None,
) -> RecordContext:
    """Build a RecordContext from a raw MES event dict.

    Applies the 15 context field mappings and 3 enrichment rules
    from the FACTS spec context_mapping section.

    Args:
        raw_event: Raw dict from MES (GraphQL result, RabbitMQ msg, or MQTT).
        exchange_name: RabbitMQ exchange name (for event_type normalization).
        mqtt_topic: MQTT topic path (for equipment_id extraction + event_type).

    Returns:
        RecordContext with all available context fields populated.
    """
    # -- Enrichment rule 1: shift from event_timestamp ------------------
    event_ts_raw = (
        raw_event.get("event_timestamp")
        or raw_event.get("eventTimestamp")
        or raw_event.get("timestamp")
        or raw_event.get("createdAt")
    )
    event_ts: datetime | None = None
    shift: str | None = None
    if event_ts_raw:
        if isinstance(event_ts_raw, datetime):
            event_ts = event_ts_raw
        elif isinstance(event_ts_raw, str):
            try:
                event_ts = datetime.fromisoformat(
                    event_ts_raw.replace("Z", "+00:00")
                )
            except (ValueError, TypeError):
                logger.warning("Could not parse event_timestamp: %s", event_ts_raw)
        if event_ts:
            shift = derive_shift(event_ts)

    # -- Enrichment rule 2: event_type normalization --------------------
    event_type = normalize_event_type(
        raw_event,
        exchange_name=exchange_name,
        mqtt_topic=mqtt_topic,
    )

    # -- Enrichment rule 3: equipment_id from MQTT topic ----------------
    mqtt_equipment_id: str | None = None
    if mqtt_topic:
        mqtt_equipment_id = extract_equipment_from_topic(mqtt_topic)

    # -- Direct field mappings (FACTS spec context_mapping) -------------
    # Helper: safely extract from nested dict (MES GraphQL often nests)
    def _nested(obj_key: str, *path: str) -> Any:
        obj = raw_event.get(obj_key)
        if not isinstance(obj, dict):
            return None
        for key in path:
            if not isinstance(obj, dict):
                return None
            obj = obj.get(key)
        return obj

    # Mandatory context fields
    production_order_id = (
        raw_event.get("production_order_id")
        or raw_event.get("productionOrderId")
        or _nested("productionOrder", "id")
    )
    batch_id = (
        raw_event.get("batch_id")
        or raw_event.get("batchId")
        or _nested("batch", "id")
    )
    recipe_id = (
        raw_event.get("recipe_id")
        or raw_event.get("recipeId")
        or _nested("recipe", "id")
    )
    equipment_id = (
        mqtt_equipment_id
        or raw_event.get("equipment_id")
        or raw_event.get("equipmentId")
        or _nested("equipmentPhase", "equipment", "id")
    )

    # Optional context fields
    lot_id = raw_event.get("lot_id") or raw_event.get("lotId")
    operator_id = (
        raw_event.get("operator_id")
        or raw_event.get("operatorId")
        or raw_event.get("userId")
        or raw_event.get("user_id")
    )
    schedule_order_id = (
        raw_event.get("schedule_order_id")
        or raw_event.get("scheduleOrderId")
    )
    work_order_id = production_order_id  # aliases per FACTS spec
    whiskey_type = (
        raw_event.get("whiskey_type")
        or raw_event.get("whiskeyType")
        or raw_event.get("whiskey_type_name")
    )
    equipment_phase = (
        raw_event.get("equipment_phase")
        or raw_event.get("equipmentPhaseName")
        or _nested("equipmentPhase", "name")
    )
    process_step = (
        raw_event.get("process_step")
        or raw_event.get("processStep")
        or raw_event.get("step_name")
        or raw_event.get("stepName")
    )
    quality_result_id = (
        raw_event.get("quality_result_id")
        or raw_event.get("qualityResultId")
        or raw_event.get("test_id")
        or raw_event.get("testId")
    )
    material_id = (
        raw_event.get("material_id")
        or raw_event.get("materialId")
        or raw_event.get("item_id")
        or raw_event.get("itemId")
    )

    # RecordContext named fields
    site = raw_event.get("site") or raw_event.get("facility") or "WHK-Distillery"
    area = (
        raw_event.get("area")
        or equipment_phase
    )

    # -- Extra context fields (FACTS-specific, not in RecordContext) -----
    extra: dict[str, Any] = {}

    # Mandatory FACTS context fields -> extra
    if production_order_id:
        extra["production_order_id"] = production_order_id
    if batch_id:
        extra["batch_id"] = batch_id
    if recipe_id:
        extra["recipe_id"] = recipe_id
    if event_ts:
        extra["event_timestamp"] = event_ts.isoformat()
    if event_type != "unknown":
        extra["event_type"] = event_type

    # Optional FACTS context fields -> extra
    if schedule_order_id:
        extra["schedule_order_id"] = schedule_order_id
    if work_order_id:
        extra["work_order_id"] = work_order_id
    if whiskey_type:
        extra["whiskey_type"] = whiskey_type
    if equipment_phase:
        extra["equipment_phase"] = equipment_phase
    if process_step:
        extra["process_step"] = process_step
    if quality_result_id:
        extra["quality_result_id"] = quality_result_id
    if material_id:
        extra["material_id"] = material_id

    return RecordContext(
        equipment_id=equipment_id,
        area=area,
        site=site,
        batch_id=batch_id,
        lot_id=lot_id,
        recipe_id=recipe_id,
        shift=shift,
        operator_id=operator_id,
        extra=extra,
    )
