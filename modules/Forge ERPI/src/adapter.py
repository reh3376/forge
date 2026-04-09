"""WHK ERPI Adapter — passive RabbitMQ consumer for ERP integration events.

This adapter subscribes to ERPI's 33 entity fanout exchanges and maps
incoming messages to ContextualRecords. It creates its own durable queues
(named forge-erpi-<entity>) without affecting existing ERPI consumers.

Phase 1 is read-only: consume existing RabbitMQ messages, map payloads
to ContextualRecords, and forward to Forge hub via gRPC. No changes to
whk-erpi are required.
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
from forge.adapters.whk_erpi.config import WhkErpiConfig
from forge.adapters.whk_erpi.context import build_record_context
from forge.adapters.whk_erpi.record_builder import build_contextual_record
from forge.adapters.whk_erpi.topics import ERPI_ENTITY_TOPICS, ERPI_ACK_TOPICS
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


class WhkErpiAdapter(
    AdapterBase,
    SubscriptionProvider,
    BackfillProvider,
    DiscoveryProvider,
):
    """Passive RabbitMQ consumer for WHK ERPI entity events.

    Subscribes to 33 entity fanout exchanges on wh.whk01.distillery01.*
    and 3 acknowledgment topics. Maps ERPI message envelopes to Forge
    ContextualRecords preserving cross-system IDs, transaction direction,
    and sync state.

    Capabilities:
        read:      Yes — collect() yields ContextualRecords from pending events
        write:     No  — ERPI adapter is read-only in Phase 1
        subscribe: Yes — can subscribe to specific entity topics
        backfill:  Yes — can poll REST/GraphQL API for historical data
        discover:  Yes — enumerates available entity topics
    """

    manifest: AdapterManifest = _load_manifest()

    def __init__(self) -> None:
        super().__init__()
        self._config: WhkErpiConfig | None = None
        self._pending_records: list[dict[str, Any]] = []
        self._subscriptions: dict[str, dict[str, Any]] = {}
        self._last_healthy: datetime | None = None
        self._startup_time: datetime | None = None

    # ── Lifecycle ──────────────────────────────────────────────

    async def configure(self, params: dict[str, Any]) -> None:
        """Validate connection parameters and prepare for start().

        Does NOT open any connections — that happens in start().
        """
        self._config = WhkErpiConfig(**params)
        self._state = AdapterState.REGISTERED

    async def start(self) -> None:
        """Open RabbitMQ connections and bind to entity exchanges.

        In Phase 1 the adapter uses inject_records() for testing.
        Production RabbitMQ consumption will use aio-pika when the
        hub's event loop integration is ready.
        """
        if self._config is None:
            raise RuntimeError(
                "Adapter not configured — call configure() first"
            )
        self._state = AdapterState.CONNECTING
        # Phase 1: no live RabbitMQ connection yet — records injected for testing
        # Phase 2 will add aio-pika consumer here
        self._state = AdapterState.HEALTHY
        self._last_healthy = datetime.now(tz=timezone.utc)
        self._startup_time = self._last_healthy
        logger.info(
            "whk-erpi adapter started (phase 1: inject-only, %d entity topics defined)",
            len(ERPI_ENTITY_TOPICS),
        )

    async def stop(self) -> None:
        """Graceful shutdown — close any open connections."""
        self._pending_records.clear()
        self._subscriptions.clear()
        self._state = AdapterState.STOPPED
        logger.info("whk-erpi adapter stopped")

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

    # ── Data Collection ────────────────────────────────────────

    async def collect(self) -> AsyncIterator[ContextualRecord]:
        """Yield ContextualRecords from pending RabbitMQ messages.

        Each pending record is a raw ERPI message envelope dict with
        the structure: {data: {event_type, recordName, data: <payload>}}.

        The adapter extracts the ERPI transaction fields (transactionInitiator,
        transactionStatus, transactionType) as native context fields rather
        than leaving them buried in the payload.
        """
        for raw_event in self._pending_records:
            try:
                context = build_record_context(raw_event)
                record = build_contextual_record(
                    raw_event=raw_event,
                    context=context,
                    adapter_id=self.adapter_id,
                    adapter_version=self.manifest.version,
                )
                self._records_collected += 1
                yield record
            except Exception:
                self._records_failed += 1
                logger.exception("Failed to map ERPI event: %s", raw_event)
        self._pending_records.clear()

    # ── Testing Hook ───────────────────────────────────────────

    def inject_records(self, records: list[dict[str, Any]]) -> None:
        """Inject raw ERPI message dicts for deterministic testing.

        Each record should match the ERPI RabbitMQ envelope schema:
        {
            "data": {
                "event_type": "create" | "update" | "delete",
                "recordName": "Item",
                "data": { ...entity payload with globalId, transactionInitiator, etc. },
                "messageId": "optional"
            },
            "options": { "headers": {}, "priority": 0 }
        }
        """
        self._pending_records = list(records)

    # ── SubscriptionProvider ───────────────────────────────────

    async def subscribe(
        self, tags: list[str], callback: Any
    ) -> str:
        """Subscribe to specific entity topic events.

        Tags use the ERPI topic format: wh.whk01.distillery01.<entity>
        """
        import uuid

        sub_id = str(uuid.uuid4())
        self._subscriptions[sub_id] = {
            "tags": tags,
            "callback": callback,
        }
        logger.info("Subscription %s created for %d tags", sub_id, len(tags))
        return sub_id

    async def unsubscribe(self, subscription_id: str) -> None:
        """Remove a subscription."""
        removed = self._subscriptions.pop(subscription_id, None)
        if removed:
            logger.info("Subscription %s removed", subscription_id)

    # ── BackfillProvider ───────────────────────────────────────

    async def backfill(
        self,
        tags: list[str],
        start: datetime,
        end: datetime,
        *,
        max_records: int | None = None,
    ) -> AsyncIterator[ContextualRecord]:
        """Backfill historical data from ERPI REST/GraphQL API.

        Phase 2 implementation: poll /api/<entity> with date filters
        and map responses to ContextualRecords.
        """
        # TODO(Phase 2): Implement REST/GraphQL polling for historical data
        logger.warning(
            "whk-erpi backfill() stub called: tags=%s (Phase 2 required)",
            tags,
        )
        return
        yield  # type: ignore[misc]  # makes this an async generator

    async def get_earliest_timestamp(self, tag: str) -> datetime | None:
        """Query ERPI for the earliest record of a given entity type.

        Phase 2 implementation.
        """
        # TODO(Phase 2): Query ERPI API for earliest record
        return None

    # ── DiscoveryProvider ──────────────────────────────────────

    async def discover(self) -> list[dict[str, Any]]:
        """Enumerate available entity topics and their metadata.

        Returns all 33 entity topics plus 3 acknowledgment topics
        with their routing patterns and collection modes.
        """
        items: list[dict[str, Any]] = []
        for topic in ERPI_ENTITY_TOPICS:
            items.append(
                {
                    "tag_path": topic.full_topic,
                    "data_type": "entity_event",
                    "entity_type": topic.entity_name,
                    "description": f"ERPI entity events for {topic.entity_name}",
                    "collection_mode": "subscribe",
                    "exchange_type": "fanout",
                }
            )
        for topic in ERPI_ACK_TOPICS:
            items.append(
                {
                    "tag_path": topic,
                    "data_type": "acknowledgment",
                    "description": f"ERPI acknowledgment topic: {topic}",
                    "collection_mode": "subscribe",
                    "exchange_type": "fanout",
                }
            )
        return items
