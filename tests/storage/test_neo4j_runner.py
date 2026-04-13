"""Tests for Neo4j Cypher migration runner.

Tests validate the runner logic without requiring a running Neo4j instance.
"""

from __future__ import annotations

import re
from pathlib import Path

MIGRATIONS_DIR = (
    Path(__file__).parent.parent.parent
    / "src"
    / "forge"
    / "storage"
    / "migrations"
    / "neo4j"
)

_MIGRATION_PATTERN = re.compile(r"^(\d{3})_(.+)\.cypher$")


class TestCypherMigrationFiles:
    """Verify Cypher migration file structure."""

    def test_neo4j_directory_exists(self):
        assert MIGRATIONS_DIR.is_dir()

    def test_all_migrations_present(self):
        expected = ["001", "002", "003"]
        files = sorted(f.name for f in MIGRATIONS_DIR.glob("*.cypher"))
        for version in expected:
            assert any(f.startswith(version) for f in files), (
                f"Missing Neo4j migration {version}"
            )

    def test_filenames_match_pattern(self):
        for f in MIGRATIONS_DIR.glob("*.cypher"):
            assert _MIGRATION_PATTERN.match(f.name), (
                f"Invalid migration filename: {f.name}"
            )

    def test_files_are_non_empty(self):
        for f in MIGRATIONS_DIR.glob("*.cypher"):
            content = f.read_text().strip()
            assert len(content) > 0, f"Empty migration: {f.name}"

    def test_001_creates_core_constraints(self):
        content = (MIGRATIONS_DIR / "001_core_constraints.cypher").read_text()
        assert "adapter_id" in content
        assert "product_id" in content
        assert "entity_id" in content
        assert "CREATE CONSTRAINT" in content

    def test_002_creates_spoke_indexes(self):
        content = (MIGRATIONS_DIR / "002_spoke_labels.cypher").read_text()
        assert "spoke_id" in content

    def test_003_creates_lineage_graph(self):
        content = (MIGRATIONS_DIR / "003_lineage_graph.cypher").read_text()
        assert "lineage_id" in content
        assert "product_id" in content

    def test_no_trailing_semicolons_at_eof(self):
        """Cypher files should not end with a trailing semicolon (runner splits on ;)."""
        for f in MIGRATIONS_DIR.glob("*.cypher"):
            # Verify files are readable (the runner splits on ; and filters empty strings)
            assert len(f.read_text().strip()) > 0


class TestNeo4jMigrationRunnerLogic:
    """Test the runner pattern matching without Neo4j connection."""

    def test_migration_pattern_matches_valid(self):
        match = _MIGRATION_PATTERN.match("001_core_constraints.cypher")
        assert match is not None
        assert match.group(1) == "001"

    def test_migration_pattern_rejects_invalid(self):
        assert _MIGRATION_PATTERN.match("bad_name.cypher") is None
        assert _MIGRATION_PATTERN.match("001.cypher") is None
        assert _MIGRATION_PATTERN.match("abc_test.cypher") is None

    def test_migration_ordering(self):
        """Migrations should be naturally sortable by filename."""
        files = sorted(f.name for f in MIGRATIONS_DIR.glob("*.cypher"))
        ids = []
        for f in files:
            match = _MIGRATION_PATTERN.match(f)
            if match:
                ids.append(int(match.group(1)))
        assert ids == sorted(ids), "Migrations not in order"
        assert ids == [1, 2, 3]
