"""Tag registry — in-memory tag catalog with CRUD and hierarchy.

The registry is the central data structure of the tag engine.  It holds
every tag definition paired with its current runtime value.  All tag
operations (read, write, browse, subscribe) route through the registry.

Design decisions:
    D1: Dict-based storage keyed by Forge-normalized path.  O(1) lookup,
        O(n) browse.  At WHK's scale (~5,000 tags) this is sufficient.
    D2: Thread-safety via asyncio lock.  The tag engine is single-event-loop
        but multiple coroutines (providers, API handlers, scripts) access
        the registry concurrently.
    D3: Dependency tracking is a forward map (source → set of dependents).
        When a source tag changes, the engine looks up its dependents and
        schedules re-evaluation.
    D4: Folder browsing is synthetic — there are no folder objects.  A
        browse of "WH/WHK01/Distillery01" returns all tags whose path
        starts with that prefix, grouped by the next segment.
"""

from __future__ import annotations

import asyncio
import logging
import re
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from forge.modules.ot.opcua_client.types import QualityCode
from forge.modules.ot.tag_engine.models import (
    BaseTag,
    ExpressionTag,
    ComputedTag,
    DerivedTag,
    ReferenceTag,
    ScanClass,
    TagType,
    TagUnion,
    TagValue,
)

logger = logging.getLogger(__name__)

# Regex to extract {tag_path} references from expression strings
_TAG_REF_RE = re.compile(r"\{([^}]+)\}")


class TagRegistry:
    """In-memory tag catalog.

    Stores tag definitions and their current runtime values.
    Provides CRUD, hierarchical browsing, and dependency tracking.
    """

    def __init__(self) -> None:
        self._tags: dict[str, TagUnion] = {}
        self._values: dict[str, TagValue] = {}
        self._lock = asyncio.Lock()

        # Forward dependency map: source_path → set of dependent paths
        # When source_path's value changes, all dependents need re-eval.
        self._dependents: dict[str, set[str]] = defaultdict(set)

        # Reverse dependency map: dependent_path → set of source paths
        # Used to clean up when a tag is removed.
        self._dependencies: dict[str, set[str]] = defaultdict(set)

        # Change callbacks: called when any tag value changes
        self._change_callbacks: list[Any] = []

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def count(self) -> int:
        """Total number of registered tags."""
        return len(self._tags)

    @property
    def paths(self) -> list[str]:
        """All registered tag paths (sorted)."""
        return sorted(self._tags.keys())

    # ------------------------------------------------------------------
    # CRUD operations
    # ------------------------------------------------------------------

    async def register(self, tag: TagUnion) -> None:
        """Register a new tag definition.

        Raises ValueError if a tag with the same path already exists.
        """
        async with self._lock:
            if tag.path in self._tags:
                raise ValueError(f"Tag already registered: {tag.path}")
            self._tags[tag.path] = tag
            self._values[tag.path] = TagValue()
            self._rebuild_dependencies_for(tag)
            logger.debug("Registered tag: %s (%s)", tag.path, tag.tag_type)

    async def register_many(self, tags: list[TagUnion]) -> int:
        """Register multiple tags.  Returns count of successfully registered tags."""
        registered = 0
        async with self._lock:
            for tag in tags:
                if tag.path in self._tags:
                    logger.warning("Skipping duplicate tag: %s", tag.path)
                    continue
                self._tags[tag.path] = tag
                self._values[tag.path] = TagValue()
                self._rebuild_dependencies_for(tag)
                registered += 1
        return registered

    async def unregister(self, path: str) -> bool:
        """Remove a tag by path.  Returns True if found and removed."""
        async with self._lock:
            if path not in self._tags:
                return False
            # Clean up dependency maps
            for source in self._dependencies.get(path, set()):
                self._dependents[source].discard(path)
            self._dependencies.pop(path, None)
            # Clean up as a source
            for dep in self._dependents.get(path, set()):
                self._dependencies[dep].discard(path)
            self._dependents.pop(path, None)

            del self._tags[path]
            del self._values[path]
            logger.debug("Unregistered tag: %s", path)
            return True

    async def get_definition(self, path: str) -> TagUnion | None:
        """Get a tag definition by path."""
        return self._tags.get(path)

    async def get_value(self, path: str) -> TagValue | None:
        """Get current runtime value of a tag."""
        return self._values.get(path)

    async def get_tag_and_value(self, path: str) -> tuple[TagUnion, TagValue] | None:
        """Get both definition and value in one call."""
        tag = self._tags.get(path)
        if tag is None:
            return None
        return tag, self._values[path]

    async def update_value(
        self,
        path: str,
        value: Any,
        quality: QualityCode = QualityCode.GOOD,
        timestamp: datetime | None = None,
        source_timestamp: datetime | None = None,
    ) -> bool:
        """Update a tag's runtime value.

        Returns True if the value actually changed.
        Notifies change callbacks and returns dependent paths for re-evaluation.
        """
        tv = self._values.get(path)
        if tv is None:
            return False

        now = timestamp or datetime.now(timezone.utc)
        changed = (value != tv.value) or (quality != tv.quality)

        tv.previous_value = tv.value
        tv.previous_quality = tv.quality
        tv.value = value
        tv.quality = quality
        tv.timestamp = now
        tv.source_timestamp = source_timestamp
        if changed:
            tv.change_count += 1

        if changed:
            await self._notify_change(path, tv)

        return changed

    async def get_dependents(self, path: str) -> set[str]:
        """Get all tag paths that depend on the given tag."""
        return set(self._dependents.get(path, set()))

    # ------------------------------------------------------------------
    # Browse / query
    # ------------------------------------------------------------------

    async def browse(self, prefix: str = "") -> list[dict[str, Any]]:
        """Browse tags under a path prefix.

        Returns a list of child items.  Each item is either:
            - A folder (has children, no value)
            - A tag (has tag_type, data_type, has_value)

        This implements synthetic folder browsing — there are no
        folder objects in the registry.
        """
        prefix = prefix.rstrip("/")
        depth = len(prefix.split("/")) if prefix else 0

        children: dict[str, dict[str, Any]] = {}

        for path, tag in self._tags.items():
            if prefix and not path.startswith(prefix + "/"):
                continue
            if not prefix and "/" not in path:
                # Root-level tag
                children[path] = {
                    "name": path,
                    "path": path,
                    "is_folder": False,
                    "tag_type": tag.tag_type.value,
                    "data_type": tag.data_type.value,
                    "has_value": self._values[path].value is not None,
                }
                continue

            # Extract the next segment after the prefix
            remaining = path[len(prefix) + 1:] if prefix else path
            segments = remaining.split("/")
            next_segment = segments[0]
            child_path = f"{prefix}/{next_segment}" if prefix else next_segment

            if len(segments) == 1:
                # Leaf tag
                children[child_path] = {
                    "name": next_segment,
                    "path": path,
                    "is_folder": False,
                    "tag_type": tag.tag_type.value,
                    "data_type": tag.data_type.value,
                    "has_value": self._values[path].value is not None,
                }
            elif child_path not in children:
                # Folder (first time seeing this prefix)
                children[child_path] = {
                    "name": next_segment,
                    "path": child_path,
                    "is_folder": True,
                    "child_count": 1,
                }
            else:
                # Folder seen before — increment count
                entry = children[child_path]
                if entry.get("is_folder"):
                    entry["child_count"] = entry.get("child_count", 0) + 1

        return sorted(children.values(), key=lambda x: x["name"])

    async def find_by_type(self, tag_type: TagType) -> list[TagUnion]:
        """Find all tags of a specific type."""
        return [t for t in self._tags.values() if t.tag_type == tag_type]

    async def find_by_scan_class(self, scan_class: ScanClass) -> list[str]:
        """Find all tag paths in a given scan class."""
        return [
            path for path, tag in self._tags.items()
            if tag.scan_class == scan_class and tag.enabled
        ]

    async def find_by_area(self, area: str) -> list[str]:
        """Find all tag paths in a given area."""
        return [
            path for path, tag in self._tags.items()
            if tag.area == area
        ]

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    async def to_definitions_list(self) -> list[dict[str, Any]]:
        """Export all tag definitions as a list of dicts (for JSON persistence)."""
        return [tag.model_dump(mode="json") for tag in self._tags.values()]

    async def get_stats(self) -> dict[str, Any]:
        """Summary statistics about the registry."""
        type_counts: dict[str, int] = defaultdict(int)
        scan_class_counts: dict[str, int] = defaultdict(int)
        quality_counts: dict[str, int] = defaultdict(int)

        for tag in self._tags.values():
            type_counts[tag.tag_type.value] += 1
            scan_class_counts[tag.scan_class.value] += 1

        for tv in self._values.values():
            quality_counts[tv.quality.value] += 1

        return {
            "total_tags": len(self._tags),
            "by_type": dict(type_counts),
            "by_scan_class": dict(scan_class_counts),
            "by_quality": dict(quality_counts),
            "dependency_edges": sum(len(v) for v in self._dependents.values()),
        }

    # ------------------------------------------------------------------
    # Change notification
    # ------------------------------------------------------------------

    def on_change(self, callback: Any) -> None:
        """Register a callback for tag value changes.

        Callback signature: async def callback(path: str, value: TagValue) -> None
        """
        self._change_callbacks.append(callback)

    async def _notify_change(self, path: str, value: TagValue) -> None:
        """Notify all registered callbacks of a value change."""
        for cb in self._change_callbacks:
            try:
                await cb(path, value)
            except Exception:
                logger.exception("Change callback error for tag %s", path)

    # ------------------------------------------------------------------
    # Dependency tracking
    # ------------------------------------------------------------------

    def _rebuild_dependencies_for(self, tag: TagUnion) -> None:
        """Extract dependencies from a tag and update the maps.

        Must be called with the lock held.
        """
        sources: set[str] = set()

        if isinstance(tag, ExpressionTag):
            # Extract {tag_path} references from expression
            sources = set(_TAG_REF_RE.findall(tag.expression))
            # Also use explicitly declared dependencies
            sources.update(tag.dependencies)

        elif isinstance(tag, ComputedTag):
            sources = set(tag.sources.values())

        elif isinstance(tag, DerivedTag):
            sources = {s.tag_path for s in tag.sources}

        elif isinstance(tag, ReferenceTag):
            sources = {tag.source_path}

        # Update forward map (source → dependents)
        for source in sources:
            self._dependents[source].add(tag.path)

        # Update reverse map (dependent → sources)
        if sources:
            self._dependencies[tag.path] = sources
