"""Forge Event Publisher — publishes lifecycle events to RabbitMQ exchanges.

Wraps the ForgeProducer ABC to provide typed event publishing for
hub-level concerns:
    - Adapter lifecycle events (registered, started, stopped, errored)
    - Governance events (FACTS/FATS violations, approvals)
    - Curation events (data product published, deprecated)
    - Ingestion events (record batch ingested)

Usage::

    publisher = ForgeEventPublisher(producer)
    await publisher.adapter_registered("whk-wms", "WMS Adapter")
    await publisher.record_ingested("whk-erpi", count=42)
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from forge.broker.exchanges import FORGE_EXCHANGES
from forge.broker.producer import ForgeProducer  # noqa: TC001

logger = logging.getLogger(__name__)


class ForgeEventPublisher:
    """Typed event publisher for the Forge hub.

    All events are dicts with a standard envelope:
        {
            "event_type": "adapter.registered",
            "timestamp": "2026-04-12T...",
            "payload": { ... }
        }
    """

    def __init__(self, producer: ForgeProducer) -> None:
        self._producer = producer

    def _envelope(self, event_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "event_type": event_type,
            "timestamp": datetime.now(tz=UTC).isoformat(),
            "payload": payload,
        }

    # ------------------------------------------------------------------
    # Adapter lifecycle
    # ------------------------------------------------------------------

    async def adapter_registered(
        self, adapter_id: str, name: str, **extra: Any,
    ) -> None:
        """Publish an adapter registration event."""
        event = self._envelope("adapter.registered", {
            "adapter_id": adapter_id,
            "name": name,
            **extra,
        })
        exchange = FORGE_EXCHANGES["adapter.lifecycle"]
        await self._producer.publish(exchange, event)
        logger.info("Published adapter.registered: %s", adapter_id)

    async def adapter_started(self, adapter_id: str) -> None:
        event = self._envelope("adapter.started", {"adapter_id": adapter_id})
        exchange = FORGE_EXCHANGES["adapter.lifecycle"]
        await self._producer.publish(exchange, event)

    async def adapter_stopped(self, adapter_id: str, reason: str = "") -> None:
        event = self._envelope("adapter.stopped", {
            "adapter_id": adapter_id,
            "reason": reason,
        })
        exchange = FORGE_EXCHANGES["adapter.lifecycle"]
        await self._producer.publish(exchange, event)

    async def adapter_errored(self, adapter_id: str, error: str) -> None:
        event = self._envelope("adapter.errored", {
            "adapter_id": adapter_id,
            "error": error,
        })
        exchange = FORGE_EXCHANGES["adapter.lifecycle"]
        await self._producer.publish(exchange, event)

    # ------------------------------------------------------------------
    # Ingestion
    # ------------------------------------------------------------------

    async def record_ingested(
        self, adapter_id: str, *, count: int, batch_id: str = "",
    ) -> None:
        """Publish a record-ingestion summary event."""
        event = self._envelope("ingestion.batch", {
            "adapter_id": adapter_id,
            "count": count,
            "batch_id": batch_id,
        })
        exchange = FORGE_EXCHANGES["ingestion.raw"]
        await self._producer.publish(exchange, event)

    # ------------------------------------------------------------------
    # Governance
    # ------------------------------------------------------------------

    async def governance_violation(
        self,
        rule_name: str,
        severity: str = "warning",
        *,
        detail: str = "",
        entity_id: str = "",
    ) -> None:
        """Publish a governance violation event."""
        event = self._envelope("governance.violation", {
            "rule_name": rule_name,
            "severity": severity,
            "detail": detail,
            "entity_id": entity_id,
        })
        exchange = FORGE_EXCHANGES["governance.events"]
        await self._producer.publish(
            exchange, event, routing_key=f"governance.{severity}",
        )

    # ------------------------------------------------------------------
    # Curation
    # ------------------------------------------------------------------

    async def product_published(
        self, product_id: str, name: str, owner: str,
    ) -> None:
        """Publish a data-product publication event."""
        event = self._envelope("curation.product.published", {
            "product_id": product_id,
            "name": name,
            "owner": owner,
        })
        exchange = FORGE_EXCHANGES["curation.products"]
        await self._producer.publish(exchange, event)

    async def product_deprecated(
        self, product_id: str, reason: str = "",
    ) -> None:
        event = self._envelope("curation.product.deprecated", {
            "product_id": product_id,
            "reason": reason,
        })
        exchange = FORGE_EXCHANGES["curation.products"]
        await self._producer.publish(exchange, event)

    async def close(self) -> None:
        """Close the underlying producer."""
        await self._producer.close()
