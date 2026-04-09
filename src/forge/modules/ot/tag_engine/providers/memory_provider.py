"""Memory tag provider — manages in-memory read/write tags.

Memory tags are the simplest provider: they hold a value that is set
explicitly by API calls, scripts, or MQTT messages.  There is no
external data source — the provider's job is to:

    1. Initialize Memory tags with their default values on startup
    2. Provide a write() method for external callers
    3. Optionally persist values across restarts (via persistence module)

This is equivalent to Ignition's Memory tag type.
"""

from __future__ import annotations

import logging
from typing import Any

from forge.modules.ot.opcua_client.types import QualityCode
from forge.modules.ot.tag_engine.models import MemoryTag, TagType
from forge.modules.ot.tag_engine.providers.base import BaseProvider
from forge.modules.ot.tag_engine.registry import TagRegistry

logger = logging.getLogger(__name__)


class MemoryProvider(BaseProvider):
    """Provider for Memory tags — in-memory read/write store."""

    def __init__(self, registry: TagRegistry) -> None:
        super().__init__(name="memory", registry=registry)
        self._initialized_count = 0

    async def _start(self) -> None:
        """Initialize all Memory tags with their default values."""
        memory_tags = await self._registry.find_by_type(TagType.MEMORY)
        for tag in memory_tags:
            if not isinstance(tag, MemoryTag):
                continue
            if tag.default_value is not None:
                await self._registry.update_value(
                    tag.path, tag.default_value, QualityCode.GOOD
                )
                self._initialized_count += 1
            else:
                # Set quality to GOOD with None value (ready to receive writes)
                await self._registry.update_value(
                    tag.path, None, QualityCode.GOOD
                )
                self._initialized_count += 1

        logger.info(
            "MemoryProvider: initialized %d Memory tags", self._initialized_count
        )

    async def _stop(self) -> None:
        """Nothing to clean up — values stay in registry until registry is dropped."""
        pass

    async def _health(self) -> dict[str, Any]:
        return {
            "initialized_tags": self._initialized_count,
        }

    async def write(
        self,
        path: str,
        value: Any,
        quality: QualityCode = QualityCode.GOOD,
    ) -> bool:
        """Write a value to a Memory tag.

        Returns True if the tag exists and is a MemoryTag.
        Raises ValueError if the tag is not a MemoryTag.
        """
        tag = await self._registry.get_definition(path)
        if tag is None:
            return False
        if not isinstance(tag, MemoryTag):
            raise ValueError(
                f"Cannot write to non-Memory tag: {path} (type={tag.tag_type.value})"
            )
        await self._registry.update_value(path, value, quality)
        return True
