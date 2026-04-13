"""Hub-level RabbitMQ exchange definitions.

Follows the UNS (Unified Namespace) naming pattern established in
``src/forge/adapters/whk_erpi/topics.py``. Hub exchanges use the
``forge.`` prefix to distinguish from spoke-level exchanges.

Exchange architecture:
    - ``fanout`` exchanges broadcast to all bound queues
    - ``topic`` exchanges route by routing key patterns
    - All exchanges are durable (survive broker restart)
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class ExchangeType(StrEnum):
    """RabbitMQ exchange types used by the hub."""

    FANOUT = "fanout"
    TOPIC = "topic"
    DIRECT = "direct"


@dataclass(frozen=True)
class ExchangeSpec:
    """Specification for a hub-level RabbitMQ exchange."""

    name: str
    type: ExchangeType = ExchangeType.FANOUT
    durable: bool = True

    @property
    def queue_name(self) -> str:
        """Default consumer queue name for this exchange."""
        return f"{self.name}.queue"


# Hub-level exchanges — ordered by data flow
FORGE_EXCHANGES: dict[str, ExchangeSpec] = {
    # Raw records arriving from adapters (pre-contextualization)
    "ingestion.raw": ExchangeSpec(
        name="forge.ingestion.raw",
        type=ExchangeType.FANOUT,
    ),
    # Contextualized records (post-contextualization pipeline)
    "ingestion.contextual": ExchangeSpec(
        name="forge.ingestion.contextual",
        type=ExchangeType.FANOUT,
    ),
    # Governance framework events (FACTS/FATS violations, approvals)
    "governance.events": ExchangeSpec(
        name="forge.governance.events",
        type=ExchangeType.TOPIC,
    ),
    # Curated data product lifecycle events
    "curation.products": ExchangeSpec(
        name="forge.curation.products",
        type=ExchangeType.FANOUT,
    ),
    # Adapter lifecycle events (registered, started, stopped, errored)
    "adapter.lifecycle": ExchangeSpec(
        name="forge.adapter.lifecycle",
        type=ExchangeType.FANOUT,
    ),
}


def get_exchange(key: str) -> ExchangeSpec | None:
    """Look up an exchange spec by its short key (e.g. 'ingestion.raw')."""
    return FORGE_EXCHANGES.get(key)
