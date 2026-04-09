"""Event tag provider — receives values from external event sources.

Forge-exclusive tag type.  EventTags update when a matching event
arrives from MQTT, RabbitMQ, a webhook, or an internal Forge event.
Between events, the tag retains its last-received value (or expires
after TTL if configured).

Phase 2A.2 stub: MQTT/RabbitMQ subscription and webhook endpoint
registration will be wired in Phase 2B.3 (MQTT Pub/Sub Engine).
"""

from __future__ import annotations

import logging
from typing import Any

from forge.modules.ot.opcua_client.types import QualityCode
from forge.modules.ot.tag_engine.models import EventTag, TagType
from forge.modules.ot.tag_engine.providers.base import BaseProvider
from forge.modules.ot.tag_engine.registry import TagRegistry

logger = logging.getLogger(__name__)


class EventProvider(BaseProvider):
    """Provider for Event tags — external event ingestion.

    Currently a structural stub.  Full implementation requires:
        - MQTT subscriber (from OT MQTT engine, Phase 2B.3)
        - RabbitMQ consumer (from Forge adapter framework)
        - Webhook endpoint registration (from forge.api)
        - TTL expiration timer
    """

    def __init__(self, registry: TagRegistry) -> None:
        super().__init__(name="event", registry=registry)
        self._event_tag_count = 0

    async def _start(self) -> None:
        """Discover EventTags and register listeners."""
        event_tags = await self._registry.find_by_type(TagType.EVENT)
        self._event_tag_count = len(event_tags)

        if self._event_tag_count == 0:
            logger.info("EventProvider: no Event tags found")
            return

        logger.info(
            "EventProvider: found %d Event tags (listeners deferred to Phase 2B)",
            self._event_tag_count,
        )

    async def _stop(self) -> None:
        """Unregister listeners."""
        pass

    async def _health(self) -> dict[str, Any]:
        return {
            "event_tags": self._event_tag_count,
            "status": "stub — awaiting MQTT engine (Phase 2B)",
        }

    async def inject_event(
        self,
        path: str,
        value: Any,
        quality: QualityCode = QualityCode.GOOD,
    ) -> bool:
        """Manually inject a value into an Event tag.

        Used by MQTT/RabbitMQ callbacks and webhook handlers
        when they receive a matching event.

        Returns True if the tag exists and is an EventTag.
        """
        tag = await self._registry.get_definition(path)
        if tag is None:
            return False
        if not isinstance(tag, EventTag):
            raise ValueError(
                f"Cannot inject event into non-Event tag: {path} (type={tag.tag_type.value})"
            )
        await self._registry.update_value(path, value, quality)
        return True
