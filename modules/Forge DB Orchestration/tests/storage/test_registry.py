"""Tests for the Forge Schema Registry."""

from datetime import datetime, timezone

from forge.storage.registry import (
    RetentionPolicy,
    SchemaEntry,
    SchemaRegistry,
    SchemaStatus,
    StorageEngine,
)


# ── SchemaEntry ─────────────────────────────────────────────────


class TestSchemaEntry:
    """Verify SchemaEntry creation, hashing, and integrity checks."""

    def _make_entry(self, **overrides) -> SchemaEntry:
        defaults = {
            "schema_id": "forge://schemas/whk-wms/Barrel/v1.0.0",
            "spoke_id": "whk-wms",
            "entity_name": "Barrel",
            "version": "1.0.0",
            "schema_json": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "serialNumber": {"type": "string"},
                },
            },
            "authoritative_spoke": "whk-wms",
            "storage_engine": StorageEngine.POSTGRESQL,
            "storage_namespace": "spoke_wms",
        }
        defaults.update(overrides)
        return SchemaEntry(**defaults)

    def test_auto_hash_on_creation(self):
        entry = self._make_entry()
        assert entry.integrity_hash != ""
        assert len(entry.integrity_hash) == 64  # SHA-256 hex

    def test_hash_is_deterministic(self):
        e1 = self._make_entry()
        e2 = self._make_entry()
        assert e1.integrity_hash == e2.integrity_hash

    def test_hash_changes_with_schema(self):
        e1 = self._make_entry()
        e2 = self._make_entry(
            schema_json={"type": "object", "properties": {"id": {"type": "integer"}}}
        )
        assert e1.integrity_hash != e2.integrity_hash

    def test_verify_integrity_passes(self):
        entry = self._make_entry()
        assert entry.verify_integrity() is True

    def test_verify_integrity_detects_tampering(self):
        entry = self._make_entry()
        entry.schema_json["properties"]["hacked"] = {"type": "string"}
        assert entry.verify_integrity() is False

    def test_default_status_is_draft(self):
        entry = self._make_entry()
        assert entry.status == SchemaStatus.DRAFT

    def test_default_retention_is_seven_years(self):
        entry = self._make_entry()
        assert entry.retention_policy == RetentionPolicy.SEVEN_YEARS

    def test_timestamps_set_on_creation(self):
        entry = self._make_entry()
        assert entry.registered_at is not None
        assert entry.updated_at is not None
        assert entry.registered_at.tzinfo is not None


# ── SchemaRegistry ──────────────────────────────────────────────


class TestSchemaRegistry:
    """Verify schema registration, lookup, and drift detection."""

    def _make_entry(self, spoke_id="whk-wms", entity="Barrel", **kw) -> SchemaEntry:
        return SchemaEntry(
            schema_id=f"forge://schemas/{spoke_id}/{entity}/v1.0.0",
            spoke_id=spoke_id,
            entity_name=entity,
            version="1.0.0",
            schema_json={"type": "object", "properties": {"id": {"type": "string"}}},
            authoritative_spoke=spoke_id,
            storage_engine=StorageEngine.POSTGRESQL,
            storage_namespace=f"spoke_{spoke_id.replace('-', '_')}",
            **kw,
        )

    def test_register_and_get(self):
        registry = SchemaRegistry()
        entry = self._make_entry()
        registry.register(entry)
        result = registry.get(entry.schema_id)
        assert result is not None
        assert result.entity_name == "Barrel"

    def test_register_updates_existing(self):
        registry = SchemaRegistry()
        e1 = self._make_entry()
        registry.register(e1)
        e2 = self._make_entry()
        e2.schema_json = {"type": "object", "properties": {"id": {"type": "integer"}}}
        registry.register(e2)
        assert registry.entry_count == 1
        result = registry.get(e1.schema_id)
        assert result.schema_json["properties"]["id"]["type"] == "integer"

    def test_list_by_spoke(self):
        registry = SchemaRegistry()
        registry.register(self._make_entry("whk-wms", "Barrel"))
        registry.register(self._make_entry("whk-wms", "Lot"))
        registry.register(self._make_entry("whk-mes", "Recipe"))
        wms_entries = registry.list_by_spoke("whk-wms")
        assert len(wms_entries) == 2

    def test_list_by_engine(self):
        registry = SchemaRegistry()
        registry.register(self._make_entry("whk-wms", "Barrel"))
        registry.register(
            SchemaEntry(
                schema_id="forge://schemas/whk-nms/Device/v1.0.0",
                spoke_id="whk-nms",
                entity_name="Device",
                version="1.0.0",
                schema_json={"type": "object"},
                authoritative_spoke="whk-nms",
                storage_engine=StorageEngine.NEO4J,
                storage_namespace="forge_graph",
            )
        )
        pg_entries = registry.list_by_engine(StorageEngine.POSTGRESQL)
        neo4j_entries = registry.list_by_engine(StorageEngine.NEO4J)
        assert len(pg_entries) == 1
        assert len(neo4j_entries) == 1

    def test_list_active(self):
        registry = SchemaRegistry()
        e1 = self._make_entry("whk-wms", "Barrel")
        e1.status = SchemaStatus.ACTIVE
        registry.register(e1)
        e2 = self._make_entry("whk-wms", "Lot")
        e2.status = SchemaStatus.DRAFT
        registry.register(e2)
        active = registry.list_active()
        assert len(active) == 1
        assert active[0].entity_name == "Barrel"

    def test_check_drift_clean(self):
        registry = SchemaRegistry()
        registry.register(self._make_entry())
        drifted = registry.check_drift("whk-wms")
        assert len(drifted) == 0

    def test_check_drift_detects_change(self):
        registry = SchemaRegistry()
        entry = self._make_entry()
        registry.register(entry)
        # Tamper after registration
        entry.schema_json["properties"]["new_field"] = {"type": "string"}
        drifted = registry.check_drift("whk-wms")
        assert len(drifted) == 1
        assert drifted[0][0] == entry.schema_id

    def test_get_authoritative_spoke(self):
        registry = SchemaRegistry()
        e = self._make_entry("whk-wms", "Barrel")
        e.status = SchemaStatus.ACTIVE
        registry.register(e)
        assert registry.get_authoritative_spoke("Barrel") == "whk-wms"

    def test_get_authoritative_spoke_none(self):
        registry = SchemaRegistry()
        assert registry.get_authoritative_spoke("NonExistent") is None

    def test_spoke_count(self):
        registry = SchemaRegistry()
        registry.register(self._make_entry("whk-wms", "Barrel"))
        registry.register(self._make_entry("whk-mes", "Recipe"))
        registry.register(self._make_entry("whk-cmms", "Asset"))
        assert registry.spoke_count == 3

    def test_entry_count(self):
        registry = SchemaRegistry()
        registry.register(self._make_entry("whk-wms", "Barrel"))
        registry.register(self._make_entry("whk-wms", "Lot"))
        assert registry.entry_count == 2
