"""Query tag provider — executes SQL queries on poll intervals.

This is the read half of Ignition's SQL Bridge transaction groups.
Each QueryTag has a SQL statement, connection name, and poll interval.
The provider executes the query periodically and pushes the result
into the tag registry.

Phase 2A.2 stub: connection pooling and actual database execution
will be wired in when the forge.db SDK module is built (Phase 2B.1.4).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from forge.modules.ot.opcua_client.types import QualityCode
from forge.modules.ot.tag_engine.models import QueryTag, TagType
from forge.modules.ot.tag_engine.providers.base import BaseProvider
from forge.modules.ot.tag_engine.registry import TagRegistry

logger = logging.getLogger(__name__)


class QueryProvider(BaseProvider):
    """Provider for Query tags — SQL execution on poll interval.

    Currently a structural stub.  Full implementation requires:
        - Database connection pool (from forge.db SDK)
        - Parameterized query execution
        - Result-to-value mapping (scalar or multi-row)
    """

    def __init__(self, registry: TagRegistry) -> None:
        super().__init__(name="query", registry=registry)
        self._poll_tasks: dict[str, asyncio.Task[None]] = {}
        self._query_count = 0

    async def _start(self) -> None:
        """Discover QueryTags and start poll loops."""
        query_tags = await self._registry.find_by_type(TagType.QUERY)
        self._query_count = len(query_tags)

        if self._query_count == 0:
            logger.info("QueryProvider: no Query tags found")
            return

        logger.info("QueryProvider: found %d Query tags (poll loops deferred to Phase 2B)", self._query_count)
        # Phase 2B: start asyncio.create_task per query tag with poll_interval_ms

    async def _stop(self) -> None:
        """Cancel all poll tasks."""
        for task in self._poll_tasks.values():
            task.cancel()
        for task in self._poll_tasks.values():
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._poll_tasks.clear()

    async def _health(self) -> dict[str, Any]:
        return {
            "query_tags": self._query_count,
            "active_polls": len(self._poll_tasks),
            "status": "stub — awaiting forge.db SDK (Phase 2B)",
        }
