"""Tag path mapper — translates between Ignition and Forge tag paths.

The mapper applies configurable rules to:
  1. Filter which Ignition tags are included in the bridge
  2. Convert Ignition bracket-notation to Forge-normalized paths
  3. Track all known mappings for coverage gap analysis

Unlike PathNormalizer (which is generic), TagMapper is bridge-specific:
it handles include/exclude patterns, mapping rules, and maintains a
registry of all discovered Ignition↔Forge path pairs.
"""

from __future__ import annotations

import fnmatch
import logging
import re
from typing import Any

from forge.modules.ot.bridge.models import (
    BridgeConfig,
    TagMapping,
    TagMappingRule,
)
from forge.modules.ot.opcua_client.paths import PathNormalizer

logger = logging.getLogger(__name__)

# Pattern for Ignition bracket prefix
_BRACKET_RE = re.compile(r"^\[([^\]]+)\](.*)$")


class TagMapper:
    """Bidirectional Ignition ↔ Forge tag path mapper with filtering.

    Usage::

        mapper = TagMapper(config, normalizer)
        mapping = mapper.map("[WHK01]WH/WHK01/Distillery01/TIT_2010/Out_PV")
        if mapping:
            print(mapping.forge_path)
            # "WH/WHK01/Distillery01/TIT_2010/Out_PV"

        # Reverse lookup
        ign_path = mapper.to_ignition("WH/WHK01/Distillery01/TIT_2010/Out_PV")
        # "[WHK01]WH/WHK01/Distillery01/TIT_2010/Out_PV"

    The mapper maintains an internal registry of all successful mappings,
    which is used by the coverage gap finder in Epic 5.2.
    """

    def __init__(
        self,
        config: BridgeConfig,
        normalizer: PathNormalizer | None = None,
    ) -> None:
        self._config = config
        self._normalizer = normalizer or PathNormalizer(
            site_prefix="WH",
            namespace_map={2: config.tag_provider},
        )

        # Registry: ignition_path -> TagMapping
        self._forward: dict[str, TagMapping] = {}
        # Reverse: forge_path -> ignition_path
        self._reverse: dict[str, str] = {}

    # ------------------------------------------------------------------
    # Forward mapping: Ignition → Forge
    # ------------------------------------------------------------------

    def map(self, ignition_path: str) -> TagMapping | None:
        """Map an Ignition tag path to a Forge-normalized path.

        Returns None if the tag is excluded by filtering rules.
        Successfully mapped tags are cached for reverse lookup.

        Args:
            ignition_path: Ignition bracket-notation path.

        Returns:
            TagMapping if included and mappable, None if excluded.
        """
        # Check cache
        if ignition_path in self._forward:
            return self._forward[ignition_path]

        # Extract connection and bare path
        match = _BRACKET_RE.match(ignition_path)
        if not match:
            logger.debug("Skipping non-bracket path: %s", ignition_path)
            return None

        connection = match.group(1)
        bare_path = match.group(2).strip("/")

        # Apply include/exclude filters
        if not self._is_included(bare_path, connection):
            return None

        # Find matching rule (if any)
        matched_rule = self._find_rule(bare_path)

        # Normalize path
        forge_path = self._normalize(ignition_path, bare_path, matched_rule)

        mapping = TagMapping(
            ignition_path=ignition_path,
            forge_path=forge_path,
            connection_name=connection,
            rule=matched_rule,
        )

        # Cache
        self._forward[ignition_path] = mapping
        self._reverse[forge_path] = ignition_path

        return mapping

    def map_batch(self, ignition_paths: list[str]) -> list[TagMapping]:
        """Map a batch of Ignition paths, filtering excluded tags.

        Returns only successfully mapped tags (excludes None results).
        """
        results: list[TagMapping] = []
        for path in ignition_paths:
            mapping = self.map(path)
            if mapping is not None:
                results.append(mapping)
        return results

    # ------------------------------------------------------------------
    # Reverse mapping: Forge → Ignition
    # ------------------------------------------------------------------

    def to_ignition(self, forge_path: str) -> str | None:
        """Look up the Ignition path for a known Forge-normalized path.

        Returns None if no mapping exists (tag was not discovered
        through the bridge).
        """
        return self._reverse.get(forge_path)

    # ------------------------------------------------------------------
    # Registry access (for coverage analysis)
    # ------------------------------------------------------------------

    @property
    def mapped_count(self) -> int:
        """Number of tags successfully mapped."""
        return len(self._forward)

    @property
    def forge_paths(self) -> set[str]:
        """All known Forge-normalized paths from the bridge."""
        return set(self._reverse.keys())

    @property
    def ignition_paths(self) -> set[str]:
        """All known Ignition paths from the bridge."""
        return set(self._forward.keys())

    def get_all_mappings(self) -> list[TagMapping]:
        """Return all cached mappings."""
        return list(self._forward.values())

    def clear(self) -> None:
        """Clear all cached mappings."""
        self._forward.clear()
        self._reverse.clear()

    # ------------------------------------------------------------------
    # Internal filtering
    # ------------------------------------------------------------------

    def _is_included(self, bare_path: str, connection: str) -> bool:
        """Check if a tag path passes the include/exclude filters.

        Logic:
          1. If include_patterns is non-empty, path must match at least one.
          2. If exclude_patterns is non-empty, path must NOT match any.
          3. Empty include_patterns means "include all".
        """
        # Provider filter
        if self._config.tag_provider and connection != self._config.tag_provider:
            return False

        # Include filter (empty = include all)
        if self._config.include_patterns:
            if not any(
                fnmatch.fnmatch(bare_path, pat)
                for pat in self._config.include_patterns
            ):
                return False

        # Exclude filter
        if self._config.exclude_patterns:
            if any(
                fnmatch.fnmatch(bare_path, pat)
                for pat in self._config.exclude_patterns
            ):
                return False

        return True

    def _find_rule(self, bare_path: str) -> TagMappingRule | None:
        """Find the first matching mapping rule for a bare path."""
        for rule in self._config.mapping_rules:
            if not rule.enabled:
                continue
            if fnmatch.fnmatch(bare_path, rule.ignition_pattern):
                return rule
        return None

    def _normalize(
        self,
        ignition_path: str,
        bare_path: str,
        rule: TagMappingRule | None,
    ) -> str:
        """Convert Ignition path to Forge-normalized path.

        Uses the matched rule if available, otherwise delegates to
        PathNormalizer.from_ignition().
        """
        if rule and rule.forge_prefix:
            # Rule-based normalization
            stripped = bare_path
            if rule.strip_prefix and stripped.startswith(rule.strip_prefix):
                stripped = stripped[len(rule.strip_prefix):]
            return f"{rule.forge_prefix}{stripped}".rstrip("/")

        # Default: use PathNormalizer
        try:
            normalized = self._normalizer.from_ignition(ignition_path)
            return normalized.path
        except ValueError:
            # Fallback: manual bracket extraction
            return f"WH/{bare_path}"
