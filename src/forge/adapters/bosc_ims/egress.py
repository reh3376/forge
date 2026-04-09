"""Egress translation for the BOSC IMS adapter.

Handles both directions of the Hub ↔ BOSC IMS egress pipeline:

1. **BOSC → Hub (outbound)**: Filters TransactionEvents through the
   EgressPolicy (6 allowed types out of 18), wraps each in a
   HubEgressEvent envelope, and translates to ContextualRecords
   for the hub's governance pipeline.

2. **Hub → BOSC (inbound)**: Translates Hub intelligence events
   (predictive logistics, vendor alerts, global recalls) into
   BOSC-native HubIntelligenceEvent messages for the Go core.

The EgressPolicy mirrors the Go core's DefaultEgressPolicy exactly.
Any mismatch between the adapter's policy and the Go core's policy
would cause events to be filtered differently on each side — a
correctness violation that governance tests must catch.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)

logger = logging.getLogger(__name__)


# ── Egress Policy ────────────────────────────────────────────────

# These are the 6 TransactionTypes the Go core's DefaultEgressPolicy
# allows for outbound publication. Must stay in sync with
# internal/infrastructure/hub/egress.go:DefaultEgressPolicy().
ALLOWED_EGRESS_TYPES: frozenset[str] = frozenset({
    "TRANSACTION_TYPE_ASSET_RECEIVED",
    "TRANSACTION_TYPE_SHIPPED",
    "TRANSACTION_TYPE_DISPOSITION_CHANGED",
    "TRANSACTION_TYPE_DERIVED",
    "TRANSACTION_TYPE_INSTALLED",
    "TRANSACTION_TYPE_REMOVED",
})

# Forge-normalized versions of the allowed types (for tag matching)
ALLOWED_EGRESS_TAGS: frozenset[str] = frozenset({
    "asset.received",
    "asset.shipped",
    "state.disposition_changed",
    "asset.derived",
    "asset.installed",
    "asset.removed",
})


def should_egress(event_type: str | int | None) -> bool:
    """Check whether a TransactionType is allowed for egress.

    Mirrors BOSC IMS Go core's EgressPolicy.ShouldEgress().
    Returns True if the event type is in the allow-list.
    """
    if event_type is None:
        return False

    raw = str(event_type)

    # Direct match against TRANSACTION_TYPE_ enum name
    if raw in ALLOWED_EGRESS_TYPES:
        return True

    # Try with prefix
    prefixed = f"TRANSACTION_TYPE_{raw}"
    return prefixed in ALLOWED_EGRESS_TYPES


# ── Egress event wrapping ────────────────────────────────────────


def wrap_egress_event(
    event: dict[str, Any],
    *,
    spoke_id: str,
    spoke_version: str,
) -> dict[str, Any]:
    """Wrap a TransactionEvent in a HubEgressEvent envelope.

    Mirrors the Go core's wrapping logic in asset/service.go:
        wrapped := &boscv1.HubEgressEvent{
            EventId:      event.EventId,
            SpokeId:      s.spokeID,
            SpokeVersion: s.spokeVersion,
            InnerEvent:   event,
            EmittedAt:    timestamppb.Now(),
        }

    Returns:
        Dict representation of a HubEgressEvent.
    """
    return {
        "event_id": event.get("event_id", ""),
        "spoke_id": spoke_id,
        "spoke_version": spoke_version,
        "inner_event": event,
        "emitted_at": datetime.now(tz=UTC).isoformat(),
    }


def build_egress_record(
    egress_event: dict[str, Any],
    *,
    adapter_id: str,
    adapter_version: str,
    context: RecordContext | None = None,
) -> ContextualRecord:
    """Build a ContextualRecord from a HubEgressEvent.

    Used when the adapter receives a stream of egress events from
    the Go core (via StreamTransactionEvents) and needs to translate
    them into Forge ContextualRecords for the hub.

    Args:
        egress_event: Dict representation of HubEgressEvent.
        adapter_id: The adapter's identity string.
        adapter_version: The adapter's version string.
        context: Optional pre-built context. If None, builds minimal.

    Returns:
        A ContextualRecord carrying the egress event.
    """
    import json

    inner = egress_event.get("inner_event", {})
    spoke_id = egress_event.get("spoke_id", "")

    # Derive tag path from inner event type
    event_type = inner.get("event_type", "unknown")
    type_str = str(event_type)
    normalized = type_str.removeprefix("TRANSACTION_TYPE_").lower()
    tag_path = f"bosc.egress.{normalized}"

    # Parse timestamps
    emitted_raw = egress_event.get("emitted_at")
    occurred_raw = inner.get("occurred_at")
    now = datetime.now(tz=UTC)

    source_time = _parse_iso(occurred_raw) or now
    emit_time = _parse_iso(emitted_raw) or now

    if context is None:
        context = RecordContext(
            site=spoke_id or None,
            operator_id=inner.get("actor_id") or None,
            extra={
                "event_id": inner.get("event_id", ""),
                "event_type": normalized,
                "asset_id": inner.get("asset_id", ""),
                "spoke_id": spoke_id,
            },
        )

    return ContextualRecord(
        source=RecordSource(
            adapter_id=adapter_id,
            system="bosc-ims",
            tag_path=tag_path,
            connection_id=inner.get("asset_id"),
        ),
        timestamp=RecordTimestamp(
            source_time=source_time,
            server_time=emit_time,
            ingestion_time=now,
        ),
        value=RecordValue(
            raw=json.dumps(egress_event, default=str, ensure_ascii=False),
            quality=QualityCode.GOOD,
            data_type="json",
        ),
        context=context,
        lineage=RecordLineage(
            schema_ref="forge://schemas/bosc-ims/v0.1.0",
            adapter_id=adapter_id,
            adapter_version=adapter_version,
            transformation_chain=[
                "bosc.v1.HubEgressEvent",
                "bosc.v1.TransactionEvent",
                "forge.adapters.bosc_ims.egress.build_egress_record",
            ],
        ),
    )


# ── Hub intelligence translation (Hub → BOSC) ───────────────────

# Valid HubIntelligenceEvent types
INTELLIGENCE_TYPES: dict[str, int] = {
    "PREDICTIVE_LOGISTICS": 1,
    "VENDOR_ALERT": 2,
    "GLOBAL_RECALL": 3,
}


def build_intelligence_event(
    *,
    event_id: str,
    target_spoke_id: str,
    intelligence_type: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Build a HubIntelligenceEvent dict for delivery to BOSC IMS.

    Mirrors bosc.v1.HubIntelligenceEvent proto:
        message HubIntelligenceEvent {
          string event_id = 1;
          string target_spoke_id = 2;
          IntelligenceType type = 3;
          google.protobuf.Struct payload = 4;
          google.protobuf.Timestamp generated_at = 5;
        }

    Args:
        event_id: Unique identifier for this intelligence event.
        target_spoke_id: Which spoke this targets (e.g. "bosc_ims_primary").
        intelligence_type: One of PREDICTIVE_LOGISTICS, VENDOR_ALERT, GLOBAL_RECALL.
        payload: The intelligence data as a dict (maps to protobuf Struct).

    Returns:
        Dict representation of HubIntelligenceEvent.
    """
    type_value = INTELLIGENCE_TYPES.get(intelligence_type, 0)
    if type_value == 0:
        logger.warning(
            "Unknown intelligence type: %s", intelligence_type,
        )

    return {
        "event_id": event_id,
        "target_spoke_id": target_spoke_id,
        "type": type_value,
        "type_name": intelligence_type,
        "payload": payload,
        "generated_at": datetime.now(tz=UTC).isoformat(),
    }


# ── Helpers ──────────────────────────────────────────────────────


def _parse_iso(raw: Any) -> datetime | None:
    """Parse an ISO 8601 string, returning None on failure."""
    if raw is None:
        return None
    try:
        raw_str = str(raw).replace("Z", "+00:00")
        dt = datetime.fromisoformat(raw_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt
    except (ValueError, TypeError):
        return None
