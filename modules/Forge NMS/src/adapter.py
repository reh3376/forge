"""WHK NMS Adapter — REST polling + WebSocket streaming for network management.

This adapter integrates the Whiskey House Network Management System (NMS)
with Forge, providing network infrastructure visibility to manufacturing
decision-making. It collects device inventory, network topology, SNMP traps,
security events, baseline anomalies, and SPOF detections.

Architecture:
    Primary: REST polling on 13 endpoints (devices, topology, events, alerts)
    Secondary: WebSocket subscription to /api/v1/events/stream for real-time
    events (traps, alerts, baseline anomalies)

Phase 1 is read-only: collect existing NMS entities, map payloads to
ContextualRecords, and forward to Forge hub via gRPC. No changes to
the NMS are required.

This adapter enables Forge to answer decision-quality questions like:
- "Which critical OT devices have baseline anomalies?"
- "What's the blast radius if this device fails?"
- "Which security events correlate with production downtime?"
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator

from forge.adapters.base.interface import (
    AdapterBase,
    BackfillProvider,
    DiscoveryProvider,
    SubscriptionProvider,
)
from forge.adapters.whk_nms.config import WhkNmsConfig
from forge.adapters.whk_nms.context import build_record_context
from forge.adapters.whk_nms.endpoints import NMS_REST_ENDPOINTS, NMS_WEBSOCKET_ENDPOINTS
from forge.adapters.whk_nms.mappers import (
    map_device,
    map_trap_event,
    map_alert,
    map_security_event,
    map_baseline_anomaly,
    map_spof_detection,
)
from forge.adapters.whk_nms.record_builder import build_contextual_record
from forge.core.models.adapter import (
    AdapterCapabilities,
    AdapterHealth,
    AdapterManifest,
    AdapterState,
    AdapterTier,
    ConnectionParam,
    DataContract,
)
from forge.core.models.contextual_record import ContextualRecord

logger = logging.getLogger(__name__)

_MANIFEST_PATH = Path(__file__).parent / "manifest.json"


def _load_manifest() -> AdapterManifest:
    raw = json.loads(_MANIFEST_PATH.read_text())
    return AdapterManifest(
        adapter_id=raw["adapter_id"],
        name=raw["name"],
        version=raw["version"],
        type=raw.get("type", "INGESTION"),
        protocol=raw["protocol"],
        tier=AdapterTier(raw["tier"]),
        capabilities=AdapterCapabilities(**raw.get("capabilities", {})),
        data_contract=DataContract(**raw.get("data_contract", {})),
        health_check_interval_ms=raw.get("health_check_interval_ms", 5000),
        connection_params=[
            ConnectionParam(**p) for p in raw.get("connection_params", [])
        ],
        auth_methods=raw.get("auth_methods", ["none"]),
        metadata=raw.get("metadata", {}),
    )


class WhkNmsAdapter(
    AdapterBase,
    SubscriptionProvider,
    BackfillProvider,
    DiscoveryProvider,
):
    """REST + WebSocket adapter for WHK NMS network infrastructure monitoring.

    Polls NMS REST endpoints for:
        - Devices (discovered_hosts + device_metadata)
        - Topology (interfaces, links from LLDP)
        - SNMP configuration and traps
        - Alerts and alert rules
        - Security events (from FortiAnalyzer)
        - SPOF detections and summaries
        - Baseline anomalies (suspicious/blocked devices)

    Subscribes to WebSocket for real-time events:
        - SNMP trap events
        - Alert triggers
        - Baseline anomalies
        - Device status changes

    Capabilities:
        read:      Yes — collect() yields ContextualRecords from REST polls + WebSocket
        write:     No  — NMS adapter is read-only in Phase 1
        subscribe: Yes — can subscribe to WebSocket event stream
        backfill:  Yes — can poll REST endpoints for historical data
        discover:  Yes — enumerates available endpoints and event types
    """

    manifest: AdapterManifest = _load_manifest()

    def __init__(self) -> None:
        super().__init__()
        self._config: WhkNmsConfig | None = None
        self._pending_records: list[dict[str, Any]] = []
        self._subscriptions: dict[str, dict[str, Any]] = {}
        self._last_healthy: datetime | None = None
        self._startup_time: datetime | None = None

    # ── Lifecycle ──────────────────────────────────────────────

    async def configure(self, params: dict[str, Any]) -> None:
        """Validate connection parameters and prepare for start().

        Does NOT open any connections — that happens in start().
        """
        self._config = WhkNmsConfig(**params)
        self._state = AdapterState.REGISTERED

    async def start(self) -> None:
        """Open REST + WebSocket connections and prepare for polling.

        In Phase 1 the adapter uses inject_records() for testing.
        Production REST polling and WebSocket streaming will use
        aio-httpx when the hub's event loop integration is ready.
        """
        if self._config is None:
            raise RuntimeError(
                "Adapter not configured — call configure() first"
            )
        self._state = AdapterState.CONNECTING
        # Phase 1: no live REST/WebSocket connections yet — records injected for testing
        # Phase 2 will add aio-httpx for REST polling and websockets for streaming
        self._state = AdapterState.HEALTHY
        self._last_healthy = datetime.now(tz=timezone.utc)
        self._startup_time = self._last_healthy
        logger.info(
            "whk-nms adapter started (phase 1: inject-only, %d rest endpoints, %d ws subscriptions defined)",
            len(NMS_REST_ENDPOINTS),
            len(NMS_WEBSOCKET_ENDPOINTS),
        )

    async def stop(self) -> None:
        """Graceful shutdown — close any open connections."""
        self._pending_records.clear()
        self._subscriptions.clear()
        self._state = AdapterState.STOPPED
        logger.info("whk-nms adapter stopped")

    async def health(self) -> AdapterHealth:
        """Return current health status and record counters."""
        uptime = 0.0
        if self._startup_time is not None:
            uptime = (datetime.now(tz=timezone.utc) - self._startup_time).total_seconds()
        return AdapterHealth(
            adapter_id=self.adapter_id,
            state=self._state,
            last_check=datetime.now(tz=timezone.utc),
            last_healthy=self._last_healthy,
            records_collected=self._records_collected,
            records_failed=self._records_failed,
            uptime_seconds=uptime,
        )

    # ── Collection ─────────────────────────────────────────────

    async def collect(self) -> AsyncIterator[ContextualRecord]:
        """Yield pending records collected from REST polling or WebSocket.

        In Phase 1, records are injected via inject_records(). Production
        Phase 2 will implement actual polling and subscription.
        """
        while self._pending_records:
            raw_record = self._pending_records.pop(0)
            entity_type = raw_record.get("entity_type", "network_device")
            event_type = raw_record.get("event_type", "unknown")

            # Build context
            context = build_record_context(
                raw_record,
                entity_type=entity_type,
                event_type=event_type,
            )

            # Build record
            record = build_contextual_record(
                raw_event=raw_record,
                context=context,
                adapter_id=self.adapter_id,
                adapter_version=self.manifest.version,
                entity_type=entity_type,
                event_type=event_type,
            )

            self._records_collected += 1
            yield record

    # ── Subscription (SubscriptionProvider) ────────────────────

    async def subscribe(self, topic: str) -> None:
        """Subscribe to a WebSocket topic.

        In Phase 1, subscriptions are tracked but not active. Phase 2 will
        implement actual WebSocket subscription.
        """
        if topic not in self._subscriptions:
            self._subscriptions[topic] = {}
            logger.info("whk-nms adapter subscribed to topic: %s", topic)

    async def unsubscribe(self, topic: str) -> None:
        """Unsubscribe from a WebSocket topic."""
        if topic in self._subscriptions:
            del self._subscriptions[topic]
            logger.info("whk-nms adapter unsubscribed from topic: %s", topic)

    # ── Backfill (BackfillProvider) ────────────────────────────

    async def backfill(
        self, entity_type: str, start_time: datetime, end_time: datetime
    ) -> AsyncIterator[ContextualRecord]:
        """Backfill historical data from REST API.

        In Phase 1, no backfill data is produced. Phase 2 will implement
        actual historical data retrieval via REST endpoints.
        """
        # Phase 2: query REST endpoints with time filter
        return
        yield  # Make this an async generator

    # ── Discovery (DiscoveryProvider) ───────────────────────────

    async def discover(self) -> dict[str, Any]:
        """Discover available data sources and entity types.

        Returns metadata about the 13 REST endpoints and 1 WebSocket
        subscription available in the NMS.
        """
        return {
            "adapter_id": self.adapter_id,
            "adapter_version": self.manifest.version,
            "rest_endpoints": [
                {
                    "entity_name": e.entity_name,
                    "path": e.path,
                    "method": e.method,
                    "is_paginated": e.is_paginated,
                    "forge_entity_type": e.forge_entity_type,
                    "collection_mode": e.collection_mode,
                    "description": e.description,
                }
                for e in NMS_REST_ENDPOINTS
            ],
            "websocket_endpoints": [
                {
                    "entity_name": e.entity_name,
                    "path": e.path,
                    "forge_entity_type": e.forge_entity_type,
                    "description": e.description,
                }
                for e in NMS_WEBSOCKET_ENDPOINTS
            ],
            "total_rest_endpoints": len(NMS_REST_ENDPOINTS),
            "total_websocket_endpoints": len(NMS_WEBSOCKET_ENDPOINTS),
        }

    # ── Testing Support ───────────────────────────────────────

    async def get_earliest_timestamp(self, tag: str) -> datetime | None:
        """Return the earliest available timestamp for a tag.

        In Phase 1, this is not implemented. Phase 2 will query the NMS
        database for earliest available data for a given tag.
        """
        return None

    def inject_records(self, raw_records: list[dict[str, Any]]) -> None:
        """Inject raw records for testing (Phase 1 development)."""
        self._pending_records.extend(raw_records)
        logger.debug("whk-nms adapter injected %d test records", len(raw_records))
