"""Forge-issued module credentials: naming, role provisioning, persistence (FB-057 step 1)."""

from __future__ import annotations

import importlib
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from forge.storage.access import (
    _DEACTIVATE_PERMISSION,
    _INSERT_AUDIT,
    _SELECT_PERMISSIONS,
    _UPSERT_PERMISSION,
    AccessAuditEntry,
    AccessController,
    AccessLevel,
    InMemoryPermissionStore,
    ModulePermission,
    PostgresPermissionStore,
    module_schema,
    provisioning_statements,
    schema_role,
)

T0 = datetime(2026, 6, 1, 12, tzinfo=UTC)


def test_naming_matches_migration_002() -> None:
    assert module_schema("forge-mes") == "mod_mes"
    assert module_schema("whk-wms") == "mod_wms"
    assert module_schema("Forge-CMMS") == "mod_cmms"
    assert module_schema("bosc-ims") == "mod_bosc_ims"
    assert schema_role("mod_mes") == "forge_mod_mes"
    with pytest.raises(ValueError, match="schema name"):
        module_schema("whk-")
    with pytest.raises(ValueError, match="unsafe"):
        schema_role("mod_mes; DROP ROLE forge")

    migration = importlib.import_module("forge.storage.migrations.versions.002_spoke_schemas")
    defaults = AccessController().setup_default_grants()
    own = {p.schema_name for p in defaults if p.access_level == AccessLevel.WRITE}
    assert own == set(migration.SPOKE_SCHEMAS)  # access, router defaults and DDL agree (FB-004)
    assert {schema_role(s) for s in own} == {f"forge_{s}" for s in migration.SPOKE_SCHEMAS}


def test_provisioning_statements_per_level() -> None:
    stmts = provisioning_statements(
        "forge_mod_mes",
        "s3cr'et",
        [
            ("mod_mes", AccessLevel.ADMIN),
            ("forge_canonical", AccessLevel.READ),
            ("mod_shared", AccessLevel.WRITE),
        ],
    )
    assert (
        stmts[0].startswith("DO $$ BEGIN IF NOT EXISTS") and "CREATE ROLE forge_mod_mes" in stmts[0]
    )
    assert stmts[1] == "ALTER ROLE forge_mod_mes WITH LOGIN PASSWORD 's3cr''et'"  # quote doubled
    assert "GRANT USAGE, CREATE ON SCHEMA mod_mes TO forge_mod_mes" in stmts
    assert (
        "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA mod_mes TO forge_mod_mes"
        in stmts
    )
    assert "GRANT USAGE ON SCHEMA forge_canonical TO forge_mod_mes" in stmts
    assert "GRANT SELECT ON ALL TABLES IN SCHEMA forge_canonical TO forge_mod_mes" in stmts
    assert not any("SEQUENCES IN SCHEMA forge_canonical" in s for s in stmts)  # read: no sequences
    assert "GRANT USAGE ON SCHEMA mod_shared TO forge_mod_mes" in stmts  # write: no CREATE
    assert (
        "GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA mod_shared TO forge_mod_mes"
        in stmts
    )
    with pytest.raises(ValueError, match="unsafe"):
        provisioning_statements("forge_mod_mes", "x", [('mod_mes"; --', AccessLevel.READ)])


def test_issue_connection_provisions_the_role_and_never_stores_the_password() -> None:
    executed: list[list[str]] = []
    ac = AccessController()
    ac.grant("forge-mes", "forge_canonical", AccessLevel.READ)
    ac.grant("forge-mes", "mod_mes", AccessLevel.ADMIN)

    grant = ac.issue_connection(
        "forge-mes", pg_host="localhost", pg_port=5433, provisioner=executed.append
    )
    assert grant.role == "forge_mod_mes" and grant.schemas_accessible == [
        "mod_mes",
        "forge_canonical",
    ]
    assert (
        grant.search_path == "mod_mes,forge_canonical" and grant.access_level == AccessLevel.ADMIN
    )
    assert len(grant.password) >= 24 and grant.password in grant.connection_string
    assert grant.connection_string == (
        f"postgresql://forge_mod_mes:{grant.password}@localhost:5433/forge?schema=mod_mes"
    )
    assert grant.redacted() == "postgresql://forge_mod_mes:***@localhost:5433/forge?schema=mod_mes"
    assert executed == [grant.statements]
    assert f"PASSWORD '{grant.password}'" in grant.statements[1]
    assert grant.password not in repr(grant) and ":***@" in repr(grant)  # repr never leaks it
    issued = [e for e in ac.audit_log if e.action == "connection_issued"]
    assert len(issued) == 1 and "provisioned=yes" in issued[0].reason
    assert grant.password not in issued[0].reason

    # An explicit password is URL-encoded; re-issuing rotates (new statements, no provisioner).
    again = ac.issue_connection("forge-mes", password="p@ss/word")
    assert again.connection_string.startswith("postgresql://forge_mod_mes:p%40ss%2Fword@")
    assert again.statements[1] == "ALTER ROLE forge_mod_mes WITH LOGIN PASSWORD 'p@ss/word'"
    assert executed == [grant.statements]  # nothing ran without a provisioner


def test_restore_and_all_permissions_round_trip() -> None:
    rows = [
        ModulePermission("forge-mes", "mod_mes", AccessLevel.WRITE, granted_at=T0),
        ModulePermission("forge-mes", "mod_old", AccessLevel.WRITE, granted_at=T0, active=False),
    ]
    ac = AccessController.restore(rows)
    assert [p.schema_name for p in ac.list_grants("forge-mes")] == ["mod_mes"]
    assert ac.all_permissions() == rows and ac.audit_log == []


async def test_in_memory_permission_store() -> None:
    store = InMemoryPermissionStore()
    perm = ModulePermission("forge-mes", "mod_mes", AccessLevel.WRITE, granted_at=T0)
    await store.upsert(perm)
    await store.upsert(ModulePermission("forge-mes", "mod_mes", AccessLevel.ADMIN, granted_at=T0))
    assert [p.access_level for p in await store.list_permissions()] == [AccessLevel.ADMIN]
    await store.deactivate("forge-mes", "mod_mes")
    assert (await store.list_permissions())[0].active is False
    await store.deactivate("nobody", "mod_x")  # unknown: no error
    await store.append_audit(AccessAuditEntry("grant", "forge-mes", "mod_mes"))
    assert [e.action for e in store.audit] == ["grant"]


@pytest.fixture
def mock_pool():
    pool = MagicMock()
    conn = AsyncMock()
    pool.acquire.return_value.__aenter__ = AsyncMock(return_value=conn)
    pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)
    return pool, conn


async def test_postgres_permission_store_sql(mock_pool) -> None:
    pool, conn = mock_pool
    store = PostgresPermissionStore(pool)
    perm = ModulePermission(
        "forge-mes", "mod_mes", AccessLevel.ADMIN, granted_at=T0, granted_by="roger"
    )
    await store.upsert(perm)
    sql, *params = conn.execute.call_args_list[0].args
    assert sql is _UPSERT_PERMISSION
    assert params == ["forge-mes", "mod_mes", "admin", T0, "roger", None, True]

    await store.deactivate("forge-mes", "mod_mes")
    assert conn.execute.call_args_list[1].args == (_DEACTIVATE_PERMISSION, "forge-mes", "mod_mes")

    entry = AccessAuditEntry(
        "connection_issued", "forge-mes", "mod_mes", AccessLevel.ADMIN, "role=x"
    )
    await store.append_audit(entry)
    sql, *params = conn.execute.call_args_list[2].args
    assert sql is _INSERT_AUDIT
    assert params == [
        "connection_issued",
        "forge-mes",
        "mod_mes",
        "admin",
        "role=x",
        entry.timestamp,
    ]

    conn.fetch.return_value = [
        {
            "module_id": "forge-mes",
            "schema_name": "mod_mes",
            "access_level": "admin",
            "granted_at": T0,
            "granted_by": "roger",
            "expires_at": None,
            "active": True,
        }
    ]
    rows = await store.list_permissions()
    assert conn.fetch.call_args.args == (_SELECT_PERMISSIONS,)
    assert rows == [perm]
