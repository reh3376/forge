"""Alembic environment configuration for Forge migrations.

Imports StorageConfig to determine connection strings dynamically.
Supports --target=postgres|timescale to select which database to migrate.
"""

from __future__ import annotations

import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

# Ensure forge package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

from forge.storage.config import StorageConfig

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


def run_migrations_online() -> None:
    """Run migrations in 'online' mode — connects to the database."""
    connectable = create_engine(
        _get_target_dsn(),
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=None)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
