"""Context resolvers — extract operational meaning from tag paths and state.

Each resolver implements a single responsibility:
    AreaResolver         — tag path → area name
    EquipmentResolver    — tag path → equipment_id
    BatchContextResolver — area → (batch_id, lot_id, recipe_id)
    OperatingModeResolver — area/equipment → operating mode

Resolvers are composed into an EnrichmentPipeline that runs all of them
and produces a complete EnrichmentContext for record building.

Design decisions:
    D1: Resolvers are synchronous for path-based lookups, async for
        external queries (MES, CMMS).  The pipeline handles both.
    D2: All resolvers use configurable rule tables, not hardcoded logic.
        Rules are loaded from JSON config files (Git-native).
    D3: Failed resolution produces None, not an error.  Missing context
        is captured as absent fields, not dropped records.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Enrichment context — output of the full pipeline
# ---------------------------------------------------------------------------


class EnrichmentContext(BaseModel):
    """Complete operational context resolved for a tag value.

    This is the intermediate representation between raw resolution
    and the final RecordContext. The record builder maps this into
    the ContextualRecord.
    """

    site: str | None = None
    area: str | None = None
    equipment_id: str | None = None
    batch_id: str | None = None
    lot_id: str | None = None
    recipe_id: str | None = None
    operating_mode: str | None = None
    shift: str | None = None
    operator_id: str | None = None
    extra: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Area Resolver (2A.4.1)
# ---------------------------------------------------------------------------


class AreaRule(BaseModel):
    """A path pattern → area mapping rule."""
    pattern: str  # regex or prefix pattern
    area: str
    site: str = ""


class AreaResolver:
    """Resolves tag paths to area names using configurable rules.

    Rules are matched in order — first match wins.  The default rules
    use the WHK convention: WH/{connection}/{area}/...

    Example:
        resolver = AreaResolver(rules=[
            AreaRule(pattern="WH/WHK01/Distillery01/.*", area="Distillery", site="WH"),
            AreaRule(pattern="WH/WHK01/Granary01/.*", area="Granary", site="WH"),
        ])
        resolver.resolve("WH/WHK01/Distillery01/TIT_2010/Out_PV")
        # → ("Distillery", "WH")
    """

    def __init__(self, rules: list[AreaRule] | None = None) -> None:
        self._rules: list[tuple[re.Pattern, str, str]] = []
        for rule in (rules or []):
            self._rules.append((re.compile(rule.pattern), rule.area, rule.site))

        # Default rule: extract area from 3rd path segment
        # WH/WHK01/Distillery01/... → area="Distillery01", site="WH"
        self._use_default_extraction = len(self._rules) == 0

    def resolve(self, tag_path: str) -> tuple[str | None, str | None]:
        """Resolve a tag path to (area, site). Returns (None, None) if no match."""
        # Try explicit rules first
        for compiled, area, site in self._rules:
            if compiled.match(tag_path):
                return area, site

        # Default heuristic: split path and use segments
        if self._use_default_extraction:
            return self._extract_from_path(tag_path)

        return None, None

    @staticmethod
    def _extract_from_path(tag_path: str) -> tuple[str | None, str | None]:
        """Extract area and site from path segments.

        Convention: {site}/{connection}/{area}/...
        Example: WH/WHK01/Distillery01/TIT_2010/Out_PV
                 site=WH, area=Distillery01
        """
        parts = tag_path.split("/")
        if len(parts) >= 3:
            return parts[2], parts[0]  # area, site
        if len(parts) >= 1:
            return None, parts[0]
        return None, None


# ---------------------------------------------------------------------------
# Equipment Resolver (2A.4.2)
# ---------------------------------------------------------------------------


class EquipmentRule(BaseModel):
    """A path pattern → equipment_id mapping rule."""
    pattern: str  # regex with named group 'equip' or direct mapping
    equipment_id: str = ""  # Static ID; empty means extract from path


class EquipmentResolver:
    """Resolves tag paths to equipment IDs.

    Two modes:
        1. Explicit rules: regex patterns with static or captured equipment_id
        2. Default heuristic: equipment is the 4th-to-last path segment
           (assumes .../equipment_id/tag_suffix pattern)

    Example:
        resolver = EquipmentResolver()
        resolver.resolve("WH/WHK01/Distillery01/TIT_2010/Out_PV")
        # → "TIT_2010"
    """

    def __init__(self, rules: list[EquipmentRule] | None = None) -> None:
        self._rules: list[tuple[re.Pattern, str]] = []
        for rule in (rules or []):
            self._rules.append((re.compile(rule.pattern), rule.equipment_id))
        self._use_default_extraction = len(self._rules) == 0

    def resolve(self, tag_path: str) -> str | None:
        """Resolve a tag path to an equipment_id."""
        for compiled, equip_id in self._rules:
            m = compiled.match(tag_path)
            if m:
                if equip_id:
                    return equip_id
                # Try named group 'equip'
                try:
                    return m.group("equip")
                except (IndexError, AttributeError):
                    pass

        if self._use_default_extraction:
            return self._extract_from_path(tag_path)

        return None

    @staticmethod
    def _extract_from_path(tag_path: str) -> str | None:
        """Extract equipment_id from path convention.

        Convention: .../{equipment_id}/{tag_suffix}
        The equipment is the second-to-last segment.
        Example: WH/WHK01/Distillery01/TIT_2010/Out_PV → "TIT_2010"
        """
        parts = tag_path.split("/")
        if len(parts) >= 2:
            return parts[-2]
        return None


# ---------------------------------------------------------------------------
# Batch/Recipe Context Resolver (2A.4.3)
# ---------------------------------------------------------------------------


class BatchContext(BaseModel):
    """Batch/recipe context for an area or equipment."""
    batch_id: str | None = None
    lot_id: str | None = None
    recipe_id: str | None = None


class BatchContextResolver:
    """Resolves current batch/recipe context for an area.

    In production, this queries MES for active production orders.
    For now, it uses a configurable static mapping (populated by
    MES webhook or periodic poll).

    The resolver is area-keyed: each area can have one active batch.
    """

    def __init__(self) -> None:
        # area → BatchContext (updated by MES events or polling)
        self._active_batches: dict[str, BatchContext] = {}

    def set_active_batch(
        self,
        area: str,
        batch_id: str | None = None,
        lot_id: str | None = None,
        recipe_id: str | None = None,
    ) -> None:
        """Update the active batch for an area (called by MES integration)."""
        self._active_batches[area] = BatchContext(
            batch_id=batch_id,
            lot_id=lot_id,
            recipe_id=recipe_id,
        )

    def clear_active_batch(self, area: str) -> None:
        """Clear the active batch for an area (batch completed/cancelled)."""
        self._active_batches.pop(area, None)

    def resolve(self, area: str | None) -> BatchContext:
        """Get the current batch context for an area."""
        if area and area in self._active_batches:
            return self._active_batches[area]
        return BatchContext()

    @property
    def active_areas(self) -> list[str]:
        """List areas with active batches."""
        return list(self._active_batches.keys())


# ---------------------------------------------------------------------------
# Operating Mode Resolver (2A.4.5)
# ---------------------------------------------------------------------------


class OperatingModeResolver:
    """Resolves current operating mode for an area or equipment.

    Operating modes per ISA-88/95:
        PRODUCTION  — normal manufacturing
        CIP         — clean-in-place cycle
        IDLE        — equipment available but not producing
        STARTUP     — transition to production
        SHUTDOWN    — transition to idle
        MAINTENANCE — planned maintenance
        ERROR       — faulted state

    Mode can come from:
        1. A dedicated PLC tag (e.g., Area/OperatingMode)
        2. MES status (via BatchContextResolver or direct query)
        3. Manual override

    The resolver uses a priority-based source: PLC tag > MES > manual.
    """

    def __init__(self) -> None:
        # area → (mode, source, timestamp)
        self._modes: dict[str, tuple[str, str, datetime]] = {}

    def set_mode(
        self,
        area: str,
        mode: str,
        source: str = "manual",
    ) -> None:
        """Update the operating mode for an area.

        Args:
            area: Area name
            mode: Operating mode string (PRODUCTION, CIP, IDLE, etc.)
            source: Where this mode came from (plc, mes, manual)
        """
        self._modes[area] = (mode.upper(), source, datetime.now(timezone.utc))

    def resolve(self, area: str | None) -> str | None:
        """Get current operating mode for an area."""
        if area and area in self._modes:
            return self._modes[area][0]
        return None

    def get_mode_detail(self, area: str) -> dict[str, Any] | None:
        """Get mode with metadata (source and timestamp)."""
        if area in self._modes:
            mode, source, ts = self._modes[area]
            return {"mode": mode, "source": source, "since": ts.isoformat()}
        return None


# ---------------------------------------------------------------------------
# Enrichment Pipeline (2A.4.6 orchestration)
# ---------------------------------------------------------------------------


class EnrichmentPipeline:
    """Composes all resolvers into a single enrichment pass.

    Given a tag path, runs all resolvers and produces an
    EnrichmentContext with as many fields populated as possible.

    Performance design (HMI < 300ms requirement):
        Path-based resolution (area, site, equipment_id) is deterministic
        for a given tag path and resolver config.  These results are cached
        in a dict keyed by tag_path so that regex/string-splitting only runs
        once per tag, not on every scan cycle.  Dynamic fields (batch, mode)
        are always resolved live since they change with production state.

        Cache invalidation: call invalidate_path_cache() when resolver rules
        change (rare — config reload).  Individual paths can be evicted with
        invalidate_path(tag_path).
    """

    def __init__(
        self,
        area_resolver: AreaResolver | None = None,
        equipment_resolver: EquipmentResolver | None = None,
        batch_resolver: BatchContextResolver | None = None,
        mode_resolver: OperatingModeResolver | None = None,
    ) -> None:
        self._area = area_resolver or AreaResolver()
        self._equipment = equipment_resolver or EquipmentResolver()
        self._batch = batch_resolver or BatchContextResolver()
        self._mode = mode_resolver or OperatingModeResolver()

        # Path-resolution cache: tag_path → (area, site, equipment_id)
        # These are static for a given path + resolver config.
        self._path_cache: dict[str, tuple[str | None, str | None, str | None]] = {}

    @property
    def area_resolver(self) -> AreaResolver:
        return self._area

    @property
    def equipment_resolver(self) -> EquipmentResolver:
        return self._equipment

    @property
    def batch_resolver(self) -> BatchContextResolver:
        return self._batch

    @property
    def mode_resolver(self) -> OperatingModeResolver:
        return self._mode

    @property
    def path_cache_size(self) -> int:
        """Number of cached path resolutions (for monitoring/testing)."""
        return len(self._path_cache)

    def invalidate_path_cache(self) -> None:
        """Clear all cached path resolutions.

        Call when resolver rules change (e.g., config reload).
        """
        self._path_cache.clear()

    def invalidate_path(self, tag_path: str) -> None:
        """Evict a single path from the cache."""
        self._path_cache.pop(tag_path, None)

    def _resolve_path(self, tag_path: str) -> tuple[str | None, str | None, str | None]:
        """Resolve path-based fields with caching.

        Returns (area, site, equipment_id). Cached after first resolution.
        """
        cached = self._path_cache.get(tag_path)
        if cached is not None:
            return cached

        area, site = self._area.resolve(tag_path)
        equipment_id = self._equipment.resolve(tag_path)
        result = (area, site, equipment_id)
        self._path_cache[tag_path] = result
        return result

    def enrich(self, tag_path: str) -> EnrichmentContext:
        """Run all resolvers for a tag path and return the merged context.

        Path-based fields (area, site, equipment_id) are cached for
        sub-microsecond access on repeated calls.  Dynamic fields
        (batch, mode) are resolved live every time.
        """
        # Cached path resolution
        area, site, equipment_id = self._resolve_path(tag_path)

        # Dynamic state (always live — changes with production activity)
        batch_ctx = self._batch.resolve(area)
        operating_mode = self._mode.resolve(area)

        return EnrichmentContext(
            site=site,
            area=area,
            equipment_id=equipment_id,
            batch_id=batch_ctx.batch_id,
            lot_id=batch_ctx.lot_id,
            recipe_id=batch_ctx.recipe_id,
            operating_mode=operating_mode,
        )
