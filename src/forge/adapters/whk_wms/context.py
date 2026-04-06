"""WMS context mapper — transforms raw WMS events into RecordContext.

Implements the 11 context field mappings and 3 enrichment rules
defined in the whk-wms FACTS spec (context_mapping section):

Mandatory context fields:
    manufacturing_unit_id, lot_id, physical_asset_id,
    business_entity_id, event_timestamp, event_type

Optional context fields:
    work_order_id, shift_id, operator_id,
    warehouse_location_id, transfer_id, production_run_id

Enrichment rules:
    1. shift_id — derive from event_timestamp using Louisville shifts
    2. physical_asset_id — compose from warehouse topology fields
    3. event_type — normalize RabbitMQ exchange names to barrel.* types
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any
from zoneinfo import ZoneInfo

from forge.core.models.contextual_record import RecordContext

logger = logging.getLogger(__name__)

# Louisville timezone for shift enrichment
_LOUISVILLE_TZ = ZoneInfo("America/Kentucky/Louisville")

# Day shift runs 06:00-18:00 Louisville time per FACTS spec
_DAY_SHIFT_START_HOUR = 6
_DAY_SHIFT_END_HOUR = 18

# RabbitMQ exchange name → normalized Forge event type
# Covers the 22 warehouse entity exchanges documented in the FACTS spec
_EXCHANGE_TO_EVENT_TYPE: dict[str, str] = {
    "wh.whk01.distillery01.barrel": "barrel.state_change",
    "wh.whk01.distillery01.lot": "barrel.lot_update",
    "wh.whk01.distillery01.customer": "barrel.ownership_change",
    "wh.whk01.distillery01.warehouse": "barrel.location_update",
    "wh.whk01.distillery01.transfer": "barrel.transfer",
    "wh.whk01.distillery01.fill": "barrel.fill",
    "wh.whk01.distillery01.dump": "barrel.dump",
    "wh.whk01.distillery01.gauge": "barrel.gauge",
    "wh.whk01.distillery01.weight": "barrel.weight",
    "wh.whk01.distillery01.ownership": "barrel.ownership_change",
    "wh.whk01.distillery01.invoice": "barrel.invoice",
    "wh.whk01.distillery01.warehousejob": "barrel.work_order",
    "uns.barrel.state": "barrel.state_change",
    "print.jobs": "barrel.print_job",
    "print.status": "barrel.print_status",
    "print.queue": "barrel.print_queue",
}


def derive_shift(event_time: datetime) -> str:
    """Derive shift_id from event timestamp using Louisville time.

    WHK runs two 12-hour shifts:
        day:   06:00-18:00 America/Kentucky/Louisville
        night: 18:00-06:00 America/Kentucky/Louisville

    If the timestamp is timezone-naive, it is assumed UTC.
    """
    if event_time.tzinfo is None:
        event_time = event_time.replace(tzinfo=UTC)
    local_time = event_time.astimezone(_LOUISVILLE_TZ)
    hour = local_time.hour
    if _DAY_SHIFT_START_HOUR <= hour < _DAY_SHIFT_END_HOUR:
        return "day"
    return "night"


def compose_location(raw: dict[str, Any]) -> str | None:
    """Compose hierarchical physical_asset_id from warehouse topology.

    Format: {warehouse}-{building}-F{floor}-R{rick}-P{position}

    Returns None if the required warehouse field is missing.
    All sub-fields are optional and omitted segments are excluded.
    """
    warehouse = raw.get("warehouse") or raw.get("warehouse_id")
    if not warehouse:
        return None

    parts = [str(warehouse)]

    building = raw.get("building") or raw.get("building_id")
    if building:
        parts.append(str(building))

    floor_val = raw.get("floor") or raw.get("floor_number")
    if floor_val is not None:
        parts.append(f"F{floor_val}")

    rick = raw.get("rick") or raw.get("rick_number")
    if rick is not None:
        parts.append(f"R{rick}")

    position = raw.get("position") or raw.get("position_number")
    if position is not None:
        parts.append(f"P{position}")

    return "-".join(parts)


def normalize_event_type(
    raw: dict[str, Any],
    *,
    exchange_name: str | None = None,
) -> str:
    """Normalize event type from WMS data to Forge convention.

    Priority:
        1. Explicit event_type field in the raw data (GraphQL events)
        2. RabbitMQ exchange name → lookup table
        3. Fallback: "unknown"

    GraphQL events already carry explicit types — just prefix with
    "barrel." if not already prefixed. RabbitMQ exchange names are
    mapped via the lookup table defined in the FACTS spec.
    """
    explicit = raw.get("event_type") or raw.get("type")
    if explicit:
        explicit = str(explicit).lower().strip()
        if not explicit.startswith("barrel."):
            return f"barrel.{explicit}"
        return explicit

    if exchange_name:
        mapped = _EXCHANGE_TO_EVENT_TYPE.get(exchange_name.lower())
        if mapped:
            return mapped

    return "unknown"


def build_record_context(
    raw_event: dict[str, Any],
    *,
    exchange_name: str | None = None,
) -> RecordContext:
    """Build a RecordContext from a raw WMS event dict.

    Applies the 11 context field mappings and 3 enrichment rules
    from the FACTS spec context_mapping section.

    Args:
        raw_event: Raw dict from WMS (GraphQL result or RabbitMQ message).
        exchange_name: RabbitMQ exchange name (for event_type normalization).

    Returns:
        RecordContext with all available context fields populated.
    """
    # ── Enrichment rule 1: shift from event_timestamp ──────────
    event_ts_raw = raw_event.get("event_timestamp") or raw_event.get("timestamp")
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

    # ── Enrichment rule 2: physical_asset_id from location ─────
    location = compose_location(raw_event)

    # ── Enrichment rule 3: event_type normalization ────────────
    event_type = normalize_event_type(raw_event, exchange_name=exchange_name)

    # ── Direct field mappings (FACTS spec context_mapping) ─────
    # RecordContext named fields — check both snake_case and camelCase
    equipment_id = (
        raw_event.get("barrel_id")
        or raw_event.get("barrelId")
        or raw_event.get("manufacturing_unit_id")
    )
    lot_id = (
        raw_event.get("lot_id")
        or raw_event.get("lotId")
    )
    batch_id = raw_event.get("batch_id") or raw_event.get("batchId") or lot_id
    operator_id = (
        raw_event.get("operator_id")
        or raw_event.get("operatorId")
        or raw_event.get("user_id")
        or raw_event.get("userId")
        or raw_event.get("createdById")
    )
    recipe_id = (
        raw_event.get("recipe_id")
        or raw_event.get("recipeId")
        or raw_event.get("mashbill_id")
        or raw_event.get("mashbillId")
    )
    operating_mode = raw_event.get("operating_mode") or raw_event.get("operatingMode")
    area = (
        raw_event.get("area")
        or raw_event.get("warehouse_location_id")
        or raw_event.get("warehouseLocationId")
    )
    site = raw_event.get("site") or raw_event.get("warehouse")

    # ── Extra context fields (FACTS-specific, not in RecordContext) ──
    extra: dict[str, Any] = {}

    # Mandatory FACTS context fields that go into extra
    if equipment_id:
        extra["manufacturing_unit_id"] = equipment_id
    if location:
        extra["physical_asset_id"] = location
    customer_id = (
        raw_event.get("customer_id")
        or raw_event.get("customerId")
        or raw_event.get("business_entity_id")
    )
    if customer_id:
        extra["business_entity_id"] = customer_id
    if event_ts:
        extra["event_timestamp"] = event_ts.isoformat()
    if event_type != "unknown":
        extra["event_type"] = event_type

    # Optional FACTS context fields
    work_order_id = (
        raw_event.get("work_order_id")
        or raw_event.get("workOrderId")
        or raw_event.get("warehouse_job_id")
        or raw_event.get("warehouseJobId")
    )
    if work_order_id:
        extra["work_order_id"] = work_order_id
    warehouse_loc = (
        raw_event.get("warehouse_location_id")
        or raw_event.get("warehouseLocationId")
        or raw_event.get("warehouse_id")
        or raw_event.get("warehouseId")
    )
    if warehouse_loc:
        extra["warehouse_location_id"] = warehouse_loc
    transfer_id = raw_event.get("transfer_id") or raw_event.get("transferId")
    if transfer_id:
        extra["transfer_id"] = transfer_id
    production_run_id = (
        raw_event.get("production_run_id")
        or raw_event.get("productionRunId")
    )
    if production_run_id:
        extra["production_run_id"] = production_run_id

    return RecordContext(
        equipment_id=equipment_id,
        area=area,
        site=site,
        batch_id=batch_id,
        lot_id=lot_id,
        recipe_id=recipe_id,
        operating_mode=operating_mode,
        shift=shift,
        operator_id=operator_id,
        extra=extra,
    )
