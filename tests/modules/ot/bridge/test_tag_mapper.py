"""Tests for the bridge tag mapper."""

import pytest

from forge.modules.ot.bridge.models import BridgeConfig, TagMappingRule
from forge.modules.ot.bridge.tag_mapper import TagMapper
from forge.modules.ot.opcua_client.paths import PathNormalizer


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_mapper(
    *,
    tag_provider: str = "WHK01",
    include_patterns: list[str] | None = None,
    exclude_patterns: list[str] | None = None,
    mapping_rules: list[TagMappingRule] | None = None,
) -> TagMapper:
    config = BridgeConfig(
        tag_provider=tag_provider,
        include_patterns=include_patterns or [],
        exclude_patterns=exclude_patterns or [],
        mapping_rules=mapping_rules or [],
    )
    normalizer = PathNormalizer(
        site_prefix="WH",
        namespace_map={2: "WHK01"},
    )
    return TagMapper(config, normalizer)


# ---------------------------------------------------------------------------
# Forward mapping tests
# ---------------------------------------------------------------------------


class TestForwardMapping:
    """Tests for Ignition → Forge path conversion."""

    def test_basic_mapping(self):
        mapper = _make_mapper()
        m = mapper.map("[WHK01]Distillery01/TIT_2010/Out_PV")
        assert m is not None
        assert m.forge_path == "WH/WHK01/Distillery01/TIT_2010/Out_PV"
        assert m.connection_name == "WHK01"

    def test_nested_path(self):
        mapper = _make_mapper()
        m = mapper.map("[WHK01]WH/WHK01/Distillery01/Utility01/LIT_6050B/Out_PV")
        assert m is not None
        assert "LIT_6050B" in m.forge_path

    def test_non_bracket_path_excluded(self):
        mapper = _make_mapper()
        m = mapper.map("bare/path/no/brackets")
        assert m is None

    def test_wrong_provider_excluded(self):
        mapper = _make_mapper(tag_provider="WHK01")
        m = mapper.map("[OTHER]Distillery01/tag")
        assert m is None

    def test_caching(self):
        mapper = _make_mapper()
        path = "[WHK01]Distillery01/tag"
        m1 = mapper.map(path)
        m2 = mapper.map(path)
        assert m1 is m2  # Same object (cached)


# ---------------------------------------------------------------------------
# Include/exclude filtering
# ---------------------------------------------------------------------------


class TestFiltering:
    """Tests for include/exclude pattern filtering."""

    def test_include_pattern_match(self):
        mapper = _make_mapper(include_patterns=["Distillery01/*"])
        m = mapper.map("[WHK01]Distillery01/tag")
        assert m is not None

    def test_include_pattern_no_match(self):
        mapper = _make_mapper(include_patterns=["Distillery01/*"])
        m = mapper.map("[WHK01]Granary01/tag")
        assert m is None

    def test_exclude_pattern(self):
        mapper = _make_mapper(exclude_patterns=["*/_meta_*"])
        m1 = mapper.map("[WHK01]Distillery01/tag")
        m2 = mapper.map("[WHK01]Distillery01/_meta_info")
        assert m1 is not None
        assert m2 is None

    def test_include_and_exclude_combined(self):
        mapper = _make_mapper(
            include_patterns=["Distillery01/*"],
            exclude_patterns=["*/Debug*"],
        )
        m1 = mapper.map("[WHK01]Distillery01/TIT_2010")
        m2 = mapper.map("[WHK01]Distillery01/Debug_Counter")
        m3 = mapper.map("[WHK01]Granary01/TIT_3010")
        assert m1 is not None
        assert m2 is None   # Excluded by pattern
        assert m3 is None   # Not included

    def test_empty_include_means_all(self):
        mapper = _make_mapper(include_patterns=[])
        m = mapper.map("[WHK01]any/path/at/all")
        assert m is not None


# ---------------------------------------------------------------------------
# Mapping rules
# ---------------------------------------------------------------------------


class TestMappingRules:
    """Tests for configurable mapping rules."""

    def test_rule_with_strip_prefix(self):
        rule = TagMappingRule(
            ignition_pattern="WH/WHK01/*",
            strip_prefix="WH/WHK01/",
            forge_prefix="WH/WHK01/",
        )
        mapper = _make_mapper(mapping_rules=[rule])
        m = mapper.map("[WHK01]WH/WHK01/Distillery01/tag")
        assert m is not None
        assert m.forge_path == "WH/WHK01/Distillery01/tag"
        assert m.rule is rule

    def test_rule_disabled(self):
        rule = TagMappingRule(
            ignition_pattern="*",
            forge_prefix="CUSTOM/",
            enabled=False,
        )
        mapper = _make_mapper(mapping_rules=[rule])
        m = mapper.map("[WHK01]tag")
        assert m is not None
        assert m.rule is None  # Disabled rule not matched

    def test_first_matching_rule_wins(self):
        rule1 = TagMappingRule(
            ignition_pattern="Distillery01/*",
            forge_prefix="DIST/",
        )
        rule2 = TagMappingRule(
            ignition_pattern="*",
            forge_prefix="CATCH_ALL/",
        )
        mapper = _make_mapper(mapping_rules=[rule1, rule2])
        m = mapper.map("[WHK01]Distillery01/tag")
        assert m is not None
        assert m.forge_path.startswith("DIST/")
        assert m.rule is rule1


# ---------------------------------------------------------------------------
# Reverse mapping
# ---------------------------------------------------------------------------


class TestReverseMapping:
    """Tests for Forge → Ignition reverse lookup."""

    def test_reverse_after_forward(self):
        mapper = _make_mapper()
        m = mapper.map("[WHK01]Distillery01/tag")
        assert m is not None
        ign = mapper.to_ignition(m.forge_path)
        assert ign == "[WHK01]Distillery01/tag"

    def test_reverse_unknown_path(self):
        mapper = _make_mapper()
        ign = mapper.to_ignition("WH/WHK01/unknown/path")
        assert ign is None


# ---------------------------------------------------------------------------
# Registry queries
# ---------------------------------------------------------------------------


class TestRegistry:
    """Tests for mapper registry access."""

    def test_mapped_count(self):
        mapper = _make_mapper()
        assert mapper.mapped_count == 0
        mapper.map("[WHK01]tag1")
        mapper.map("[WHK01]tag2")
        assert mapper.mapped_count == 2

    def test_forge_paths(self):
        mapper = _make_mapper()
        mapper.map("[WHK01]tag1")
        mapper.map("[WHK01]tag2")
        paths = mapper.forge_paths
        assert len(paths) == 2

    def test_ignition_paths(self):
        mapper = _make_mapper()
        mapper.map("[WHK01]tag1")
        paths = mapper.ignition_paths
        assert "[WHK01]tag1" in paths

    def test_get_all_mappings(self):
        mapper = _make_mapper()
        mapper.map("[WHK01]tag1")
        mapper.map("[WHK01]tag2")
        all_m = mapper.get_all_mappings()
        assert len(all_m) == 2

    def test_clear(self):
        mapper = _make_mapper()
        mapper.map("[WHK01]tag1")
        assert mapper.mapped_count == 1
        mapper.clear()
        assert mapper.mapped_count == 0

    def test_map_batch(self):
        mapper = _make_mapper()
        results = mapper.map_batch([
            "[WHK01]tag1",
            "[OTHER]tag2",  # Wrong provider — excluded
            "[WHK01]tag3",
        ])
        assert len(results) == 2
