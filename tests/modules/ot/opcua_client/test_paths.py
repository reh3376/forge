"""Tests for tag path normalization (paths.py).

Covers all conversion directions:
    - OPC-UA -> Forge (normalize)
    - Ignition -> Forge (from_ignition)
    - Forge -> OPC-UA (to_opcua_node_id)
    - Forge -> Ignition (to_ignition)
    - Round-trip integrity
"""

from __future__ import annotations

import pytest

from forge.modules.ot.opcua_client.paths import NormalizedPath, PathNormalizer


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def normalizer() -> PathNormalizer:
    """Standard WHK path normalizer matching production PLC configuration."""
    return PathNormalizer(
        site_prefix="WH",
        namespace_map={
            2: "WHK01",
            3: "WHK02",
        },
    )


# ---------------------------------------------------------------------------
# NormalizedPath model
# ---------------------------------------------------------------------------


class TestNormalizedPath:
    """Tests for the NormalizedPath frozen dataclass."""

    def test_creation(self):
        np = NormalizedPath(
            path="WH/WHK01/Distillery01/LIT_6050B/Out_PV",
            connection_name="WHK01",
            site_prefix="WH",
            original="ns=2;s=Distillery01.LIT_6050B.Out_PV",
            namespace_index=2,
        )
        assert np.path == "WH/WHK01/Distillery01/LIT_6050B/Out_PV"
        assert np.connection_name == "WHK01"
        assert np.namespace_index == 2

    def test_frozen(self):
        np = NormalizedPath(
            path="WH/WHK01/Tag",
            connection_name="WHK01",
            site_prefix="WH",
            original="test",
        )
        with pytest.raises(AttributeError):
            np.path = "modified"  # type: ignore[misc]


# ---------------------------------------------------------------------------
# OPC-UA -> Forge
# ---------------------------------------------------------------------------


class TestNormalize:
    """Tests for OPC-UA to Forge path normalization."""

    def test_full_opcua_node_id(self, normalizer):
        """ns=2;s=Distillery01.Utility01.LIT_6050B.Out_PV -> WH/WHK01/..."""
        result = normalizer.normalize("ns=2;s=Distillery01.Utility01.LIT_6050B.Out_PV")
        assert result.path == "WH/WHK01/Distillery01/Utility01/LIT_6050B/Out_PV"
        assert result.connection_name == "WHK01"
        assert result.namespace_index == 2

    def test_different_namespace(self, normalizer):
        """ns=3 should map to WHK02."""
        result = normalizer.normalize("ns=3;s=Granary.Silo01.Level")
        assert result.path == "WH/WHK02/Granary/Silo01/Level"
        assert result.connection_name == "WHK02"
        assert result.namespace_index == 3

    def test_unknown_namespace(self, normalizer):
        """Unknown namespace should use nsN fallback."""
        result = normalizer.normalize("ns=99;s=Test.Tag")
        assert result.path == "WH/ns99/Test/Tag"
        assert result.connection_name == "ns99"

    def test_bare_identifier(self, normalizer):
        """Bare string without ns prefix, with explicit ns arg."""
        result = normalizer.normalize(
            "Distillery01.Utility01.LIT_6050B.Out_PV",
            namespace_index=2,
        )
        assert result.path == "WH/WHK01/Distillery01/Utility01/LIT_6050B/Out_PV"

    def test_bare_identifier_no_ns(self, normalizer):
        """Bare string without namespace should use 'unknown'."""
        result = normalizer.normalize("SomeTag.SubTag")
        assert result.path == "WH/unknown/SomeTag/SubTag"
        assert result.connection_name == "unknown"

    def test_explicit_connection_name(self, normalizer):
        """Explicit connection_name overrides namespace lookup."""
        result = normalizer.normalize(
            "ns=2;s=Motor01.Speed",
            connection_name="plc200",
        )
        assert result.path == "WH/plc200/Motor01/Speed"
        assert result.connection_name == "plc200"

    def test_already_normalized(self, normalizer):
        """Path already in Forge format should pass through."""
        result = normalizer.normalize("WH/WHK01/Distillery01/Tag")
        assert result.path == "WH/WHK01/Distillery01/Tag"
        assert result.connection_name == "WHK01"

    def test_preserves_original(self, normalizer):
        """Original raw path should be preserved."""
        raw = "ns=2;s=Distillery01.Motor01.Speed"
        result = normalizer.normalize(raw)
        assert result.original == raw

    def test_dot_separator_replaced(self, normalizer):
        """Dots in OPC-UA identifiers become slashes."""
        result = normalizer.normalize("ns=2;s=A.B.C.D")
        assert result.path == "WH/WHK01/A/B/C/D"

    def test_redundant_slashes_cleaned(self, normalizer):
        """Double slashes in identifiers should be collapsed."""
        result = normalizer.normalize(
            "Dist01//Utility01///Tag",
            namespace_index=2,
        )
        assert "//" not in result.path

    def test_single_segment(self, normalizer):
        """Single-segment identifier."""
        result = normalizer.normalize("ns=2;s=GlobalTag")
        assert result.path == "WH/WHK01/GlobalTag"


# ---------------------------------------------------------------------------
# Ignition -> Forge
# ---------------------------------------------------------------------------


class TestFromIgnition:
    """Tests for Ignition bracket notation conversion."""

    def test_standard_ignition_path(self, normalizer):
        result = normalizer.from_ignition("[WHK01]Distillery01/Utility01/LIT_6050B/Out_PV")
        assert result.path == "WH/WHK01/Distillery01/Utility01/LIT_6050B/Out_PV"
        assert result.connection_name == "WHK01"

    def test_ignition_known_connection(self, normalizer):
        """Known connection should resolve namespace index."""
        result = normalizer.from_ignition("[WHK01]Tag")
        assert result.namespace_index == 2

    def test_ignition_unknown_connection(self, normalizer):
        """Unknown connection should have None namespace index."""
        result = normalizer.from_ignition("[SOMECONN]Tag")
        assert result.namespace_index is None

    def test_ignition_deep_path(self, normalizer):
        result = normalizer.from_ignition("[WHK01]A/B/C/D/E/F")
        assert result.path == "WH/WHK01/A/B/C/D/E/F"

    def test_ignition_with_dots(self, normalizer):
        """Dots in Ignition paths (CIP mixed notation) should become slashes."""
        result = normalizer.from_ignition("[WHK01]Distillery01.Utility01.Tag")
        assert result.path == "WH/WHK01/Distillery01/Utility01/Tag"

    def test_invalid_ignition_path(self, normalizer):
        """Path without brackets should raise ValueError."""
        with pytest.raises(ValueError, match="Not a valid Ignition path"):
            normalizer.from_ignition("NoBrackets/Just/Path")

    def test_preserves_original(self, normalizer):
        raw = "[WHK01]Dist/Tag"
        result = normalizer.from_ignition(raw)
        assert result.original == raw


# ---------------------------------------------------------------------------
# Forge -> OPC-UA
# ---------------------------------------------------------------------------


class TestToOpcuaNodeId:
    """Tests for Forge to OPC-UA NodeId conversion."""

    def test_standard_conversion(self, normalizer):
        result = normalizer.to_opcua_node_id("WH/WHK01/Distillery01/Utility01/LIT_6050B/Out_PV")
        assert result == "ns=2;s=Distillery01.Utility01.LIT_6050B.Out_PV"

    def test_different_connection(self, normalizer):
        result = normalizer.to_opcua_node_id("WH/WHK02/Granary/Silo01/Level")
        assert result == "ns=3;s=Granary.Silo01.Level"

    def test_explicit_namespace(self, normalizer):
        result = normalizer.to_opcua_node_id("WH/WHK01/Tag", namespace_index=5)
        assert result == "ns=5;s=Tag"

    def test_unknown_connection_raises(self, normalizer):
        with pytest.raises(ValueError, match="Cannot resolve namespace"):
            normalizer.to_opcua_node_id("WH/UNKNOWN/Tag")

    def test_single_segment(self, normalizer):
        result = normalizer.to_opcua_node_id("WH/WHK01/GlobalTag")
        assert result == "ns=2;s=GlobalTag"

    def test_without_site_prefix(self, normalizer):
        """Path without site prefix: first segment is connection."""
        result = normalizer.to_opcua_node_id("WHK01/Dist/Tag")
        assert result == "ns=2;s=Dist.Tag"


# ---------------------------------------------------------------------------
# Forge -> Ignition
# ---------------------------------------------------------------------------


class TestToIgnition:
    """Tests for Forge to Ignition conversion."""

    def test_standard_conversion(self, normalizer):
        result = normalizer.to_ignition("WH/WHK01/Distillery01/Utility01/LIT_6050B/Out_PV")
        assert result == "[WHK01]Distillery01/Utility01/LIT_6050B/Out_PV"

    def test_without_site_prefix(self, normalizer):
        result = normalizer.to_ignition("WHK01/Dist/Tag")
        assert result == "[WHK01]Dist/Tag"


# ---------------------------------------------------------------------------
# Round-trip tests
# ---------------------------------------------------------------------------


class TestRoundTrip:
    """Verify bidirectional conversion integrity."""

    def test_opcua_to_forge_to_opcua(self, normalizer):
        """OPC-UA -> Forge -> OPC-UA should produce the original NodeId."""
        original = "ns=2;s=Distillery01.Utility01.LIT_6050B.Out_PV"
        forge = normalizer.normalize(original)
        back = normalizer.to_opcua_node_id(forge.path)
        assert back == original

    def test_ignition_to_forge_to_ignition(self, normalizer):
        """Ignition -> Forge -> Ignition should produce the original path."""
        original = "[WHK01]Distillery01/Utility01/LIT_6050B/Out_PV"
        forge = normalizer.from_ignition(original)
        back = normalizer.to_ignition(forge.path)
        assert back == original

    def test_forge_to_opcua_to_forge(self, normalizer):
        """Forge -> OPC-UA -> Forge should produce the original path."""
        original = "WH/WHK01/Distillery01/Utility01/LIT_6050B/Out_PV"
        opcua = normalizer.to_opcua_node_id(original)
        forge = normalizer.normalize(opcua)
        assert forge.path == original


# ---------------------------------------------------------------------------
# Custom configuration
# ---------------------------------------------------------------------------


class TestCustomConfig:
    """Tests for non-default normalizer configurations."""

    def test_custom_site_prefix(self):
        n = PathNormalizer(site_prefix="ACME", namespace_map={2: "PLC01"})
        result = n.normalize("ns=2;s=Tank.Level")
        assert result.path == "ACME/PLC01/Tank/Level"
        assert result.site_prefix == "ACME"

    def test_slash_separator(self):
        """Some OPC-UA servers use slash separators already."""
        n = PathNormalizer(
            site_prefix="WH",
            namespace_map={2: "WHK01"},
            opcua_separator="/",
        )
        result = n.normalize("ns=2;s=Distillery01/Utility01/Tag")
        assert result.path == "WH/WHK01/Distillery01/Utility01/Tag"

    def test_empty_namespace_map(self):
        """No namespace map: connection names are nsN."""
        n = PathNormalizer(site_prefix="WH")
        result = n.normalize("ns=5;s=Some.Tag")
        assert result.path == "WH/ns5/Some/Tag"

    def test_auto_reverse_map(self):
        """connection_map should be auto-built from namespace_map."""
        n = PathNormalizer(namespace_map={2: "WHK01", 3: "WHK02"})
        assert n.connection_map == {"WHK01": 2, "WHK02": 3}
