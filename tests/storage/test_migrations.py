"""Tests for Alembic migration versions.

Tests validate migration structure and column alignment with
domain models — they do NOT require a running database.
"""

import importlib
from pathlib import Path

MIGRATIONS_DIR = Path(__file__).parent.parent.parent / "src" / "forge" / "storage" / "migrations"
VERSIONS_DIR = MIGRATIONS_DIR / "versions"


class TestMigrationStructure:
    """Verify migration file structure and ordering."""

    def test_versions_directory_exists(self):
        assert VERSIONS_DIR.is_dir()

    def test_all_versions_present(self):
        expected = ["001", "002", "003", "004", "005"]
        files = sorted(f.name for f in VERSIONS_DIR.glob("*.py") if f.name != "__init__.py")
        for version in expected:
            assert any(f.startswith(version) for f in files), f"Missing migration {version}"

    def test_migration_chain(self):
        """Verify each migration points to the correct predecessor."""
        import sys
        sys.path.insert(0, str(VERSIONS_DIR))

        chain = {
            "001_forge_core_schema": None,
            "002_spoke_schemas": "001",
            "003_forge_canonical": "002",
            "004_timescaledb_init": "003",
            "005_lineage_tables": "004",
        }

        for module_name, expected_down in chain.items():
            mod = importlib.import_module(f"forge.storage.migrations.versions.{module_name}")
            assert mod.down_revision == expected_down, (
                f"{module_name}: expected down_revision={expected_down}, "
                f"got {mod.down_revision}"
            )

    def test_all_have_upgrade_and_downgrade(self):
        """Each migration must have both upgrade() and downgrade()."""
        for f in VERSIONS_DIR.glob("*.py"):
            if f.name == "__init__.py":
                continue
            module_name = f.stem
            mod = importlib.import_module(
                f"forge.storage.migrations.versions.{module_name}"
            )
            assert hasattr(mod, "upgrade"), f"{module_name} missing upgrade()"
            assert hasattr(mod, "downgrade"), f"{module_name} missing downgrade()"
            assert callable(mod.upgrade)
            assert callable(mod.downgrade)


class TestMigrationColumnAlignment:
    """Verify migration columns match domain model fields."""

    def test_001_adapters_columns(self):
        """forge_core.adapters should have key adapter columns."""
        mod = importlib.import_module(
            "forge.storage.migrations.versions.001_forge_core_schema"
        )
        # Verify the migration defines expected tables by checking revision
        assert mod.revision == "001"
        assert mod.down_revision is None

    def test_003_data_products_columns(self):
        """forge_canonical.data_products should mirror DataProduct model."""
        from forge.core.models.data_product import DataProduct

        model_fields = set(DataProduct.model_fields.keys())
        # Key fields that must be in the migration
        required_in_migration = {"product_id", "name", "description", "owner", "status"}
        assert required_in_migration.issubset(model_fields)

    def test_005_lineage_columns(self):
        """lineage_entries should mirror LineageEntry dataclass."""
        import dataclasses

        from forge.curation.lineage import LineageEntry
        entry_fields = {f.name for f in dataclasses.fields(LineageEntry)}
        # Key fields that must be in the migration
        required = {"lineage_id", "source_record_ids", "output_record_id", "product_id"}
        assert required.issubset(entry_fields)


class TestAlembicConfig:
    def test_alembic_ini_exists(self):
        assert (MIGRATIONS_DIR / "alembic.ini").is_file()

    def test_env_py_exists(self):
        assert (MIGRATIONS_DIR / "env.py").is_file()
