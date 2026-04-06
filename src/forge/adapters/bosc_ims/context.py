"""Context builder for the BOSC IMS adapter.

Transforms BOSC IMS TransactionEvents and domain entities into
Forge RecordContext objects. Unlike the WMS/MES adapters that parse
JSON dicts, BOSC IMS events arrive as typed dict representations
of protobuf messages — fields are already well-structured.

The context builder extracts the six mandatory context fields
declared in the FACTS spec (asset_id, event_type, location_id,
part_id, disposition, actor_id) plus optional enrichment fields.
"""

from __future__ import annotations

from typing import Any

from forge.core.models.contextual_record import RecordContext

# ── Transaction type mapping ──────────────────────────────────────
# Maps BOSC's TransactionType enum names to Forge-normalized event types.
_TRANSACTION_TYPE_MAP: dict[str, str] = {
    "TRANSACTION_TYPE_ASSET_RECEIVED": "asset.received",
    "TRANSACTION_TYPE_ASSET_MOVED": "asset.moved",
    "TRANSACTION_TYPE_QUALITY_CHECK_PASSED": "quality.passed",
    "TRANSACTION_TYPE_QUALITY_CHECK_FAILED": "quality.failed",
    "TRANSACTION_TYPE_ASSET_CONSUMED": "asset.consumed",
    "TRANSACTION_TYPE_INSTALLED": "asset.installed",
    "TRANSACTION_TYPE_REMOVED": "asset.removed",
    "TRANSACTION_TYPE_DERIVED": "asset.derived",
    "TRANSACTION_TYPE_DISPOSITION_CHANGED": "state.disposition_changed",
    "TRANSACTION_TYPE_SYSTEM_STATE_CHANGED": "state.system_changed",
    "TRANSACTION_TYPE_ASSET_STATE_CHANGED": "state.asset_changed",
    "TRANSACTION_TYPE_LOCATION_UPDATED": "asset.location_updated",
    "TRANSACTION_TYPE_REMOVAL_INITIATED": "removal.initiated",
    "TRANSACTION_TYPE_REMOVAL_APPROVED": "removal.approved",
    "TRANSACTION_TYPE_CASCADE_REVIEW": "removal.cascade_review",
    "TRANSACTION_TYPE_NOTIFICATION_SENT": "notification.sent",
    "TRANSACTION_TYPE_SCAN_REJECTED": "scan.rejected",
    "TRANSACTION_TYPE_SHIPPED": "asset.shipped",
}


def _normalize_event_type(raw_type: str | int | None) -> str:
    """Normalize a BOSC TransactionType to a Forge event type string.

    Handles both string enum names and integer values.
    """
    if raw_type is None:
        return "unknown"

    if isinstance(raw_type, int):
        # Proto3 integer enum — look up by constructing the expected name
        for name, forge_type in _TRANSACTION_TYPE_MAP.items():
            # Integer values are positional in the proto enum
            if raw_type == list(_TRANSACTION_TYPE_MAP.keys()).index(name) + 1:
                return forge_type
        return f"unknown.{raw_type}"

    raw_str = str(raw_type)
    if raw_str in _TRANSACTION_TYPE_MAP:
        return _TRANSACTION_TYPE_MAP[raw_str]

    # Try stripping common prefixes
    for prefix in ("TRANSACTION_TYPE_", ""):
        prefixed = f"TRANSACTION_TYPE_{raw_str}" if prefix == "" else raw_str
        if prefixed in _TRANSACTION_TYPE_MAP:
            return _TRANSACTION_TYPE_MAP[prefixed]

    return f"unknown.{raw_str.lower()}"


def _extract_payload_fields(event: dict[str, Any]) -> dict[str, Any]:
    """Extract domain-specific fields from the event payload.

    BOSC IMS uses google.protobuf.Any for the payload field, which
    when serialized to dict contains a @type URL and the message fields.
    """
    payload = event.get("payload", {})
    if isinstance(payload, dict):
        # Remove the protobuf @type URL — we don't need it in context
        return {k: v for k, v in payload.items() if k != "@type"}
    return {}


def build_record_context(
    event: dict[str, Any],
    *,
    asset: dict[str, Any] | None = None,
) -> RecordContext:
    """Build a RecordContext from a BOSC IMS TransactionEvent dict.

    Args:
        event: Dict representation of a bosc.v1.TransactionEvent.
        asset: Optional dict representation of the associated Asset,
               used to enrich context with current state information.

    Returns:
        A RecordContext populated with the mandatory and optional fields.
    """
    # ── Mandatory context fields (from FACTS spec) ────────────────
    asset_id = event.get("asset_id", "")
    event_type = _normalize_event_type(event.get("event_type"))
    actor_id = event.get("actor_id", "")

    # Asset-level fields (from the Asset if provided, or payload)
    payload_fields = _extract_payload_fields(event)

    location_id = ""
    part_id = ""
    disposition = ""

    if asset:
        location_id = asset.get("current_location_id", "")
        part_id = asset.get("part_id", "") or asset.get("part_number", "")
        disposition = asset.get("disposition", "")
    else:
        location_id = payload_fields.get("location_id", "")
        part_id = payload_fields.get("part_id", "")
        disposition = payload_fields.get("disposition", "")

    # ── Security context ──────────────────────────────────────────
    security = event.get("security_context", {}) or {}
    actor_role = security.get("actor_role", "")
    station_id = security.get("source_station_id", "")
    spoke_id = security.get("source_spoke_id", "")

    # ── Optional enrichment ───────────────────────────────────────
    system_state = ""
    asset_state = ""
    if asset:
        system_state = asset.get("system_state", "")
        asset_state = asset.get("asset_state", "")

    # ── Build extra dict for adapter-specific context ─────────────
    extra: dict[str, Any] = {}
    extra["asset_id"] = asset_id
    extra["event_type"] = event_type
    extra["actor_id"] = actor_id
    extra["disposition"] = disposition

    if event.get("event_id"):
        extra["event_id"] = event["event_id"]
    if event.get("reason_code"):
        extra["reason_code"] = event["reason_code"]
    if event.get("reason_description"):
        extra["reason_description"] = event["reason_description"]
    if event.get("schema_version"):
        extra["schema_version"] = event["schema_version"]
    if actor_role:
        extra["actor_role"] = actor_role
    if spoke_id:
        extra["source_spoke_id"] = spoke_id
    if system_state:
        extra["system_state"] = system_state
    if asset_state:
        extra["asset_state"] = asset_state

    # Merge payload fields into extra
    for key, value in payload_fields.items():
        if key not in extra and value:
            extra[key] = value

    return RecordContext(
        equipment_id=station_id or None,
        area=location_id or None,
        site=spoke_id or None,
        batch_id=part_id or None,
        lot_id=payload_fields.get("lot_id") or None,
        operator_id=actor_id or None,
        extra=extra,
    )
