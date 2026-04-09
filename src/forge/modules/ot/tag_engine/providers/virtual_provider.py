"""Virtual tag provider — federated reads from external systems.

Forge-exclusive tag type.  VirtualTags read from external sources
(NextTrend historian, external databases, REST APIs, other Forge
modules) with a TTL cache.  Unlike QueryTags (SQL-only, poll-based),
Virtual tags support any data source and use a cache-first strategy.

Phase 2A.2 stub: Source-specific fetchers (NextTrend, REST, DB)
will be wired in Phase 2A.4 (Context Enrichment).
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from forge.modules.ot.opcua_client.types import QualityCode
from forge.modules.ot.tag_engine.models import TagType, VirtualTag
from forge.modules.ot.tag_engine.providers.base import BaseProvider
from forge.modules.ot.tag_engine.registry import TagRegistry

logger = logging.getLogger(__name__)


class VirtualProvider(BaseProvider):
    """Provider for Virtual tags — federated external data access.

    Currently a structural stub.  Full implementation requires:
        - Source-type registry (nexttrend, rest, database, forge_module)
        - Async HTTP client for REST sources
        - NextTrend client for historian queries
        - TTL-based cache with background refresh
    """

    def __init__(self, registry: TagRegistry) -> None:
        super().__init__(name="virtual", registry=registry)
        self._virtual_tag_count = 0
        self._cache: dict[str, tuple[Any, datetime]] = {}

    async def _start(self) -> None:
        """Discover VirtualTags and initialize cache entries."""
        virtual_tags = await self._registry.find_by_type(TagType.VIRTUAL)
        self._virtual_tag_count = len(virtual_tags)

        # Set initial fallback values
        for tag in virtual_tags:
            if not isinstance(tag, VirtualTag):
                continue
            if tag.fallback_value is not None:
                await self._registry.update_value(
                    tag.path, tag.fallback_value, QualityCode.UNCERTAIN
                )

        if self._virtual_tag_count == 0:
            logger.info("VirtualProvider: no Virtual tags found")
            return

        logger.info(
            "VirtualProvider: found %d Virtual tags (fetchers deferred to Phase 2A.4)",
            self._virtual_tag_count,
        )

    async def _stop(self) -> None:
        """Clear cache."""
        self._cache.clear()

    async def _health(self) -> dict[str, Any]:
        return {
            "virtual_tags": self._virtual_tag_count,
            "cache_entries": len(self._cache),
            "status": "stub — awaiting source fetchers (Phase 2A.4)",
        }
