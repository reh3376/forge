"""forge.db — Database query SDK module.

Replaces Ignition's ``system.db.runQuery()``, ``system.db.runPrepQuery()``,
``system.db.runNamedQuery()``, and ``system.db.beginTransaction()``.

All operations are async and use parameterized queries by default
(no SQL injection risk from script authors).

Usage in scripts::

    import forge

    rows = await forge.db.query("SELECT * FROM batches WHERE area = $1", ["Distillery01"])
    result = await forge.db.named_query("active_batches", {"area": "Distillery01"})

    async with forge.db.transaction() as tx:
        await tx.run("INSERT INTO logs (msg) VALUES ($1)", ["started"])
        await tx.run("UPDATE state SET status = $1", ["active"])
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("forge.db")


@dataclass
class QueryResult:
    """Result of a database query."""

    columns: list[str]
    rows: list[list[Any]]
    row_count: int
    affected_rows: int = 0

    def to_dicts(self) -> list[dict[str, Any]]:
        """Convert rows to list of dicts keyed by column name."""
        return [dict(zip(self.columns, row)) for row in self.rows]

    def scalar(self) -> Any:
        """Return the first column of the first row, or None."""
        if self.rows and self.rows[0]:
            return self.rows[0][0]
        return None


class TransactionContext:
    """Context manager for database transactions.

    Usage::

        async with forge.db.transaction("default") as tx:
            await tx.run("INSERT ...", [params])
            await tx.run("UPDATE ...", [params])
        # Auto-commit on exit, auto-rollback on exception
    """

    def __init__(self, db_name: str, pool: Any) -> None:
        self._db_name = db_name
        self._pool = pool
        self._conn: Any = None
        self._committed = False

    async def run(self, sql: str, params: list[Any] | None = None) -> QueryResult:
        """Run a parameterized query within this transaction."""
        if self._conn is None:
            raise RuntimeError("Transaction not active")
        # Delegate to the pool's query method with the transaction connection
        return await _run_query(self._conn, sql, params or [])

    async def __aenter__(self) -> TransactionContext:
        if self._pool is None:
            raise RuntimeError(
                "forge.db is not bound to a connection pool. "
                "This module can only be used inside a running ScriptEngine."
            )
        self._conn = await self._pool.acquire()
        await self._conn.execute("BEGIN")  # type: ignore
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        if self._conn is None:
            return
        try:
            if exc_type is None:
                await self._conn.execute("COMMIT")  # type: ignore
            else:
                await self._conn.execute("ROLLBACK")  # type: ignore
        finally:
            await self._pool.release(self._conn)
            self._conn = None


async def _run_query(conn: Any, sql: str, params: list[Any]) -> QueryResult:
    """Execute a query and return structured results.

    This is a placeholder that will be wired to the actual DB driver
    (asyncpg, aiosqlite, etc.) when the connection pool is bound.
    """
    # This will be replaced with actual driver calls when bound
    raise NotImplementedError("Database connection not yet wired")


# ---------------------------------------------------------------------------
# Named query registry
# ---------------------------------------------------------------------------

_named_queries: dict[str, str] = {}


def register_named_query(name: str, sql: str) -> None:
    """Register a named query (typically loaded from config)."""
    _named_queries[name] = sql
    logger.debug("Registered named query: %s", name)


# ---------------------------------------------------------------------------
# DbModule
# ---------------------------------------------------------------------------


class DbModule:
    """The forge.db SDK module — bound to a connection pool at runtime."""

    def __init__(self) -> None:
        self._pools: dict[str, Any] = {}  # db_name → pool
        self._default_db: str = "default"

    def bind(self, pool: Any, db_name: str = "default") -> None:
        """Bind a connection pool. Called by ScriptEngine on startup."""
        self._pools[db_name] = pool
        if not self._default_db or db_name == "default":
            self._default_db = db_name
        logger.debug("forge.db bound pool: %s", db_name)

    def _get_pool(self, db: str | None = None) -> Any:
        name = db or self._default_db
        pool = self._pools.get(name)
        if pool is None:
            raise RuntimeError(
                f"No database pool bound for '{name}'. "
                f"Available: {list(self._pools.keys())}"
            )
        return pool

    async def query(self, sql: str, params: list[Any] | None = None, db: str | None = None) -> QueryResult:
        """Run a parameterized SQL query.

        Args:
            sql: SQL with positional parameters ($1, $2, ...).
            params: Parameter values.
            db: Database name (defaults to 'default').

        Returns:
            QueryResult with columns, rows, and row_count.
        """
        pool = self._get_pool(db)
        conn = await pool.acquire()
        try:
            return await _run_query(conn, sql, params or [])
        finally:
            await pool.release(conn)

    async def named_query(self, name: str, params: dict[str, Any] | None = None, db: str | None = None) -> QueryResult:
        """Run a named query (registered via config or register_named_query).

        Named queries are pre-defined SQL templates stored by name.
        Parameters are passed as a dict and mapped to positional params.
        """
        sql = _named_queries.get(name)
        if sql is None:
            raise KeyError(f"Named query not found: {name!r}")
        # Convert dict params to positional (simple ordered extraction)
        param_list = list((params or {}).values())
        return await self.query(sql, param_list, db)

    def transaction(self, db: str | None = None) -> TransactionContext:
        """Create a transaction context manager.

        Usage::

            async with forge.db.transaction() as tx:
                await tx.run("INSERT ...", [params])
        """
        pool = self._get_pool(db)
        return TransactionContext(db or self._default_db, pool)

    async def scalar(self, sql: str, params: list[Any] | None = None, db: str | None = None) -> Any:
        """Run a query and return the first column of the first row."""
        result = await self.query(sql, params, db)
        return result.scalar()


# Module-level singleton
_instance = DbModule()

query = _instance.query
named_query = _instance.named_query
transaction = _instance.transaction
scalar = _instance.scalar
bind = _instance.bind
