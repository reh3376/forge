"""``forge db access`` — module → schema grants and Forge-issued credentials.

Step 1 of the ``mod_mes`` cut-over (BACKLOG FB-057; roadmap A-6: the hub owns
the databases). A module never configures its own database. The hub grants it
a schema, provisions a PostgreSQL role for it and hands it a connection string::

    forge migrate up
    forge db access grant forge-mes mod_mes admin      # admin while Prisma owns the DDL
    forge db access issue forge-mes --host localhost   # prints DATABASE_URL=... once

Grants and the audit persist in ``forge_core.module_permissions`` and
``forge_core.access_audit`` (migration 008) through
:class:`~forge.storage.access.PersistentAccessController` (FB-003), the same
controller the hub's storage factory hands out. The password is generated at
issue time, set on the role and printed once; it is never stored.
``--dry-run`` shows the SQL and a masked connection string without touching
any database.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Annotated, Any

import typer

from forge.storage.access import (
    AccessLevel,
    ConnectionGrant,
    InMemoryPermissionStore,
    ModulePermission,
    PermissionStore,
    PersistentAccessController,
    PostgresPermissionStore,
    module_schema,
)

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable, Sequence

access_app = typer.Typer(
    name="access",
    help="Module → schema grants and Forge-issued connection strings (FB-057).",
    no_args_is_help=True,
)

DRY_RUN_PASSWORD = "<issued-at-run-time>"


# ---------------------------------------------------------------------------
# Seams (replaced in tests)
# ---------------------------------------------------------------------------


class _ConnectPerCall:
    """A pool look-alike that opens one asyncpg connection per ``acquire()``.

    The CLI runs several short event loops per command; a real pool is bound
    to the loop that created it, a fresh connection per call is not.
    """

    def __init__(self, dsn: str) -> None:
        self._dsn = dsn

    def acquire(self) -> _Acquire:
        return _Acquire(self._dsn)


class _Acquire:
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn
        self._conn: Any = None

    async def __aenter__(self) -> Any:
        import asyncpg

        self._conn = await asyncpg.connect(self._dsn)
        return self._conn

    async def __aexit__(self, *exc: object) -> bool:
        await self._conn.close()
        return False


def _admin_dsn() -> str:
    from forge.storage.config import StorageConfig

    return StorageConfig.from_env().postgres.dsn


def open_store(dry_run: bool) -> PermissionStore:
    """The permission store: in-memory for ``--dry-run``, ``forge_core`` otherwise."""
    if dry_run:
        return InMemoryPermissionStore()
    return PostgresPermissionStore(_ConnectPerCall(_admin_dsn()))


def sql_executor() -> Callable[[Sequence[str]], Awaitable[None]]:
    """Run provisioning statements on the hub's PostgreSQL as the admin user, in one transaction.

    A coroutine function: the controller awaits it inside the command's event loop.
    """
    dsn = _admin_dsn()

    async def run(statements: Sequence[str]) -> None:
        import asyncpg

        conn = await asyncpg.connect(dsn)
        try:
            async with conn.transaction():
                for statement in statements:
                    await conn.execute(statement)
        finally:
            await conn.close()

    return run


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _open(dry_run: bool) -> PersistentAccessController:
    """The controller, loaded from the store.

    A dry run acts on ``.controller`` and writes nothing.
    """
    return asyncio.run(PersistentAccessController.open(open_store(dry_run)))


def _level(value: str) -> AccessLevel:
    try:
        return AccessLevel(value.lower())
    except ValueError as exc:
        msg = f"{value!r} is not one of read, write, admin"
        raise typer.BadParameter(msg) from exc


def _print_grant(perm: ModulePermission) -> None:
    expiry = perm.expires_at.isoformat() if perm.expires_at else "-"
    state = "active" if perm.active else "revoked"
    typer.echo(
        f"{perm.module_id:<16} {perm.schema_name:<18} {perm.access_level.value:<6} "
        f"by {perm.granted_by:<12} expires {expiry} {state}"
    )


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


@access_app.command("grant")
def grant(
    module: Annotated[str, typer.Argument(help="Module id, e.g. forge-mes")],
    schema: Annotated[
        str | None,
        typer.Argument(help="Schema, e.g. mod_mes (default: the module's own schema)"),
    ] = None,
    level: Annotated[str, typer.Argument(help="read, write or admin")] = "write",
    granted_by: Annotated[str, typer.Option("--granted-by")] = "forge-cli",
    expires_in_days: Annotated[int | None, typer.Option("--expires-in-days")] = None,
    dry_run: Annotated[bool, typer.Option("--dry-run", help="Do not persist")] = False,
) -> None:
    """Grant MODULE access to SCHEMA (persisted in forge_core.module_permissions)."""
    schema_name = schema or module_schema(module)
    access_level = _level(level)
    expires_at = (
        datetime.now(UTC).replace(microsecond=0) + timedelta(days=expires_in_days)
        if expires_in_days
        else None
    )
    controller = _open(dry_run)
    try:
        if dry_run:
            perm = controller.controller.grant(
                module, schema_name, access_level, granted_by=granted_by, expires_at=expires_at
            )
        else:
            perm = asyncio.run(
                controller.grant(
                    module,
                    schema_name,
                    access_level,
                    granted_by=granted_by,
                    expires_at=expires_at,
                )
            )
    except ValueError as exc:
        raise typer.BadParameter(str(exc)) from exc
    _print_grant(perm)
    typer.echo(
        "(dry run, nothing persisted)"
        if dry_run
        else f"Grant stored. Issue credentials with: forge db access issue {module}"
    )


@access_app.command("revoke")
def revoke(
    module: Annotated[str, typer.Argument()],
    schema: Annotated[str | None, typer.Argument()] = None,
    dry_run: Annotated[bool, typer.Option("--dry-run")] = False,
) -> None:
    """Revoke MODULE's grant on SCHEMA. Re-issue to re-provision the role without it."""
    schema_name = schema or module_schema(module)
    controller = _open(dry_run)
    revoked = (
        controller.controller.revoke(module, schema_name)
        if dry_run
        else asyncio.run(controller.revoke(module, schema_name))
    )
    if not revoked:
        typer.echo(f"No active grant: {module} → {schema_name}")
        raise typer.Exit(code=1)
    typer.echo(f"Revoked {module} → {schema_name}")


@access_app.command("list")
def list_grants(
    module: Annotated[str | None, typer.Option("--module", help="Only this module")] = None,
) -> None:
    """List active grants."""
    controller = _open(dry_run=False)
    grants = controller.list_grants(module)
    if not grants:
        typer.echo("No active grants." + (f" ({module})" if module else ""))
        return
    for perm in grants:
        _print_grant(perm)


@access_app.command("issue")
def issue(
    module: Annotated[str, typer.Argument(help="Module id, e.g. forge-mes")],
    host: Annotated[
        str, typer.Option("--host", help="Host the module reaches PostgreSQL on")
    ] = "forge-pg",
    port: Annotated[int, typer.Option("--port")] = 5432,
    database: Annotated[str, typer.Option("--database")] = "forge",
    show_sql: Annotated[
        bool, typer.Option("--show-sql", help="Print the provisioning SQL")
    ] = False,
    dry_run: Annotated[
        bool, typer.Option("--dry-run", help="Print the SQL; touch nothing")
    ] = False,
) -> None:
    """Provision MODULE's PostgreSQL role from its grants and print its connection string once."""
    controller = _open(dry_run)
    if dry_run and not controller.list_grants(module):
        controller.controller.grant(module, module_schema(module), AccessLevel.WRITE)
        controller.controller.grant(module, "forge_canonical", AccessLevel.READ)
    try:
        if dry_run:
            grant: ConnectionGrant = controller.controller.issue_connection(
                module,
                pg_host=host,
                pg_port=port,
                pg_database=database,
                password=DRY_RUN_PASSWORD,
                provisioner=None,
            )
        else:
            grant = asyncio.run(
                controller.issue_connection(
                    module,
                    pg_host=host,
                    pg_port=port,
                    pg_database=database,
                    provisioner=sql_executor(),
                )
            )
    except ValueError as exc:
        raise typer.BadParameter(str(exc)) from exc
    if show_sql or dry_run:
        typer.echo("-- provisioning SQL (password masked)")
        for statement in grant.statements:
            typer.echo(statement.replace(grant.password, "***") + ";")
    typer.echo(f"role={grant.role} schemas={','.join(grant.schemas_accessible)}")
    typer.echo(f"search_path={grant.search_path}")
    if dry_run:
        typer.echo(f"DATABASE_URL={grant.redacted()}  (dry run)")
    else:
        typer.echo(f"DATABASE_URL={grant.connection_string}")
        typer.echo("The password is shown once and not stored; re-run issue to rotate it.")
