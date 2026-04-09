"""WHK CMMS Adapter — hybrid GraphQL + RabbitMQ integration for maintenance management.

This adapter collects maintenance and equipment data from CMMS through two channels:
1. GraphQL polling (primary) — Work orders, assets, maintenance requests from CMMS native DB
2. RabbitMQ subscription (secondary) — Shared master data (items, vendors) from ERPI

CMMS is the system of record for all maintenance work. This adapter enables Forge to:
- Track equipment maintenance state and schedules
- Correlate maintenance windows with production orders (MES integration)
- Enrich maintenance records with master item data (from ERPI)
- Monitor maintenance approval workflows (governance)

Phase 1 is read-only: collect existing CMMS entities, map payloads to ContextualRecords,
and forward to Forge hub via gRPC. No changes to CMMS are required.
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
from forge.adapters.whk_cmms.config import WhkCmmsConfig
from forge.adapters.whk_cmms.context import build_record_context
from forge.adapters.whk_cmms.record_builder import build_contextual_record
from forge.adapters.whk_cmms.topics import (
    CMMS_GRAPHQL_ENTITIES,
    CMMS_RABBITMQ_TOPICS,
)
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


class WhkCmmsAdapter(
    AdapterBase,
    SubscriptionProvider,
    BackfillProvider,
    DiscoveryProvider,
):
    """Hybrid GraphQL + RabbitMQ adapter for WHK CMMS maintenance management.

    Polls CMMS GraphQL endpoint for:
        - Assets (equipment hierarchy)
        - WorkOrders (actual maintenance work)
        - WorkRequests (maintenance requests needing approval)
        - Kits (maintenance kits)
        - InventoryLocations, InventoryInvestigations

    Subscribes to RabbitMQ for shared master data:
        - Item, Vendor (from ERPI)
        - Inventory events (for stock reconciliation)

    Capabilities:
        read:      Yes — collect() yields ContextualRecords from GraphQL polls + RabbitMQ
        write:     No  — CMMS adapter is read-only in Phase 1
        subscribe: Yes — can subscribe to RabbitMQ master data topics
        backfill:  Yes — can query GraphQL for historical maintenance records
        discover:  Yes — enumerates available GraphQL entities and RabbitMQ topics
    """

    manifest: AdapterManifest = _load_manifest()

    def __init__(self) -> None:
        super().__init__()
        self._config: WhkCmmsConfig | None = None
        self._pending_records: list[dict[str, Any]] = []
        self._subscriptions: dict[str, dict[str, Any]] = {}
        self._last_healthy: datetime | None = None
        self._startup_time: datetime | None = None

    # ── Lifecycle ──────────────────────────────────────────────

    async def configure(self, params: dict[str, Any]) -> None:
        """Validate connection parameters and prepare for start().

        Does NOT open any connections — that happens in start().
        """
        self._config = WhkCmmsConfig(**params)
        self._state = AdapterState.REGISTERED

    async def start(self) -> None:
        """Open GraphQL + RabbitMQ connections and prepare for polling.

        In Phase 1 the adapter uses inject_records() for testing.
        Production GraphQL polling and RabbitMQ consumption will use
        aio-httpx and aio-pika when the hub's event loop integration is ready.
        """
        if self._config is None:
            raise RuntimeError(
                "Adapter not configured — call configure() first"
            )
        self._state = AdapterState.CONNECTING
        # Phase 1: no live GraphQL/RabbitMQ connections yet — records injected for testing
        # Phase 2 will add aio-httpx for GraphQL polling and aio-pika for RabbitMQ
        self._state = AdapterState.HEALTHY
        self._last_healthy = datetime.now(tz=timezone.utc)
        self._startup_time = self._last_healthy
        logger.info(
            "whk-cmms adapter started (phase 1: inject-only, %d graphql entities, %d rmq topics defined)",
            len(CMMS_GRAPHQL_ENTITIES),
            len(CMMS_RABBITMQ_TOPICS),
        )

    async def stop(self) -> None:
        """Graceful shutdown — close any open connections."""
        self._pending_records.clear()
        self._subscriptions.clear()
        self._state = AdapterState.STOPPED
        logger.info("whk-cmms adapter stopped")

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
        """Yield ContextualRecords from pending CMMS messages.

        Each pending record is a raw CMMS message dict (either from GraphQL
        poll or RabbitMQ subscription) with entity data and context fields.

        The adapter extracts CMMS-specific maintenance context
        (asset_path, work_order_type, priority, maintenance_status, etc.)
        as native context fields rather than leaving them buried in the payload.
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
                logger.exception("Failed to map CMMS event: %s", raw_event)
        self._pending_records.clear()

    # ── Testing Hook ───────────────────────────────────────────

    def inject_records(self, records: list[dict[str, Any]]) -> None:
        """Inject raw CMMS message dicts for deterministic testing.

        Each record should contain maintenance entity data:
        {
            "entity_type": "Asset" | "WorkOrder" | "WorkRequest" | ...,
            "event_type": "query" | "create" | "update",
            ... entity-specific fields (globalId, assetPath, status, etc.) ...
        }
        """
        self._pending_records = list(records)

    # ── SubscriptionProvider ───────────────────────────────────

    async def subscribe(
        self, tags: list[str], callback: Any
    ) -> str:
        """Subscribe to RabbitMQ master data topics.

        Tags use the CMMS RabbitMQ format: wh.whk01.distillery01.<entity>
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
        """Backfill historical data from CMMS GraphQL API.

        Phase 2 implementation: poll /graphql with date range filters
        and map responses to ContextualRecords.
        """
        # TODO(Phase 2): Implement GraphQL polling for historical data
        logger.warning(
            "whk-cmms backfill() stub called: tags=%s (Phase 2 required)",
            tags,
        )
        return
        yield  # type: ignore[misc]  # makes this an async generator

    async def get_earliest_timestamp(self, tag: str) -> datetime | None:
        """Query CMMS for the earliest record of a given entity type.

        Phase 2 implementation.
        """
        # TODO(Phase 2): Query CMMS GraphQL for earliest record
        return None

    # ── DiscoveryProvider ──────────────────────────────────────

    async def discover(self) -> list[dict[str, Any]]:
        """Enumerate available GraphQL entities and RabbitMQ topics.

        Returns all 11 GraphQL entities plus 7 RabbitMQ subscription topics
        with their query names, polling intervals, and collection modes.
        """
        items: list[dict[str, Any]] = []

        # GraphQL entities (primary)
        for entity in CMMS_GRAPHQL_ENTITIES:
            items.append(
                {
                    "tag_path": f"cmms.{entity.entity_name.lower()}",
                    "data_type": "graphql_entity",
                    "entity_type": entity.entity_name,
                    "graphql_query": entity.graphql_query_name,
                    "is_cmms_native": entity.is_cmms_native,
                    "description": entity.description,
                    "collection_mode": "poll",
                    "poll_interval_seconds": self._config.poll_interval_seconds
                    if self._config
                    else 60,
                }
            )

        # RabbitMQ topics (secondary)
        for topic in CMMS_RABBITMQ_TOPICS:
            items.append(
                {
                    "tag_path": topic.full_topic,
                    "data_type": "entity_event",
                    "entity_type": topic.topic_name,
                    "description": f"ERPI entity events for {topic.topic_name}",
                    "collection_mode": "subscribe",
                    "exchange_type": "fanout",
                }
            )

        return items
