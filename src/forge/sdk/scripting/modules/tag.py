"""forge.tag — Tag read/write/browse SDK module.

Replaces Ignition's ``system.tag.readBlocking()``, ``system.tag.writeBlocking()``,
``system.tag.browse()``, and ``system.tag.configure()``.

All operations are async-first but provide sync wrappers for convenience.
The module is bound to a TagRegistry instance at engine startup.

Usage in scripts::

    import forge

    value = await forge.tag.read("WH/WHK01/Distillery01/TIT_2010/Out_PV")
    await forge.tag.write("WH/WHK01/Distillery01/Setpoint/Temp", 80.0)
    children = await forge.tag.browse("WH/WHK01/Distillery01")
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger("forge.tag")


@dataclass(frozen=True)
class TagReadResult:
    """Result of a tag read operation."""

    path: str
    value: Any
    quality: str
    timestamp: str
    engineering_units: str = ""


@dataclass(frozen=True)
class BrowseNode:
    """A node in the tag hierarchy."""

    path: str
    name: str
    is_folder: bool
    tag_type: str | None = None
    data_type: str | None = None
    has_children: bool = False


class TagModule:
    """The forge.tag SDK module — bound to a TagRegistry at runtime."""

    def __init__(self) -> None:
        self._registry: Any = None  # TagRegistry, set via bind()

    def bind(self, registry: Any) -> None:
        """Bind to a TagRegistry instance. Called by ScriptEngine on startup."""
        self._registry = registry
        logger.debug("forge.tag bound to TagRegistry")

    def _check_bound(self) -> None:
        if self._registry is None:
            raise RuntimeError(
                "forge.tag is not bound to a TagRegistry. "
                "This module can only be used inside a running ScriptEngine."
            )

    async def read(self, path: str) -> TagReadResult:
        """Read the current value of a tag.

        Args:
            path: Forge-normalized tag path (slash-separated).

        Returns:
            TagReadResult with value, quality, timestamp.

        Raises:
            KeyError: If the tag does not exist.
        """
        self._check_bound()
        result = await self._registry.get_tag_and_value(path)
        if result is None:
            raise KeyError(f"Tag not found: {path!r}")
        tag, tv = result
        return TagReadResult(
            path=path,
            value=tv.value,
            quality=tv.quality.value if hasattr(tv.quality, "value") else str(tv.quality),
            timestamp=tv.timestamp.isoformat() if tv.timestamp else "",
            engineering_units=getattr(tag, "engineering_units", ""),
        )

    async def read_multiple(self, paths: list[str]) -> list[TagReadResult]:
        """Read multiple tags in one call.

        Returns results in the same order as paths.
        Missing tags get quality "NOT_AVAILABLE".
        """
        self._check_bound()
        results = []
        for path in paths:
            try:
                results.append(await self.read(path))
            except KeyError:
                results.append(TagReadResult(
                    path=path, value=None, quality="NOT_AVAILABLE", timestamp=""
                ))
        return results

    async def write(self, path: str, value: Any) -> bool:
        """Write a value to a tag.

        Args:
            path: Forge-normalized tag path.
            value: Value to write.

        Returns:
            True if the write was accepted (value changed).
        """
        self._check_bound()
        return await self._registry.update_value(path, value)

    async def browse(self, prefix: str = "") -> list[BrowseNode]:
        """Browse the tag hierarchy under a path prefix.

        Args:
            prefix: Path prefix to browse (empty string for root).

        Returns:
            List of child nodes (folders and tags).
        """
        self._check_bound()
        raw = await self._registry.browse(prefix)
        return [
            BrowseNode(
                path=item.get("path", ""),
                name=item.get("name", ""),
                is_folder=item.get("is_folder", False),
                tag_type=item.get("tag_type"),
                data_type=item.get("data_type"),
                has_children=item.get("has_children", False),
            )
            for item in raw
        ]

    async def get_config(self, path: str) -> dict[str, Any]:
        """Get the full configuration of a tag.

        Returns the tag definition as a dict (serializable).
        """
        self._check_bound()
        tag = await self._registry.get_definition(path)
        if tag is None:
            raise KeyError(f"Tag not found: {path!r}")
        return tag.model_dump()

    async def exists(self, path: str) -> bool:
        """Check if a tag exists."""
        self._check_bound()
        tag = await self._registry.get_definition(path)
        return tag is not None


# Module-level singleton — bound at engine startup
_instance = TagModule()

read = _instance.read
read_multiple = _instance.read_multiple
write = _instance.write
browse = _instance.browse
get_config = _instance.get_config
exists = _instance.exists
bind = _instance.bind
