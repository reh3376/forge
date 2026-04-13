"""Neo4j Cypher migration runner.

Applies numbered .cypher files from the neo4j/ directory.
Tracks applied migrations using a (:_ForgeMigration) node.

Migration files must be named NNN_description.cypher (e.g. 001_core_constraints.cypher).
Each file contains one or more Cypher statements separated by semicolons.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)

_MIGRATION_PATTERN = re.compile(r"^(\d{3})_(.+)\.cypher$")


class Neo4jMigrationRunner:
    """Runs numbered Cypher migration files against Neo4j."""

    def __init__(
        self,
        uri: str,
        user: str,
        password: str,
        migrations_dir: str,
    ) -> None:
        from neo4j import GraphDatabase

        self._driver = GraphDatabase.driver(uri, auth=(user, password))
        self._migrations_dir = Path(migrations_dir)

    def close(self) -> None:
        self._driver.close()

    def _get_applied(self) -> set[str]:
        """Get the set of already-applied migration IDs."""
        with self._driver.session() as session:
            result = session.run(
                "MATCH (m:_ForgeMigration) RETURN m.migration_id AS id"
            )
            return {record["id"] for record in result}

    def _get_available(self) -> list[tuple[str, Path]]:
        """Get available migration files sorted by number."""
        migrations = []
        if not self._migrations_dir.exists():
            return migrations
        for f in sorted(self._migrations_dir.iterdir()):
            match = _MIGRATION_PATTERN.match(f.name)
            if match:
                migration_id = match.group(1)
                migrations.append((migration_id, f))
        return migrations

    def _execute_cypher_file(self, path: Path) -> None:
        """Execute all statements in a .cypher file."""
        content = path.read_text()
        statements = [s.strip() for s in content.split(";") if s.strip()]
        with self._driver.session() as session:
            for stmt in statements:
                session.run(stmt)

    def _mark_applied(self, migration_id: str, filename: str) -> None:
        """Record that a migration has been applied."""
        with self._driver.session() as session:
            session.run(
                "CREATE (m:_ForgeMigration {"
                "  migration_id: $id,"
                "  filename: $filename,"
                "  applied_at: datetime()"
                "})",
                id=migration_id,
                filename=filename,
            )

    def _unmark_applied(self, migration_id: str) -> None:
        """Remove a migration record (for downgrade)."""
        with self._driver.session() as session:
            session.run(
                "MATCH (m:_ForgeMigration {migration_id: $id}) DELETE m",
                id=migration_id,
            )

    def upgrade(self) -> None:
        """Apply all pending migrations in order."""
        applied = self._get_applied()
        available = self._get_available()
        pending = [(mid, path) for mid, path in available if mid not in applied]

        if not pending:
            logger.info("Neo4j: no pending migrations")
            return

        for migration_id, path in pending:
            logger.info("Neo4j: applying %s", path.name)
            self._execute_cypher_file(path)
            self._mark_applied(migration_id, path.name)
            logger.info("Neo4j: applied %s", path.name)

    def downgrade(self, steps: int = 1) -> None:
        """Roll back the last N applied migrations.

        Note: Cypher migrations do not have automatic downgrade logic.
        This only removes the tracking node. Manual cleanup may be needed.
        """
        applied = self._get_applied()
        available = self._get_available()
        applied_migrations = [
            (mid, path) for mid, path in available if mid in applied
        ]
        to_rollback = applied_migrations[-steps:]

        for migration_id, path in reversed(to_rollback):
            logger.warning(
                "Neo4j: unmarking %s (manual constraint cleanup may be needed)",
                path.name,
            )
            self._unmark_applied(migration_id)

    def current(self) -> None:
        """Log the current migration state."""
        applied = self._get_applied()
        available = self._get_available()
        for migration_id, path in available:
            status = "applied" if migration_id in applied else "pending"
            logger.info("Neo4j: [%s] %s", status, path.name)
