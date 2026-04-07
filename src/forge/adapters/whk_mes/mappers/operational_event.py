"""Map MES StepExecution + ProductionEvent -> Forge OperationalEvent.

MES has two main event sources:

1. StepExecution (ISA-88 phase/step context):
    id, status, stepIndex, startedAt, completedAt, pausedAt,
    assetId, operatorId, notes

2. ProductionEvent (domain events published via MQTT/RabbitMQ):
    id, eventType, severity, phase, category, batchId, assetId,
    timestamp, payload

Both map to Forge OperationalEvent with different entity_type values.

Forge OperationalEvent fields:
    event_type, event_subtype, category, severity, entity_type,
    entity_id, asset_id, operator_id, event_time, result,
    work_order_id + provenance envelope
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from forge.core.models.manufacturing.enums import EventCategory, EventSeverity
from forge.core.models.manufacturing.operational_event import OperationalEvent

logger = logging.getLogger(__name__)

_SOURCE_SYSTEM = "whk-mes"

# StepExecution status -> Forge EventCategory
_STEP_STATUS_TO_CATEGORY: dict[str, EventCategory] = {
    "STARTED": EventCategory.PRODUCTION,
    "RUNNING": EventCategory.PRODUCTION,
    "PAUSED": EventCategory.PRODUCTION,
    "HELD": EventCategory.PRODUCTION,
    "RESUMED": EventCategory.PRODUCTION,
    "COMPLETED": EventCategory.PRODUCTION,
    "ABORTED": EventCategory.PRODUCTION,
}

# MES event category string -> Forge EventCategory
_EVENT_CATEGORY_MAP: dict[str, EventCategory] = {
    "PRODUCTION": EventCategory.PRODUCTION,
    "QUALITY": EventCategory.QUALITY,
    "EQUIPMENT": EventCategory.MAINTENANCE,
    "LOGISTICS": EventCategory.LOGISTICS,
    "SAFETY": EventCategory.SAFETY,
    "COMPLIANCE": EventCategory.COMPLIANCE,
    "MAINTENANCE": EventCategory.MAINTENANCE,
}

# MES severity string -> Forge EventSeverity
_SEVERITY_MAP: dict[str, EventSeverity] = {
    "INFO": EventSeverity.INFO,
    "INFORMATION": EventSeverity.INFO,
    "WARNING": EventSeverity.WARNING,
    "WARN": EventSeverity.WARNING,
    "ERROR": EventSeverity.ERROR,
    "CRITICAL": EventSeverity.CRITICAL,
    "ALERT": EventSeverity.CRITICAL,
}


def map_step_event(raw: dict[str, Any]) -> OperationalEvent | None:
    """Map an MES StepExecution dict to a Forge OperationalEvent.

    Returns None if the step execution id is missing.
    """
    step_id = raw.get("id") or raw.get("step_execution_id") or raw.get("stepExecutionId")
    if not step_id:
        logger.warning("StepExecution dict missing id -- skipping: %s", raw)
        return None

    status = str(raw.get("status", "")).upper()

    # Extract event time from the most appropriate timestamp
    event_time = _parse_time(
        raw.get("startedAt")
        or raw.get("started_at")
        or raw.get("completedAt")
        or raw.get("completed_at")
        or raw.get("timestamp")
        or raw.get("createdAt")
    )
    if event_time is None:
        event_time = datetime.now(tz=timezone.utc)
    # Determine the entity this step belongs to
    batch_id = raw.get("batchId") or raw.get("batch_id")
    entity_type = "batch" if batch_id else "step_execution"
    entity_id = str(batch_id or step_id)

    return OperationalEvent(
        source_system=_SOURCE_SYSTEM,
        source_id=str(step_id),
        event_type=f"step_{status.lower()}" if status else "step_event",
        event_subtype=raw.get("stepName") or raw.get("step_name"),
        category=_STEP_STATUS_TO_CATEGORY.get(status, EventCategory.PRODUCTION),
        severity=EventSeverity.INFO,
        entity_type=entity_type,
        entity_id=entity_id,
        asset_id=_str_or_none(raw.get("assetId") or raw.get("asset_id")),
        operator_id=_str_or_none(raw.get("operatorId") or raw.get("operator_id")),
        event_time=event_time,
        result=raw.get("notes") or raw.get("result"),
        work_order_id=_str_or_none(
            raw.get("productionOrderId") or raw.get("production_order_id")
        ),
        metadata={
            k: v
            for k, v in {
                "step_index": raw.get("stepIndex") or raw.get("step_index"),
                "equipment_phase": raw.get("equipmentPhase") or raw.get("equipment_phase"),
                "paused_at": raw.get("pausedAt") or raw.get("paused_at"),
            }.items()
            if v is not None
        },
    )


def map_production_event(raw: dict[str, Any]) -> OperationalEvent | None:
    """Map an MES ProductionEvent dict to a Forge OperationalEvent.

    Returns None if the event id is missing.
    """
    event_id = raw.get("id") or raw.get("event_id") or raw.get("eventId")
    if not event_id:
        logger.warning("ProductionEvent dict missing id -- skipping: %s", raw)
        return None

    event_type_raw = str(
        raw.get("eventType") or raw.get("event_type") or "unknown"
    )
    category_raw = str(raw.get("category") or raw.get("phase") or "").upper()
    severity_raw = str(raw.get("severity") or "INFO").upper()

    event_time = _parse_time(
        raw.get("timestamp") or raw.get("createdAt") or raw.get("created_at")
    )
    if event_time is None:
        event_time = datetime.now(tz=timezone.utc)
    # Entity association
    batch_id = raw.get("batchId") or raw.get("batch_id")
    production_order_id = raw.get("productionOrderId") or raw.get("production_order_id")
    entity_type = "batch" if batch_id else "production_order" if production_order_id else "event"
    entity_id = str(batch_id or production_order_id or event_id)

    return OperationalEvent(
        source_system=_SOURCE_SYSTEM,
        source_id=str(event_id),
        event_type=event_type_raw,
        event_subtype=raw.get("subType") or raw.get("sub_type"),
        category=_EVENT_CATEGORY_MAP.get(category_raw, EventCategory.PRODUCTION),
        severity=_SEVERITY_MAP.get(severity_raw, EventSeverity.INFO),
        entity_type=entity_type,
        entity_id=entity_id,
        asset_id=_str_or_none(raw.get("assetId") or raw.get("asset_id")),
        operator_id=_str_or_none(raw.get("userId") or raw.get("user_id")),
        event_time=event_time,
        result=raw.get("result") or raw.get("payload"),
        work_order_id=_str_or_none(production_order_id),
        metadata={
            k: v
            for k, v in {
                "phase": raw.get("phase"),
                "equipment_phase": raw.get("equipmentPhase") or raw.get("equipment_phase"),
                "mqtt_topic": raw.get("mqtt_topic") or raw.get("mqttTopic"),
            }.items()
            if v is not None
        },
    )


def _parse_time(val: Any) -> datetime | None:
    """Parse a datetime value from string or datetime."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    if isinstance(val, str):
        try:
            return datetime.fromisoformat(val.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return None
    return None


def _str_or_none(val: Any) -> str | None:
    return str(val) if val else None
