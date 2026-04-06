"""WHK WMS Adapter — the first working Forge adapter.

Implements AdapterBase + SubscriptionProvider + BackfillProvider +
DiscoveryProvider (everything except WritableAdapter, per FACTS spec
where write=false).

Data flow:
    WMS GraphQL/RabbitMQ → raw dicts → entity mappers → Forge core
    models → context mapper → ContextualRecord → governance pipeline
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any

from forge.adapters.base.interface import (
    AdapterBase,
    BackfillProvider,
    DiscoveryProvider,
    SubscriptionProvider,
)
from forge.adapters.whk_wms.config import WhkWmsConfig
from forge.adapters.whk_wms.context import build_record_context
from forge.adapters.whk_wms.record_builder import build_contextual_record
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
        health_check_interval_ms=raw.get("health_check_interval_ms", 30_000),
        connection_params=[
            ConnectionParam(**p) for p in raw.get("connection_params", [])
        ],
        auth_methods=raw.get("auth_methods", ["none"]),
        metadata=raw.get("metadata", {}),
    )


class WhkWmsAdapter(
    AdapterBase,
    SubscriptionProvider,
    BackfillProvider,
    DiscoveryProvider,
):
    """Forge adapter for the WHK Warehouse Management System.

    Ingests barrel inventory, lot tracking, warehouse events, and
    related operational data via GraphQL queries and RabbitMQ
    subscriptions. All data is mapped to Forge core manufacturing
    models and emitted as ContextualRecords.
    """

    manifest: AdapterManifest = _load_manifest()

    def __init__(self) -> None:
        super().__init__()
        self._config: WhkWmsConfig | None = None
        self._subscriptions: dict[str, Any] = {}
        self._consecutive_failures: int = 0
        self._last_healthy: datetime | None = None

    # ── Lifecycle (AdapterBase) ─────────────────────────────────

    async def configure(self, params: dict[str, Any]) -> None:
        """Validate and store connection parameters."""
        self._config = WhkWmsConfig(**params)
        self._state = AdapterState.REGISTERED
        logger.info(
            "WHK-WMS adapter configured: graphql=%s",
            self._config.graphql_url,
        )

    async def start(self) -> None:
        """Begin active operation.

        In production this connects to GraphQL and RabbitMQ.
        Currently sets state to HEALTHY for static conformance.
        """
        if self._config is None:
            msg = "Adapter not configured — call configure() first"
            raise RuntimeError(msg)
        self._state = AdapterState.CONNECTING
        # TODO(P3-live): Establish GraphQL client session
        # TODO(P3-live): Connect to RabbitMQ and bind exchanges
        self._state = AdapterState.HEALTHY
        self._last_healthy = datetime.utcnow()
        logger.info("WHK-WMS adapter started (state=%s)", self._state)

    async def stop(self) -> None:
        """Graceful shutdown."""
        # TODO(P3-live): Close GraphQL session
        # TODO(P3-live): Disconnect from RabbitMQ
        self._subscriptions.clear()
        self._state = AdapterState.STOPPED
        logger.info("WHK-WMS adapter stopped")

    async def health(self) -> AdapterHealth:
        """Return current health status."""
        return AdapterHealth(
            adapter_id=self.adapter_id,
            state=self._state,
            last_healthy=self._last_healthy,
            records_collected=self._records_collected,
            records_failed=self._records_failed,
        )

    # ── Core read interface (AdapterBase) ───────────────────────

    async def collect(self):
        """Yield ContextualRecords from the WMS.

        In production this queries the GraphQL API for recent
        barrel events, maps them through the entity mappers, and
        yields ContextualRecords. Currently yields from any
        pre-loaded data passed via inject_records() for testing.
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
                logger.exception("Failed to map WMS event")

    def inject_records(self, records: list[dict[str, Any]]) -> None:
        """Inject raw WMS data for testing/static collection."""
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
        """Subscribe to WMS event streams.

        Tags correspond to RabbitMQ exchange patterns
        (e.g. 'wh.whk01.distillery01.barrel').
        """
        # TODO(P3-live): Bind RabbitMQ exchanges
        import uuid

        sub_id = str(uuid.uuid4())
        self._subscriptions[sub_id] = {
            "tags": tags,
            "callback": callback,
        }
        logger.info(
            "WHK-WMS subscription %s: tags=%s", sub_id, tags,
        )
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
        """Retrieve historical WMS data for the given time range.

        In production this uses GraphQL queries with date filters.
        """
        # TODO(P3-live): GraphQL historical query
        return
        yield

    async def get_earliest_timestamp(self, tag: str) -> datetime | None:
        """Return earliest available timestamp for a tag."""
        # TODO(P3-live): Query WMS for earliest record
        return None

    # ── DiscoveryProvider ───────────────────────────────────────

    async def discover(self) -> list[dict[str, Any]]:
        """Enumerate available WMS data sources.

        Returns the data sources declared in the FACTS spec.
        In production this would introspect the GraphQL schema.
        """
        return [
            {
                "tag_path": "wms.graphql.barrel",
                "data_type": "entity",
                "description": "Barrel inventory and lifecycle",
            },
            {
                "tag_path": "wms.graphql.lot",
                "data_type": "entity",
                "description": "Lot lifecycle and traceability",
            },
            {
                "tag_path": "wms.graphql.event",
                "data_type": "event",
                "description": "Barrel events (entry, withdrawal, transfer, etc.)",
            },
            {
                "tag_path": "wms.graphql.customer",
                "data_type": "entity",
                "description": "Customer business entities",
            },
            {
                "tag_path": "wms.graphql.warehouse_job",
                "data_type": "entity",
                "description": "Warehouse job tracking",
            },
            {
                "tag_path": "wms.rabbitmq.barrel_state",
                "data_type": "event",
                "description": "Real-time barrel state changes via UNS",
            },
        ]
