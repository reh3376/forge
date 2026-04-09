"""BOSC IMS Adapter — the first gRPC-native Forge adapter.

Unlike the WMS/MES adapters that bridge GraphQL/REST/AMQP to Forge,
BOSC IMS already speaks binary protobuf via gRPC. This adapter
performs proto-to-proto translation: mapping bosc.v1 domain messages
to forge.v1 ContextualRecords.

Data flow:
    BOSC IMS Go Core (gRPC) → bosc.v1 messages → adapter translation
    → Forge core models → ContextualRecord → governance pipeline

The adapter connects to BOSC IMS's existing gRPC services:
  - AssetService (11 RPCs) — asset lifecycle operations
  - InventoryService (5 RPCs) — locations and receipts
  - ComplianceService (14 RPCs) — compliance records and graph queries
  - CatalogService (4 RPCs) — part catalog
  - SupplierService (4 RPCs) — supplier management
  - IntelligenceService (5 RPCs) — AI/ML model inference
  - StateMachineAdminService (6 RPCs) — state machine configuration
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from forge.adapters.base.interface import (
    AdapterBase,
    BackfillProvider,
    DiscoveryProvider,
    SubscriptionProvider,
)
from forge.adapters.bosc_ims.client import BoscImsClient, MockBoscImsClient
from forge.adapters.bosc_ims.collectors import (
    collect_events,
    collect_locations,
    collect_suppliers,
)
from forge.adapters.bosc_ims.config import BoscImsConfig
from forge.adapters.bosc_ims.context import build_record_context
from forge.adapters.bosc_ims.record_builder import (
    build_contextual_record,
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

logger = logging.getLogger(__name__)

# Load manifest from the co-located JSON file
_MANIFEST_PATH = Path(__file__).parent / "manifest.json"


def _load_manifest() -> AdapterManifest:
    """Load and parse the adapter manifest from manifest.json."""
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
        health_check_interval_ms=raw.get("health_check_interval_ms", 15_000),
        connection_params=[
            ConnectionParam(**p) for p in raw.get("connection_params", [])
        ],
        auth_methods=raw.get("auth_methods", ["none"]),
        metadata=raw.get("metadata", {}),
    )


class BoscImsAdapter(
    AdapterBase,
    SubscriptionProvider,
    BackfillProvider,
    DiscoveryProvider,
):
    """Forge adapter for the BOSC Inventory Management System.

    Ingests asset lifecycle events, compliance records, inventory data,
    and intelligence results from the BOSC IMS Go gRPC core. All data
    is mapped from bosc.v1 protobuf messages to Forge ContextualRecords.

    This is the first Forge adapter that connects via native gRPC rather
    than GraphQL/REST, reflecting BOSC IMS's proto-first architecture.
    """

    manifest: AdapterManifest = _load_manifest()

    def __init__(self) -> None:
        super().__init__()
        self._config: BoscImsConfig | None = None
        self._client: BoscImsClient | None = None
        self._subscriptions: dict[str, Any] = {}
        self._consecutive_failures: int = 0
        self._last_healthy: datetime | None = None
        self._last_event_timestamp: datetime | None = None

    # ── Client injection (for testing / production swap) ───────

    def set_client(self, client: BoscImsClient) -> None:
        """Inject a BoscImsClient implementation.

        In production, the hub injects a GrpcBoscImsClient with
        compiled bosc.v1 stubs. For testing, use MockBoscImsClient.
        """
        self._client = client

    # ── Lifecycle (AdapterBase) ─────────────────────────────────

    async def configure(self, params: dict[str, Any]) -> None:
        """Validate and store connection parameters.

        If no client has been injected via set_client(), creates a
        MockBoscImsClient as a fallback for testing/conformance.
        """
        self._config = BoscImsConfig(**params)
        if self._client is None:
            self._client = MockBoscImsClient()
        self._state = AdapterState.REGISTERED
        logger.info(
            "BOSC IMS adapter configured: target=%s, spoke_id=%s",
            self._config.target,
            self._config.spoke_id,
        )

    async def start(self) -> None:
        """Begin active operation — connect to BOSC IMS gRPC services.

        Calls the client's connect() method to establish the gRPC
        channel (or no-op for mock). Runs a health check to verify
        connectivity before transitioning to HEALTHY.
        """
        if self._config is None:
            msg = "Adapter not configured — call configure() first"
            raise RuntimeError(msg)

        self._state = AdapterState.CONNECTING
        await self._client.connect()

        healthy = await self._client.health_check()
        if healthy:
            self._state = AdapterState.HEALTHY
            self._last_healthy = datetime.now(tz=UTC)
        else:
            self._state = AdapterState.FAILED
            logger.error("BOSC IMS health check failed on startup")
            return

        logger.info(
            "BOSC IMS adapter started (state=%s, target=%s)",
            self._state,
            self._config.target,
        )

    async def stop(self) -> None:
        """Graceful shutdown — close gRPC channel and clear subscriptions."""
        if self._client is not None:
            await self._client.close()
        self._subscriptions.clear()
        self._state = AdapterState.STOPPED
        logger.info("BOSC IMS adapter stopped")

    async def health(self) -> AdapterHealth:
        """Return current health status.

        Performs a lightweight health check against the BOSC IMS
        server via the client. Tracks consecutive failures for
        degraded/failed state transitions.
        """
        if self._client is not None and self._state == AdapterState.HEALTHY:
            try:
                is_healthy = await self._client.health_check()
                if is_healthy:
                    self._consecutive_failures = 0
                    self._last_healthy = datetime.now(tz=UTC)
                else:
                    self._consecutive_failures += 1
                    if self._consecutive_failures >= 10:
                        self._state = AdapterState.FAILED
                    elif self._consecutive_failures >= 3:
                        self._state = AdapterState.DEGRADED
            except Exception:
                self._consecutive_failures += 1
                logger.exception("Health check failed")

        return AdapterHealth(
            adapter_id=self.adapter_id,
            state=self._state,
            last_healthy=self._last_healthy,
            records_collected=self._records_collected,
            records_failed=self._records_failed,
        )

    # ── Core read interface (AdapterBase) ───────────────────────

    async def collect(self):
        """Yield ContextualRecords from the BOSC IMS.

        Primary collection path: incremental event polling via the
        client. Events are fetched since the last collection watermark,
        each optionally enriched with the associated Asset's current
        three-dimensional state.

        Falls back to inject_records() data if no client events are
        available (backward compat with Phase 1 tests).
        """
        # Phase 2: Client-based collection
        if self._client is not None:
            has_yielded = False
            async for record in collect_events(
                self._client,
                adapter_id=self.adapter_id,
                adapter_version=self.manifest.version,
                since=self._last_event_timestamp,
                enrich_assets=True,
            ):
                self._records_collected += 1
                has_yielded = True
                # Track watermark for incremental collection
                if record.timestamp.source_time and (
                    self._last_event_timestamp is None
                    or record.timestamp.source_time
                    > self._last_event_timestamp
                ):
                    self._last_event_timestamp = (
                        record.timestamp.source_time
                    )
                yield record

            if has_yielded:
                return

        # Phase 1 fallback: injected records
        for raw_event in self._pending_records:
            try:
                asset = raw_event.pop("_asset", None)
                context = build_record_context(raw_event, asset=asset)
                record = build_contextual_record(
                    raw_event=raw_event,
                    context=context,
                    adapter_id=self.adapter_id,
                    adapter_version=self.manifest.version,
                    asset=asset,
                )
                self._records_collected += 1
                yield record

            except Exception:
                self._records_failed += 1
                logger.exception("Failed to map BOSC IMS event")

    async def collect_entities(self, entity_types: list[str] | None = None):
        """Yield ContextualRecords for entity snapshots.

        Used by the hub for discovery sync and periodic entity refresh.
        Fans out across BOSC IMS services based on requested entity types.

        Args:
            entity_types: Which entity types to collect. None = all.
                Valid values: 'locations', 'suppliers', 'assets', 'compliance'.
        """
        if self._client is None:
            return

        types = set(entity_types or ["locations", "suppliers"])

        if "locations" in types:
            async for record in collect_locations(
                self._client,
                adapter_id=self.adapter_id,
                adapter_version=self.manifest.version,
            ):
                self._records_collected += 1
                yield record

        if "suppliers" in types:
            async for record in collect_suppliers(
                self._client,
                adapter_id=self.adapter_id,
                adapter_version=self.manifest.version,
            ):
                self._records_collected += 1
                yield record

    def inject_records(self, records: list[dict[str, Any]]) -> None:
        """Inject raw BOSC IMS event data for testing/static collection."""
        self._pending_records = list(records)

    @property
    def _pending_records(self) -> list[dict[str, Any]]:
        return getattr(self, "_injected_records", [])

    @_pending_records.setter
    def _pending_records(self, value: list[dict[str, Any]]) -> None:
        self._injected_records = value

    # ── SubscriptionProvider ────────────────────────────────────

    async def subscribe(
        self,
        tags: list[str],
        callback: Any,
    ) -> str:
        """Subscribe to BOSC IMS event streams.

        In production this subscribes to the TransactionEvent stream
        from the Go core via a server-streaming gRPC RPC (Phase 3:
        StreamTransactionEvents). Tags correspond to event type filters
        (e.g. 'bosc.event.asset_received', 'bosc.event.shipped').
        """
        # TODO(P3-live): Subscribe to StreamTransactionEvents RPC
        #   with event_type filters derived from tag paths.
        import uuid

        sub_id = str(uuid.uuid4())
        self._subscriptions[sub_id] = {
            "tags": tags,
            "callback": callback,
        }
        logger.info("BOSC IMS subscription %s: tags=%s", sub_id, tags)
        return sub_id

    async def unsubscribe(self, subscription_id: str) -> None:
        """Cancel a subscription."""
        self._subscriptions.pop(subscription_id, None)

    # ── BackfillProvider ────────────────────────────────────────

    async def backfill(
        self,
        tags: list[str],
        start: datetime,
        end: datetime,
        *,
        max_records: int | None = None,
    ):
        """Retrieve historical BOSC IMS events for the given time range.

        Uses the client to fetch events within the specified window.
        For entity tags (locations, suppliers), performs a full snapshot.
        """
        if self._client is None:
            return
            yield

        # Event backfill
        event_tags = [t for t in tags if t.startswith("bosc.event.")]
        if event_tags:
            async for record in collect_events(
                self._client,
                adapter_id=self.adapter_id,
                adapter_version=self.manifest.version,
                since=start,
                limit=max_records or 1000,
                enrich_assets=True,
            ):
                if record.timestamp.source_time <= end:
                    yield record

        # Entity backfill
        entity_tags = [t for t in tags if not t.startswith("bosc.event.")]
        if entity_tags:
            entity_types = []
            for tag in entity_tags:
                if "location" in tag:
                    entity_types.append("locations")
                elif "supplier" in tag:
                    entity_types.append("suppliers")
            if entity_types:
                async for record in self.collect_entities(entity_types):
                    yield record

    async def get_earliest_timestamp(self, tag: str) -> datetime | None:
        """Return earliest available timestamp for a tag.

        For BOSC IMS this is the oldest TransactionEvent's occurred_at.
        """
        if self._client is not None:
            events = await self._client.list_recent_events(limit=1)
            if events:
                raw_ts = events[0].get("occurred_at")
                if raw_ts:
                    from forge.adapters.bosc_ims.record_builder import (
                        _parse_timestamp,
                    )
                    return _parse_timestamp(raw_ts)
        return None

    # ── DiscoveryProvider ───────────────────────────────────────

    async def discover(self) -> list[dict[str, Any]]:
        """Enumerate available BOSC IMS data sources.

        Returns the data sources corresponding to the 7 gRPC services
        and their key entity/event types. In production this would
        introspect the proto service definitions.
        """
        return [
            {
                "tag_path": "bosc.event.asset_received",
                "data_type": "event",
                "description": "Asset receipt events (new assets entering inventory)",
            },
            {
                "tag_path": "bosc.event.disposition_changed",
                "data_type": "event",
                "description": "Disposition state changes (QUARANTINED → SERVICEABLE, etc.)",
            },
            {
                "tag_path": "bosc.event.shipped",
                "data_type": "event",
                "description": "Asset shipment events (assets leaving the spoke)",
            },
            {
                "tag_path": "bosc.event.installed",
                "data_type": "event",
                "description": "Asset installation into parent assembly",
            },
            {
                "tag_path": "bosc.event.removed",
                "data_type": "event",
                "description": "Asset removal from parent assembly (severity-escalated)",
            },
            {
                "tag_path": "bosc.event.derived",
                "data_type": "event",
                "description": "Derived asset creation from multiple source lots",
            },
            {
                "tag_path": "bosc.event.quality_check",
                "data_type": "event",
                "description": "Quality check results (passed/failed with schema validation)",
            },
            {
                "tag_path": "bosc.event.state_change",
                "data_type": "event",
                "description": "System state or asset state changes",
            },
            {
                "tag_path": "bosc.event.scan",
                "data_type": "event",
                "description": "Scan events from mobile devices",
            },
            {
                "tag_path": "bosc.asset.snapshot",
                "data_type": "entity",
                "description": (
                    "Current asset state (three-dimensional:"
                    " disposition + system + asset)"
                ),
            },
            {
                "tag_path": "bosc.inventory.location",
                "data_type": "entity",
                "description": "Inventory locations (hierarchical: warehouse → aisle → rack → bin)",
            },
            {
                "tag_path": "bosc.inventory.receipt",
                "data_type": "entity",
                "description": "Receiving documents and line items",
            },
            {
                "tag_path": "bosc.catalog.part",
                "data_type": "entity",
                "description": "Part catalog entries with compliance profiles",
            },
            {
                "tag_path": "bosc.supplier",
                "data_type": "entity",
                "description": "Supplier entities (OEM, distributor, broker)",
            },
            {
                "tag_path": "bosc.compliance.test_record",
                "data_type": "entity",
                "description": "Compliance test execution records",
            },
            {
                "tag_path": "bosc.compliance.document",
                "data_type": "entity",
                "description": "Compliance documents (FAA 8130-3, CoC, etc.)",
            },
        ]
