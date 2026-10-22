"""Tests for F20 Schema Registry domain models."""

from __future__ import annotations

import pytest

from forge.registry.models import (
    CompatibilityMode,
    SchemaMetadata,
    SchemaType,
    SchemaVersion,
)


class TestSchemaType:
    def test_values(self):
        assert SchemaType.ADAPTER_OUTPUT == "adapter_output"
        assert SchemaType.DATA_PRODUCT == "data_product"
        assert SchemaType.API == "api"
        assert SchemaType.EVENT == "event"
        assert SchemaType.GOVERNANCE == "governance"

    def test_all_five_types(self):
        assert len(SchemaType) == 5


class TestCompatibilityMode:
    def test_values(self):
        assert CompatibilityMode.BACKWARD == "BACKWARD"
        assert CompatibilityMode.FORWARD == "FORWARD"
        assert CompatibilityMode.FULL == "FULL"
        assert CompatibilityMode.NONE == "NONE"

    def test_all_four_modes(self):
        assert len(CompatibilityMode) == 4


class TestSchemaVersion:
    def test_compute_hash_deterministic(self):
        schema = {"type": "object", "properties": {"name": {"type": "string"}}}
        h1 = SchemaVersion.compute_hash(schema)
        h2 = SchemaVersion.compute_hash(schema)
        assert h1 == h2

    def test_compute_hash_key_order_independent(self):
        s1 = {"b": 2, "a": 1}
        s2 = {"a": 1, "b": 2}
        assert SchemaVersion.compute_hash(s1) == SchemaVersion.compute_hash(s2)

    def test_compute_hash_differs_for_different_schemas(self):
        s1 = {"type": "object"}
        s2 = {"type": "array"}
        assert SchemaVersion.compute_hash(s1) != SchemaVersion.compute_hash(s2)

    def test_frozen(self):
        v = SchemaVersion(
            version=1,
            schema_json={"type": "object"},
            integrity_hash="abc",
        )
        assert v.version == 1
        # frozen dataclass — cannot reassign
        import pytest as _pytest

        with _pytest.raises(AttributeError):
            v.version = 2  # type: ignore[misc]

    def test_previous_version_default(self):
        v = SchemaVersion(version=1, schema_json={}, integrity_hash="x")
        assert v.previous_version is None


class TestSchemaMetadata:
    def _make(self, **overrides) -> SchemaMetadata:
        defaults = {
            "schema_id": "forge://schemas/test/Widget",
            "name": "Test Schema",
            "schema_type": SchemaType.ADAPTER_OUTPUT,
        }
        defaults.update(overrides)
        return SchemaMetadata(**defaults)

    def test_defaults(self):
        m = self._make()
        assert m.compatibility == CompatibilityMode.BACKWARD
        assert m.latest_version == 0
        assert m.versions == []
        assert m.status == "active"

    def test_add_version(self):
        m = self._make()
        schema = {"type": "object", "properties": {"temp": {"type": "number"}}}
        v = m.add_version(schema, description="Initial schema")
        assert v.version == 1
        assert v.previous_version is None
        assert m.latest_version == 1
        assert len(m.versions) == 1

    def test_add_multiple_versions(self):
        m = self._make()
        m.add_version({"v": 1})
        m.add_version({"v": 2})
        v3 = m.add_version({"v": 3})
        assert v3.version == 3
        assert v3.previous_version == 2
        assert m.latest_version == 3
        assert len(m.versions) == 3

    def test_get_version(self):
        m = self._make()
        m.add_version({"v": 1})
        m.add_version({"v": 2})
        v1 = m.get_version(1)
        assert v1 is not None
        assert v1.schema_json == {"v": 1}

    def test_get_version_not_found(self):
        m = self._make()
        assert m.get_version(99) is None

    def test_get_latest(self):
        m = self._make()
        m.add_version({"first": True})
        m.add_version({"second": True})
        latest = m.get_latest()
        assert latest is not None
        assert latest.schema_json == {"second": True}

    def test_get_latest_empty(self):
        m = self._make()
        assert m.get_latest() is None

    def test_integrity_hash_computed(self):
        m = self._make()
        v = m.add_version({"type": "object"})
        assert v.integrity_hash == SchemaVersion.compute_hash({"type": "object"})


class TestSchemaIdGrammar:
    """A registry entry is keyed by a schema id, never by a versioned ref (FB-008)."""

    def test_rejects_a_versioned_or_entity_less_id(self):
        from forge.core.schema_ref import SchemaRefError

        bad_ids = ("forge://schemas/whk-wms/Barrel/v1", "forge://schemas/whk-wms/v0.1.0", "Barrel")
        for bad in bad_ids:
            with pytest.raises(SchemaRefError):
                SchemaMetadata(schema_id=bad, name="Barrel", schema_type=SchemaType.ADAPTER_OUTPUT)

    def test_accepts_a_schema_id(self):
        meta = SchemaMetadata(
            schema_id="forge://schemas/whk-wms/Barrel",
            name="Barrel",
            schema_type=SchemaType.ADAPTER_OUTPUT,
        )
        assert meta.latest_version == 0
