"""OPC-UA tag provider — bridges one PLC connection to the tag registry.

Each OpcUaProvider manages:
    1. One OpcUaClient connection to a single PLC
    2. Subscriptions for all StandardTag instances assigned to that connection
    3. Value updates pushed into the TagRegistry on every data change
    4. Auto-resubscription on reconnect (client handles reconnect, provider
       re-establishes monitored items)

The provider does NOT own the OpcUaClient — it receives one at construction.
This allows the AcquisitionEngine to manage client lifecycles independently
and enables testing with mock clients.

Design decisions:
    D1: One provider per PLC connection (not one per tag).  This minimizes
        the number of OPC-UA subscriptions and groups tags by scan class.
    D2: The subscription callback translates DataValue → registry.update_value()
        with path normalization via PathNormalizer.
    D3: On reconnect, the provider re-discovers which tags need subscription
        by querying the registry for StandardTags with matching connection_name.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from forge.modules.ot.opcua_client.client import OpcUaClient
from forge.modules.ot.opcua_client.paths import PathNormalizer
from forge.modules.ot.opcua_client.types import (
    ConnectionState,
    DataType,
    DataValue,
    QualityCode,
)
from forge.modules.ot.tag_engine.models import StandardTag, TagType
from forge.modules.ot.tag_engine.providers.base import BaseProvider
from forge.modules.ot.tag_engine.registry import TagRegistry

logger = logging.getLogger(__name__)


class OpcUaProvider(BaseProvider):
    """Manages OPC-UA subscriptions for one PLC connection.

    Args:
        name: Provider name (typically the PLC connection name, e.g., "WHK01")
        registry: Tag registry to push values into
        client: Pre-configured OpcUaClient instance
        path_normalizer: Converts between OPC-UA node IDs and Forge tag paths
    """

    def __init__(
        self,
        name: str,
        registry: TagRegistry,
        client: OpcUaClient,
        path_normalizer: PathNormalizer,
    ) -> None:
        super().__init__(name=name, registry=registry)
        self._client = client
        self._path_normalizer = path_normalizer

        # node_id → tag_path mapping for active subscriptions
        self._subscribed_tags: dict[str, str] = {}
        # Subscription ID from the OPC-UA client
        self._subscription_id: int | None = None
        # Metrics
        self._values_received: int = 0
        self._last_value_at: datetime | None = None
        self._subscription_errors: int = 0

    @property
    def client(self) -> OpcUaClient:
        return self._client

    @property
    def subscribed_tag_count(self) -> int:
        return len(self._subscribed_tags)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def _start(self) -> None:
        """Connect to PLC and subscribe to all matching StandardTags."""
        # Connect the OPC-UA client
        await self._client.connect()

        # Find all StandardTags for this connection
        await self._subscribe_matching_tags()

    async def _stop(self) -> None:
        """Unsubscribe and disconnect."""
        # Unsubscribe
        if self._subscription_id is not None:
            try:
                await self._client.unsubscribe(self._subscription_id)
            except Exception:
                logger.warning("Failed to unsubscribe %s", self.name)
            self._subscription_id = None

        self._subscribed_tags.clear()

        # Disconnect client
        try:
            await self._client.disconnect()
        except Exception:
            logger.warning("Failed to disconnect %s", self.name)

    async def _health(self) -> dict[str, Any]:
        """OPC-UA-specific health metrics."""
        client_health = self._client.health()
        return {
            "connection_state": client_health.state.value,
            "endpoint_url": client_health.endpoint_url,
            "subscribed_tags": len(self._subscribed_tags),
            "values_received": self._values_received,
            "last_value_at": (
                self._last_value_at.isoformat() if self._last_value_at else None
            ),
            "subscription_errors": self._subscription_errors,
            "reconnect_count": client_health.reconnect_count,
            "latency_ms": client_health.latency_ms,
        }

    # ------------------------------------------------------------------
    # Subscription management
    # ------------------------------------------------------------------

    async def _subscribe_matching_tags(self) -> None:
        """Find StandardTags for this connection and subscribe to their OPC-UA nodes."""
        all_standard = await self._registry.find_by_type(TagType.STANDARD)

        # Filter to tags matching this provider's connection name
        matching: list[StandardTag] = []
        for tag in all_standard:
            if not isinstance(tag, StandardTag):
                continue
            if tag.connection_name == self.name:
                matching.append(tag)

        if not matching:
            logger.info("Provider %s: no matching StandardTags found", self.name)
            return

        # Build node_id → tag_path map
        node_ids: list[str] = []
        for tag in matching:
            self._subscribed_tags[tag.opcua_node_id] = tag.path
            node_ids.append(tag.opcua_node_id)

        # Create OPC-UA subscription
        try:
            self._subscription_id = await self._client.subscribe(
                node_ids=node_ids,
                callback=self._on_data_change,
                interval_ms=500,  # Default; scan-class grouping in Phase 2A.3
            )
            logger.info(
                "Provider %s: subscribed to %d tags",
                self.name,
                len(node_ids),
            )
        except Exception:
            self._subscription_errors += 1
            logger.exception("Provider %s: subscription failed", self.name)
            raise

    async def _on_data_change(
        self,
        node_id: str,
        data_value: DataValue,
    ) -> None:
        """Callback invoked by OPC-UA client on monitored item change.

        Translates the OPC-UA DataValue into a registry update.
        """
        tag_path = self._subscribed_tags.get(node_id)
        if tag_path is None:
            logger.warning("Received data for unknown node: %s", node_id)
            return

        self._values_received += 1
        self._last_value_at = datetime.now(timezone.utc)

        await self._registry.update_value(
            path=tag_path,
            value=data_value.value,
            quality=data_value.quality,
            timestamp=data_value.server_timestamp or datetime.now(timezone.utc),
            source_timestamp=data_value.source_timestamp,
        )

    # ------------------------------------------------------------------
    # Re-subscription (for reconnect scenarios)
    # ------------------------------------------------------------------

    async def resubscribe(self) -> None:
        """Re-establish subscriptions after a reconnection.

        Called by the AcquisitionEngine when it detects the client
        has transitioned from RECONNECTING → CONNECTED.
        """
        self._subscribed_tags.clear()
        self._subscription_id = None
        await self._subscribe_matching_tags()

    # ------------------------------------------------------------------
    # On-demand operations
    # ------------------------------------------------------------------

    async def read_current(self, tag_path: str) -> DataValue | None:
        """Read current value of a tag directly from the PLC (not from cache).

        Used for explicit refresh requests, not for normal acquisition.
        """
        tag = await self._registry.get_definition(tag_path)
        if not isinstance(tag, StandardTag):
            return None

        values = await self._client.read([tag.opcua_node_id])
        if values:
            dv = values[0]
            await self._registry.update_value(
                tag_path, dv.value, dv.quality,
                source_timestamp=dv.source_timestamp,
            )
            return dv
        return None

    async def write_to_plc(
        self,
        tag_path: str,
        value: Any,
        data_type: DataType | None = None,
    ) -> bool:
        """Write a value to the PLC via OPC-UA.

        Returns True if the write succeeded.
        """
        tag = await self._registry.get_definition(tag_path)
        if not isinstance(tag, StandardTag):
            return False

        await self._client.write(tag.opcua_node_id, value, data_type=data_type)
        return True
