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
    PersistentAccessController,
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


# ---------------------------------------------------------------------------
# PersistentAccessController (FB-003): grants and audit outlive the process
# ---------------------------------------------------------------------------


def test_prepare_connection_then_record_issued_is_issue_connection() -> None:
    ac = AccessController()
    ac.grant("forge-mes", "mod_mes", AccessLevel.WRITE)
    grant = ac.prepare_connection("forge-mes", pg_host="db", password="pw")
    assert [e.action for e in ac.audit_log] == ["grant"]  # nothing issued yet
    assert grant.connection_string == "postgresql://forge_mod_mes:pw@db:5432/forge?schema=mod_mes"
    ac.record_issued(grant, provisioned=False)
    assert ac.audit_log[-1].action == "connection_issued"
    assert ac.audit_log[-1].reason == "role=forge_mod_mes provisioned=no"
    same = ac.issue_connection("forge-mes", pg_host="db", password="pw")
    assert same.connection_string == grant.connection_string
    assert same.statements == grant.statements


async def test_persistent_controller_loads_grants_and_writes_every_change() -> None:
    store = InMemoryPermissionStore()
    await store.upsert(ModulePermission("forge-mes", "mod_mes", AccessLevel.WRITE, granted_at=T0))
    controller = await PersistentAccessController.open(store)
    assert controller.store is store
    assert controller.check("forge-mes", "mod_mes", AccessLevel.WRITE)
    assert [p.schema_name for p in controller.list_grants("forge-mes")] == ["mod_mes"]

    perm = await controller.grant(
        "forge-mes", "forge_canonical", AccessLevel.READ, granted_by="roger"
    )
    assert store.permissions[("forge-mes", "forge_canonical")] is perm
    assert [e.action for e in store.audit] == ["grant"]

    with pytest.raises(ValueError, match="protected"):
        await controller.grant("forge-mes", "forge_core", AccessLevel.WRITE)
    assert ("forge-mes", "forge_core") not in store.permissions
    assert [e.action for e in store.audit] == ["grant", "access_denied"]  # the refusal too

    assert await controller.revoke("forge-mes", "forge_canonical") is True
    assert store.permissions[("forge-mes", "forge_canonical")].active is False
    assert await controller.revoke("forge-mes", "forge_canonical") is False
    assert [e.action for e in store.audit] == ["grant", "access_denied", "revoke"]
    assert controller.grant_count == 1
    assert controller.list_modules_for_schema("mod_mes") == ["forge-mes"]
    assert controller.audit_log == controller.controller.audit_log

    # What the hub loads tomorrow is what the CLI granted today.
    again = await PersistentAccessController.open(store)
    assert [p.schema_name for p in again.all_permissions()] == ["mod_mes", "forge_canonical"]
    assert [p.schema_name for p in again.list_grants("forge-mes")] == ["mod_mes"]
    assert await again.load() == 2


async def test_persistent_controller_issues_through_an_awaited_provisioner() -> None:
    store = InMemoryPermissionStore()
    controller = await PersistentAccessController.open(store)
    await controller.grant("forge-mes", "mod_mes", AccessLevel.WRITE)
    ran: list[list[str]] = []

    async def provision(statements) -> None:
        ran.append(list(statements))

    grant = await controller.issue_connection(
        "forge-mes", pg_host="db", password="pw", provisioner=provision
    )
    assert ran == [grant.statements]
    assert grant.connection_string == "postgresql://forge_mod_mes:pw@db:5432/forge?schema=mod_mes"
    issued = [e for e in store.audit if e.action == "connection_issued"]
    assert len(issued) == 1 and issued[0].reason == "role=forge_mod_mes provisioned=yes"
    assert "pw" not in issued[0].reason and "pw" not in issued[0].schema_name

    # A plain callable is fine too; one that fails leaves no "issued" entry behind.
    def plain(statements) -> None:
        ran.append(list(statements))

    await controller.issue_connection("forge-mes", password="pw2", provisioner=plain)
    assert len(ran) == 2

    def broken(statements) -> None:
        raise RuntimeError("database down")

    with pytest.raises(RuntimeError, match="database down"):
        await controller.issue_connection("forge-mes", provisioner=broken)
    assert len([e for e in store.audit if e.action == "connection_issued"]) == 2

    with pytest.raises(ValueError, match="no active permission"):
        await controller.issue_connection("nobody")
    assert store.audit[-1].action == "access_denied"


def test_postgres_access_controller_is_the_persistent_controller_over_forge_core(
    mock_pool,
) -> None:
    from forge.storage.engines import PostgresAccessController

    pool, _ = mock_pool
    controller = PostgresAccessController(pool)
    assert isinstance(controller, PersistentAccessController)
    assert isinstance(controller.store, PostgresPermissionStore)
