"""Migration runner — programmatic entry point for Alembic and Neo4j migrations.

Used by the forge CLI and the init container:
    python -m forge.storage.migrations.run up --target all
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

_MIGRATIONS_DIR = Path(__file__).parent


def run_alembic(command: str, target: str = "postgres", steps: int | None = None) -> None:
    """Run Alembic migrations for the specified target database.

    Args:
        command: "upgrade" or "downgrade"
        target: "postgres" or "timescale"
        steps: Number of steps for downgrade (default: all for upgrade, 1 for downgrade)
    """
    from alembic import command as alembic_cmd
    from alembic.config import Config

    os.environ["FORGE_MIGRATE_TARGET"] = target
    alembic_cfg = Config(str(_MIGRATIONS_DIR / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(_MIGRATIONS_DIR))

    if command == "upgrade":
        alembic_cmd.upgrade(alembic_cfg, "head")
    elif command == "downgrade":
        revision = f"-{steps}" if steps else "-1"
        alembic_cmd.downgrade(alembic_cfg, revision)
    elif command == "current":
        alembic_cmd.current(alembic_cfg)
    elif command == "history":
        alembic_cmd.history(alembic_cfg)


def run_neo4j(command: str, steps: int | None = None) -> None:
    """Run Neo4j Cypher migrations.

    Args:
        command: "upgrade" or "downgrade"
        steps: Number of steps for downgrade
    """
    from forge.storage.config import StorageConfig
    from forge.storage.migrations.neo4j_runner import Neo4jMigrationRunner

    config = StorageConfig.from_env()
    runner = Neo4jMigrationRunner(
        uri=config.neo4j.uri,
        user=config.neo4j.user,
        password=config.neo4j.password,
        migrations_dir=str(_MIGRATIONS_DIR / "neo4j"),
    )

    try:
        if command == "upgrade":
            runner.upgrade()
        elif command == "downgrade":
            runner.downgrade(steps=steps or 1)
        elif command == "current":
            runner.current()
    finally:
        runner.close()


def run_all(command: str, steps: int | None = None) -> None:
    """Run all migrations (Postgres, TimescaleDB, Neo4j)."""
    if command == "upgrade":
        logger.info("Running PostgreSQL migrations ...")
        run_alembic("upgrade", target="postgres")
        logger.info("Running TimescaleDB migrations ...")
        run_alembic("upgrade", target="timescale")
        logger.info("Running Neo4j migrations ...")
        run_neo4j("upgrade")
    elif command == "downgrade":
        logger.info("Rolling back Neo4j migrations ...")
        run_neo4j("downgrade", steps=steps)
        logger.info("Rolling back TimescaleDB migrations ...")
        run_alembic("downgrade", target="timescale", steps=steps)
        logger.info("Rolling back PostgreSQL migrations ...")
        run_alembic("downgrade", target="postgres", steps=steps)
    elif command == "current":
        run_alembic("current", target="postgres")
        run_alembic("current", target="timescale")
        run_neo4j("current")


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    parser = argparse.ArgumentParser(description="Forge migration runner")
    parser.add_argument("command", choices=["up", "down", "status"])
    parser.add_argument(
        "--target",
        choices=["postgres", "timescale", "neo4j", "all"],
        default="all",
    )
    parser.add_argument("--steps", type=int, default=None)
    args = parser.parse_args()

    cmd_map = {"up": "upgrade", "down": "downgrade", "status": "current"}
    cmd = cmd_map[args.command]

    if args.target == "all":
        run_all(cmd, steps=args.steps)
    elif args.target == "neo4j":
        run_neo4j(cmd, steps=args.steps)
    else:
        run_alembic(cmd, target=args.target, steps=args.steps)
