"""``forge db access``: grants persist, credentials are issued once (FB-057 step 1)."""

from __future__ import annotations

import pytest
from typer.testing import CliRunner

from forge.cli import db_access
from forge.cli.main import app
from forge.storage.access import InMemoryPermissionStore

runner = CliRunner()


@pytest.fixture
def store(monkeypatch) -> InMemoryPermissionStore:
    store = InMemoryPermissionStore()
    monkeypatch.setattr(db_access, "open_store", lambda dry_run: store)
    return store


def test_grant_list_revoke(store: InMemoryPermissionStore) -> None:
    result = runner.invoke(app, ["db", "access", "grant", "forge-mes", "--dry-run"])
    assert result.exit_code == 0, result.output
    assert "forge-mes" in result.output and "mod_mes" in result.output and "write" in result.output
    assert store.permissions == {}  # dry run persists nothing

    result = runner.invoke(
        app, ["db", "access", "grant", "forge-mes", "mod_mes", "admin", "--granted-by", "roger"]
    )
    assert result.exit_code == 0, result.output
    assert store.permissions[("forge-mes", "mod_mes")].access_level.value == "admin"
    assert store.permissions[("forge-mes", "mod_mes")].granted_by == "roger"
    assert [e.action for e in store.audit] == ["grant"]

    result = runner.invoke(app, ["db", "access", "grant", "forge-mes", "forge_core", "write"])
    assert result.exit_code != 0 and "protected" in result.output
    assert [e.action for e in store.audit] == ["grant"]  # refusal not persisted (nothing changed)

    result = runner.invoke(app, ["db", "access", "list"])
    assert result.exit_code == 0 and "forge-mes" in result.output and "admin" in result.output

    result = runner.invoke(app, ["db", "access", "revoke", "forge-mes", "mod_mes"])
    assert result.exit_code == 0 and "Revoked" in result.output
    assert store.permissions[("forge-mes", "mod_mes")].active is False
    assert [e.action for e in store.audit] == ["grant", "revoke"]
    assert "No active grants" in runner.invoke(app, ["db", "access", "list"]).output
    assert runner.invoke(app, ["db", "access", "revoke", "forge-mes", "mod_mes"]).exit_code == 1


def test_issue_dry_run_prints_sql_and_masked_dsn(
    store: InMemoryPermissionStore, monkeypatch
) -> None:
    def forbidden() -> None:
        raise AssertionError("dry run must not provision")

    monkeypatch.setattr(db_access, "sql_executor", forbidden)
    result = runner.invoke(
        app, ["db", "access", "issue", "forge-mes", "--host", "localhost", "--dry-run"]
    )
    assert result.exit_code == 0, result.output
    # No stored grants: the dry run shows the default shape (own schema + canonical read).
    assert "ALTER ROLE forge_mod_mes WITH LOGIN PASSWORD '***';" in result.output
    assert "GRANT USAGE ON SCHEMA mod_mes TO forge_mod_mes;" in result.output
    assert "GRANT SELECT ON ALL TABLES IN SCHEMA forge_canonical TO forge_mod_mes;" in result.output
    assert "search_path=mod_mes,forge_canonical" in result.output
    assert (
        "DATABASE_URL=postgresql://forge_mod_mes:***@localhost:5432/forge?schema=mod_mes"
        in result.output
    )
    assert store.audit == [] and store.permissions == {}


def test_issue_provisions_and_prints_the_credential_once(
    store: InMemoryPermissionStore, monkeypatch
) -> None:
    executed: list[list[str]] = []
    monkeypatch.setattr(db_access, "sql_executor", lambda: executed.append)

    result = runner.invoke(app, ["db", "access", "issue", "forge-mes"])
    assert result.exit_code != 0 and "no active permission" in result.output
    assert executed == []

    assert (
        runner.invoke(app, ["db", "access", "grant", "forge-mes", "mod_mes", "admin"]).exit_code
        == 0
    )
    assert (
        runner.invoke(
            app, ["db", "access", "grant", "forge-mes", "forge_canonical", "read"]
        ).exit_code
        == 0
    )
    result = runner.invoke(app, ["db", "access", "issue", "forge-mes", "--show-sql"])
    assert result.exit_code == 0, result.output
    assert (
        len(executed) == 1
        and "GRANT USAGE, CREATE ON SCHEMA mod_mes TO forge_mod_mes" in executed[0]
    )
    password = next(s for s in executed[0] if s.startswith("ALTER ROLE")).split("PASSWORD '")[1][
        :-1
    ]
    assert len(password) >= 24
    assert (
        f"DATABASE_URL=postgresql://forge_mod_mes:{password}@forge-pg:5432/forge?schema=mod_mes"
        in result.output
    )
    assert "'***'" in result.output and "not stored" in result.output
    issued = [e for e in store.audit if e.action == "connection_issued"]
    assert len(issued) == 1 and password not in issued[0].reason
