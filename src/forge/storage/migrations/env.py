"""Alembic environment configuration for Forge migrations.

Imports StorageConfig to determine connection strings dynamically.
Supports --target=postgres|timescale to select which database to migrate.

Online runs connect through asyncpg, the one PostgreSQL driver the project
declares, on SQLAlchemy's async engine (FB-003: a plain ``postgresql://``
URL made SQLAlchemy look for psycopg2, which is not installed, so
``forge migrate up`` could not run). Offline runs (``--sql``) need no driver.
"""

from __future__ import annotations

import asyncio
import os
import sys
from logging.config import fileConfig
from typing import TYPE_CHECKING

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import create_async_engine

if TYPE_CHECKING:
    from sqlalchemy.engine import Connection

# Ensure forge package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

from forge.storage.config import StorageConfig
from forge.storage.migrations.run import async_url

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def _get_target_dsn() -> str:
    """Determine which database to connect to based on --target flag."""
    target = os.getenv("FORGE_MIGRATE_TARGET", "postgres")
    storage_config = StorageConfig.from_env()

    if target == "timescale":
        return storage_config.timescale.dsn
    return storage_config.postgres.dsn


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode — generates SQL without connecting."""
    url = _get_target_dsn()
    context.configure(
        url=url,
        target_metadata=None,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def _run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=None)
    with context.begin_transaction():
        context.run_migrations()


async def _run_migrations_async() -> None:
    connectable = create_async_engine(async_url(_get_target_dsn()), poolclass=pool.NullPool)
    try:
        async with connectable.connect() as connection:
            await connection.run_sync(_run_migrations)
    finally:
        await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode — connects to the database through asyncpg."""
    asyncio.run(_run_migrations_async())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
