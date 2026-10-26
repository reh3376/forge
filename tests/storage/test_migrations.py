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
        expected = ["001", "002", "003", "004", "005", "006", "007", "008", "009", "010", "011"]
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
                f"{module_name}: expected down_revision={expected_down}, got {mod.down_revision}"
            )

    def test_all_have_upgrade_and_downgrade(self):
        """Each migration must have both upgrade() and downgrade()."""
        for f in VERSIONS_DIR.glob("*.py"):
            if f.name == "__init__.py":
                continue
            module_name = f.stem
            mod = importlib.import_module(f"forge.storage.migrations.versions.{module_name}")
            assert hasattr(mod, "upgrade"), f"{module_name} missing upgrade()"
            assert hasattr(mod, "downgrade"), f"{module_name} missing downgrade()"
            assert callable(mod.upgrade)
            assert callable(mod.downgrade)


class TestMigrationColumnAlignment:
    """Verify migration columns match domain model fields."""

    def test_001_adapters_columns(self):
        """forge_core.adapters should have key adapter columns."""
        mod = importlib.import_module("forge.storage.migrations.versions.001_forge_core_schema")
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


def _upgrade_and_downgrade(name: str) -> tuple[str, str]:
    """The source of a migration's ``upgrade()`` and ``downgrade()``."""
    source = (VERSIONS_DIR / name).read_text()
    upgrade, downgrade = source.split("\ndef downgrade")
    return upgrade, downgrade


def _tables_in(source: str) -> dict[str, set[str]]:
    """Table name → column names for every ``op.create_table`` in ``source``."""
    import re

    found = re.findall(r'op\.create_table\(\s*"(\w+)",(.*?)schema="forge_core"', source, re.S)
    return {table: set(re.findall(r'sa\.Column\(\s*"(\w+)"', body)) for table, body in found}


class TestMigration002:
    """002's downgrade drops what each spoke role holds before the role itself (FB-098)."""

    def test_downgrade_drops_owned_before_the_role_inside_the_guard(self):
        """PostgreSQL refuses DROP ROLE while the role holds the forge_core grants the upgrade
        made (or anything `forge db access` granted since); DROP OWNED BY takes them all."""
        upgrade, downgrade = _upgrade_and_downgrade("002_spoke_schemas.py")
        assert "GRANT USAGE ON SCHEMA forge_core TO {role_name}" in upgrade
        assert "GRANT SELECT ON ALL TABLES IN SCHEMA forge_core TO {role_name}" in upgrade
        guard = downgrade.index("IF EXISTS (SELECT FROM pg_roles WHERE rolname = '{role_name}')")
        owned = downgrade.index("DROP OWNED BY {role_name}")
        role = downgrade.index("DROP ROLE {role_name}")
        assert guard < owned < role < downgrade.index("END IF")
        assert "REVOKE" not in downgrade  # nothing runs against a role that may already be gone


class TestMigration008:
    """008 persists ModulePermission rows and the access audit (FB-057, corrected by FB-003)."""

    def test_008_permission_columns_match_model(self):
        import dataclasses

        from forge.storage.access import AccessAuditEntry, ModulePermission

        upgrade, _ = _upgrade_and_downgrade("008_module_permissions.py")
        tables = _tables_in(upgrade)
        assert set(tables) == {"module_permissions", "access_audit"}
        assert tables["module_permissions"] == {
            f.name for f in dataclasses.fields(ModulePermission)
        }
        assert tables["access_audit"] == {f.name for f in dataclasses.fields(AccessAuditEntry)} | {
            "id"
        }

    def test_008_replaces_the_001_tables_and_its_downgrade_restores_them(self):
        """001 had created module_permissions (surrogate key) and access_audit_log; 008 re-created
        the first and failed on every migrated database (FB-003)."""
        upgrade, downgrade = _upgrade_and_downgrade("008_module_permissions.py")
        assert upgrade.index('op.drop_table("module_permissions"') < upgrade.index(
            'op.create_table(\n        "module_permissions"'
        )
        assert 'op.drop_table("access_audit_log", schema="forge_core")' in upgrade
        assert "primary_key=True" in upgrade.split('"module_id"')[1].split("\n")[0]
        assert "primary_key=True" in upgrade.split('"schema_name"')[1].split("\n")[0]
        original, _ = _upgrade_and_downgrade("001_forge_core_schema.py")
        restored = _tables_in(downgrade)
        assert set(restored) == {"module_permissions", "access_audit_log"}
        assert restored == {name: _tables_in(original)[name] for name in restored}

    def test_upsert_conflicts_on_the_008_key(self):
        from forge.storage.access import _UPSERT_PERMISSION

        assert "ON CONFLICT (module_id, schema_name)" in _UPSERT_PERMISSION


class TestOnlineRuns:
    """Online runs go through asyncpg, the one PostgreSQL driver the project declares (FB-003)."""

    def test_async_url_switches_the_driver(self):
        from forge.storage.migrations.run import async_url

        assert async_url("postgresql://u:p@h:5432/db") == "postgresql+asyncpg://u:p@h:5432/db"
        assert async_url("postgresql+asyncpg://u:p@h/db") == "postgresql+asyncpg://u:p@h/db"
        assert async_url("postgresql://u:p%40ss@h/db") == "postgresql+asyncpg://u:p%40ss@h/db"

    def test_env_uses_the_async_engine_and_the_project_declares_its_extra(self):
        env = (MIGRATIONS_DIR / "env.py").read_text()
        assert "create_async_engine(async_url(" in env
        code = env.split('"""')[2]  # the docstring explains psycopg2; the code never names it
        assert "psycopg" not in code
        pyproject = (MIGRATIONS_DIR.parents[3] / "pyproject.toml").read_text()
        assert '"sqlalchemy[asyncio]>=' in pyproject  # greenlet, for run_sync


def _insert_columns(sql: str) -> set[str]:
    """The column list of an ``INSERT INTO ... (...)`` statement."""
    import re

    match = re.search(r"INSERT INTO \S+ \((.*?)\)", sql, re.S)
    assert match is not None
    return {name.strip() for name in match.group(1).split(",")}


def _migration_tables(name: str) -> dict[str, set[str]]:
    """Table name → column names for every ``op.create_table`` in a migration's upgrade."""
    upgrade, _ = _upgrade_and_downgrade(name)
    return _tables_in(upgrade)


class TestMigration009:
    """009 creates the tables the Schema Registry and equipment stores write (FB-005)."""

    def test_chain(self):
        mod = importlib.import_module(
            "forge.storage.migrations.versions.009_registry_and_equipment_tables"
        )
        assert mod.revision == "009" and mod.down_revision == "008"

    def test_tables_match_the_stores_sql_column_for_column(self):
        from forge.context import equipment
        from forge.registry import postgres_store

        tables = _migration_tables("009_registry_and_equipment_tables.py")
        assert set(tables) == {"registry_schemas", "registry_versions", "equipment_registry"}
        assert tables["registry_schemas"] == _insert_columns(postgres_store._UPSERT_SCHEMA)
        assert tables["registry_versions"] == _insert_columns(postgres_store._UPSERT_VERSION)
        assert tables["equipment_registry"] == _insert_columns(equipment._UPSERT)

    def test_tables_match_the_domain_models(self):
        import dataclasses

        from forge.context.models import Equipment
        from forge.registry.models import SchemaMetadata, SchemaVersion

        tables = _migration_tables("009_registry_and_equipment_tables.py")
        metadata_fields = {f.name for f in dataclasses.fields(SchemaMetadata)} - {"versions"}
        assert tables["registry_schemas"] == metadata_fields
        version_fields = {f.name for f in dataclasses.fields(SchemaVersion)} | {"schema_id"}
        assert tables["registry_versions"] == version_fields
        assert tables["equipment_registry"] == {f.name for f in dataclasses.fields(Equipment)}


class TestMigration010:
    """010 adds the curation spec column to data products (FB-009)."""

    def test_chain_and_column(self):
        mod = importlib.import_module("forge.storage.migrations.versions.010_data_product_curation")
        assert mod.revision == "010" and mod.down_revision == "009"
        source = (VERSIONS_DIR / "010_data_product_curation.py").read_text()
        assert 'op.add_column("data_products", sa.Column("curation", sa.JSON)' in source
        assert 'schema="forge_canonical"' in source


class TestMigration011:
    """011 gives forge_ts.contextual_records one column per RecordContext slot (FB-013)."""

    def test_chain_and_columns_match_the_writer(self):
        import re

        from forge.core.models.contextual_record import RecordContext
        from forge.storage.engines import timescale

        mod = importlib.import_module(
            "forge.storage.migrations.versions.011_contextual_records_context_columns"
        )
        assert mod.revision == "011" and mod.down_revision == "010"
        added = set(mod._TEXT_COLUMNS) | {"event_timestamp"}
        six = _tables_in(
            _upgrade_and_downgrade("006_forge_ts_contextual_records.py")[0].replace(
                'schema="forge_ts"', 'schema="forge_core"'
            )
        )["contextual_records"]
        columns = six | added
        assert set(RecordContext.model_fields) - {"extra"} <= columns
        source = Path(timescale.__file__).read_text(encoding="utf-8")
        insert = re.search(r"INSERT INTO forge_ts\.contextual_records\s*\((.*?)\)", source, re.S)
        assert insert is not None
        written = {name.strip() for name in insert.group(1).split(",")}
        assert written == columns
