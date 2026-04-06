"""WHK MES Adapter — the second Forge adapter (first with write capability).

Implements AdapterBase + WritableAdapter + SubscriptionProvider +
BackfillProvider + DiscoveryProvider (all 5 capabilities per FACTS spec
where write=true).

Data flow:
    MES GraphQL/RabbitMQ/MQTT -> raw dicts -> entity mappers -> Forge core
    models -> context mapper -> ContextualRecord -> governance pipeline

Write flow (deferred to F34 gRPC transport):
    Forge decision -> unmap_* -> MES GraphQL mutation -> source system
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
    WritableAdapter,
)
from forge.adapters.whk_mes.config import WhkMesConfig
from forge.adapters.whk_mes.context import build_record_context
from forge.adapters.whk_mes.record_builder import build_contextual_record
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


class WhkMesAdapter(
    AdapterBase,
    WritableAdapter,
    SubscriptionProvider,
    BackfillProvider,
    DiscoveryProvider,
):
    """Forge adapter for the WHK Manufacturing Execution System.

    Ingests production orders, batches, recipes, equipment phases,
    operational events, and related manufacturing data via GraphQL
    queries, RabbitMQ subscriptions, and MQTT equipment streams.
    All data is mapped to Forge core manufacturing models and emitted
    as ContextualRecords.

    This is the first Forge adapter with write capability -- Forge may
    push decisions back into the MES production order lifecycle via
    GraphQL mutations (deferred to F34 gRPC transport layer).
    """

    manifest: AdapterManifest = _load_manifest()

    def __init__(self) -> None:
        super().__init__()
        self._config: WhkMesConfig | None = None
        self._subscriptions: dict[str, Any] = {}
        self._consecutive_failures: int = 0
        self._last_healthy: datetime | None = None

    # -- Lifecycle (AdapterBase) -----------------------------------------

    async def configure(self, params: dict[str, Any]) -> None:
        """Validate and store connection parameters."""
        self._config = WhkMesConfig(**params)
        self._state = AdapterState.REGISTERED
        logger.info(
            "WHK-MES adapter configured: graphql=%s, mqtt=%s:%s",
            self._config.graphql_url,
            self._config.mqtt_host or "(none)",
            self._config.mqtt_port,
        )

    async def start(self) -> None:
        """Begin active operation.

        In production this connects to GraphQL, RabbitMQ, and MQTT.
        Currently sets state to HEALTHY for static conformance.
        """
        if self._config is None:
            msg = "Adapter not configured -- call configure() first"
            raise RuntimeError(msg)
        self._state = AdapterState.CONNECTING
        # TODO(P4-live): Establish GraphQL client session
        # TODO(P4-live): Connect to RabbitMQ and bind 34 entity exchanges
        # TODO(P4-live): Connect to MQTT broker(s) via UNS config
        self._state = AdapterState.HEALTHY
        self._last_healthy = datetime.utcnow()
        logger.info("WHK-MES adapter started (state=%s)", self._state)

    async def stop(self) -> None:
        """Graceful shutdown -- flush MQTT buffer, close connections."""
        # TODO(P4-live): Flush MQTT message buffer
        # TODO(P4-live): Unsubscribe from MQTT topics
        # TODO(P4-live): Close RabbitMQ channels
        # TODO(P4-live): Close GraphQL session
        self._subscriptions.clear()
        self._state = AdapterState.STOPPED
        logger.info("WHK-MES adapter stopped")

    async def health(self) -> AdapterHealth:
        """Return current health status."""
        return AdapterHealth(
            adapter_id=self.adapter_id,
            state=self._state,
            last_healthy=self._last_healthy,
            records_collected=self._records_collected,
            records_failed=self._records_failed,
        )

    # -- Core read interface (AdapterBase) -------------------------------

    async def collect(self):
        """Yield ContextualRecords from the MES.

        In production this queries the GraphQL API for recent
        production events, maps them through the entity mappers, and
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
                logger.exception("Failed to map MES event")

    def inject_records(self, records: list[dict[str, Any]]) -> None:
        """Inject raw MES data for testing/static collection."""
        self._pending_records = list(records)

    @property
    def _pending_records(self) -> list[dict[str, Any]]:
        return getattr(self, "_injected_records", [])

    @_pending_records.setter
    def _pending_records(self, value: list[dict[str, Any]]) -> None:
        self._injected_records = value

    # -- WritableAdapter -------------------------------------------------

    async def write(
        self,
        tag_path: str,
        value: Any,
        *,
        confirm: bool = True,
    ) -> bool:
        """Write a value back to the MES via GraphQL mutation.

        This is the first Forge adapter with write capability. In
        production this sends GraphQL mutations to update production
        order state, step execution control, recipe parameter
        adjustments, etc.

        Deferred to F34 (gRPC transport layer) for full implementation.
        The write path uses unmap_* functions (reverse of map_*) to
        translate Forge canonical models back to MES-native shapes.

        Args:
            tag_path: MES entity path (e.g. 'mes.graphql.step_execution').
            value: The value/mutation payload to write.
            confirm: If True, read back after write to confirm.

        Returns:
            True if the write succeeded (always False in stub mode).
        """
        # TODO(F34): Implement via gRPC transport + GraphQL mutations
        logger.warning(
            "WHK-MES write() stub called: tag_path=%s (F34 required)",
            tag_path,
        )
        return False

    # -- SubscriptionProvider --------------------------------------------

    async def subscribe(
        self,
        tags: list[str],
        callback: Any,
    ) -> str:
        """Subscribe to MES event streams.

        Tags correspond to RabbitMQ exchange patterns
        (e.g. 'wh.whk01.distillery01.batch') or MQTT topic patterns
        (e.g. 'production/StepExecution/step_started').
        """
        # TODO(P4-live): Bind RabbitMQ exchanges + MQTT topic subscriptions
        import uuid

        sub_id = str(uuid.uuid4())
        self._subscriptions[sub_id] = {
            "tags": tags,
            "callback": callback,
        }
        logger.info(
            "WHK-MES subscription %s: tags=%s", sub_id, tags,
        )
        return sub_id

    async def unsubscribe(self, subscription_id: str) -> None:
        """Cancel a subscription."""
        self._subscriptions.pop(subscription_id, None)

    # -- BackfillProvider ------------------------------------------------

    async def backfill(
        self,
        tags: list[str],
        start: datetime,
        end: datetime,
        *,
        max_records: int | None = None,
    ):
        """Retrieve historical MES data for the given time range.

        In production this uses GraphQL queries with date filters.
        """
        # TODO(P4-live): GraphQL historical query
        return
        yield

    async def get_earliest_timestamp(self, tag: str) -> datetime | None:
        """Return earliest available timestamp for a tag."""
        # TODO(P4-live): Query MES for earliest record
        return None

    # -- DiscoveryProvider -----------------------------------------------

    async def discover(self) -> list[dict[str, Any]]:
        """Enumerate available MES data sources.

        Returns the data sources declared in the FACTS spec.
        In production this would introspect the GraphQL schema and
        enumerate MQTT topic subscriptions.
        """
        return [
            {
                "tag_path": "mes.graphql.production_order",
                "data_type": "entity",
                "description": "Production order lifecycle and scheduling",
            },
            {
                "tag_path": "mes.graphql.batch",
                "data_type": "entity",
                "description": "Batch execution and manufacturing data",
            },
            {
                "tag_path": "mes.graphql.recipe",
                "data_type": "entity",
                "description": "Recipe management (class/instance pattern)",
            },
            {
                "tag_path": "mes.graphql.schedule_order",
                "data_type": "entity",
                "description": "Schedule order queue and timeline",
            },
            {
                "tag_path": "mes.graphql.equipment",
                "data_type": "entity",
                "description": "ISA-88 equipment hierarchy",
            },
            {
                "tag_path": "mes.graphql.step_execution",
                "data_type": "event",
                "description": "Step execution events (start/pause/resume/complete)",
            },
            {
                "tag_path": "mes.graphql.lot",
                "data_type": "entity",
                "description": "Lot traceability (cross-spoke with WMS)",
            },
            {
                "tag_path": "mes.graphql.item",
                "data_type": "entity",
                "description": "Material item master data",
            },
            {
                "tag_path": "mes.rabbitmq.domain_events",
                "data_type": "event",
                "description": "34 entity fanout exchanges for domain events",
            },
            {
                "tag_path": "mes.mqtt.equipment_events",
                "data_type": "event",
                "description": "Real-time equipment data via UNS MQTT",
            },
            {
                "tag_path": "mes.mqtt.production_events",
                "data_type": "event",
                "description": "MQTT domain events (30+ event types)",
            },
        ]
