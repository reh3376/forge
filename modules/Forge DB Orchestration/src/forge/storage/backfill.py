"""Backfill Engine — historical ETL from spoke databases to Forge pods.

Performs bulk migration of existing data from spoke-local databases
(Prisma-managed PostgreSQL, yoyo-migrations, golang-migrate, etc.)
into Forge-managed database pods. This ensures Forge is the complete
source of truth, not just a forward-looking stream.

Backfill process per spoke:
    1. Schema Scan: Read spoke schema, register in Schema Registry
    2. Migration Generation: Create Alembic migration for mod_<spoke>
    3. Apply Migration: Create tables in Forge pod
    4. Bulk Copy: Stream data from spoke source to Forge pod
    5. Transform: ID mapping, enum normalization, field mapping
    6. Validate: Row counts, checksums, sample comparison
    7. Mark Complete: Update registry backfill_status
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

from forge._compat import StrEnum

logger = logging.getLogger(__name__)


class BackfillStatus(StrEnum):
    """Lifecycle states for a backfill operation."""

    NOT_STARTED = "not_started"
    SCANNING = "scanning"
    PLANNED = "planned"
    IN_PROGRESS = "in_progress"
    VALIDATING = "validating"
    COMPLETE = "complete"
    FAILED = "failed"


class BackfillStrategy(StrEnum):
    """Data transfer strategies for backfill."""

    PG_COPY = "pg_copy"           # PostgreSQL COPY (fastest for PG→PG)
    PG_DUMP_RESTORE = "pg_dump"   # pg_dump + pg_restore (schema-aware)
    ROW_STREAM = "row_stream"     # Row-by-row with transforms (flexible)
    NEO4J_EXPORT = "neo4j_export" # Cypher EXPORT → IMPORT
    REDIS_DUMP = "redis_dump"     # Redis DUMP/RESTORE per key pattern
    EVENT_REPLAY = "event_replay" # Replay event log (for event-sourced spokes)


@dataclass
class BackfillTablePlan:
    """Plan for backfilling a single table/entity from spoke to Forge."""

    spoke_id: str
    source_table: str            # e.g., "public.Barrel" (spoke-local)
    target_schema: str           # e.g., "mod_wms"
    target_table: str            # e.g., "barrels" (Forge pod)
    strategy: BackfillStrategy
    estimated_rows: int | None = None
    id_mapping: str = "cuid_passthrough"  # How to handle IDs
    transforms: list[str] = field(default_factory=list)  # Column transforms
    depends_on: list[str] = field(default_factory=list)  # FK dependencies
    priority: int = 0            # Lower = run first


@dataclass
class BackfillProgress:
    """Progress tracking for an in-flight backfill operation."""

    spoke_id: str
    table_name: str
    status: BackfillStatus = BackfillStatus.NOT_STARTED
    rows_total: int = 0
    rows_transferred: int = 0
    rows_validated: int = 0
    rows_failed: int = 0
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error: str | None = None

    @property
    def progress_pct(self) -> float:
        if self.rows_total == 0:
            return 0.0
        return round(self.rows_transferred / self.rows_total * 100, 1)

    @property
    def is_terminal(self) -> bool:
        return self.status in (BackfillStatus.COMPLETE, BackfillStatus.FAILED)


@dataclass
class BackfillSpokeSummary:
    """Aggregate backfill status for an entire spoke."""

    spoke_id: str
    tables_total: int = 0
    tables_complete: int = 0
    tables_in_progress: int = 0
    tables_failed: int = 0
    rows_total: int = 0
    rows_transferred: int = 0
    overall_status: BackfillStatus = BackfillStatus.NOT_STARTED

    @property
    def progress_pct(self) -> float:
        if self.tables_total == 0:
            return 0.0
        return round(self.tables_complete / self.tables_total * 100, 1)


@dataclass
class BackfillEngine:
    """Orchestrates historical data migration from spoke DBs to Forge pods.

    Phase 1: In-memory plan and progress tracking for development.
    Phase 2: asyncpg-backed execution with actual PG→PG COPY.

    Usage::

        engine = BackfillEngine()
        engine.add_table_plan(BackfillTablePlan(...))
        summary = engine.plan_spoke("whk-cmms")
        results = await engine.run_spoke("whk-cmms")
        engine.validate_spoke("whk-cmms")
    """

    _plans: dict[str, list[BackfillTablePlan]] = field(
        default_factory=dict, init=False
    )
    _progress: dict[str, dict[str, BackfillProgress]] = field(
        default_factory=dict, init=False
    )

    def add_table_plan(self, plan: BackfillTablePlan) -> None:
        """Add a table backfill plan for a spoke."""
        self._plans.setdefault(plan.spoke_id, []).append(plan)
        self._progress.setdefault(plan.spoke_id, {})[plan.source_table] = (
            BackfillProgress(
                spoke_id=plan.spoke_id,
                table_name=plan.source_table,
            )
        )
        logger.info(
            "Planned backfill: %s.%s → %s.%s (%s)",
            plan.spoke_id,
            plan.source_table,
            plan.target_schema,
            plan.target_table,
            plan.strategy.value,
        )

    def plan_spoke(self, spoke_id: str) -> BackfillSpokeSummary:
        """Get the backfill plan summary for a spoke."""
        plans = self._plans.get(spoke_id, [])
        progress_map = self._progress.get(spoke_id, {})

        summary = BackfillSpokeSummary(
            spoke_id=spoke_id,
            tables_total=len(plans),
        )

        for plan in plans:
            if plan.estimated_rows:
                summary.rows_total += plan.estimated_rows

        for prog in progress_map.values():
            if prog.status == BackfillStatus.COMPLETE:
                summary.tables_complete += 1
            elif prog.status == BackfillStatus.IN_PROGRESS:
                summary.tables_in_progress += 1
            elif prog.status == BackfillStatus.FAILED:
                summary.tables_failed += 1
            summary.rows_transferred += prog.rows_transferred

        if summary.tables_total == 0:
            summary.overall_status = BackfillStatus.NOT_STARTED
        elif summary.tables_complete == summary.tables_total:
            summary.overall_status = BackfillStatus.COMPLETE
        elif summary.tables_failed > 0:
            summary.overall_status = BackfillStatus.FAILED
        elif summary.tables_in_progress > 0:
            summary.overall_status = BackfillStatus.IN_PROGRESS
        else:
            summary.overall_status = BackfillStatus.PLANNED

        return summary

    async def run_table(
        self, spoke_id: str, source_table: str
    ) -> BackfillProgress:
        """Execute backfill for a single table.

        Phase 1: Simulates completion (updates progress tracking).
        Phase 2: Actual PG COPY / Neo4j export / Redis dump.
        """
        progress = self._progress.get(spoke_id, {}).get(source_table)
        if progress is None:
            raise ValueError(
                f"No backfill plan for {spoke_id}.{source_table}"
            )

        plan = self._find_plan(spoke_id, source_table)
        if plan is None:
            raise ValueError(
                f"No backfill plan for {spoke_id}.{source_table}"
            )

        progress.status = BackfillStatus.IN_PROGRESS
        progress.started_at = datetime.now(tz=timezone.utc)
        logger.info(
            "Starting backfill: %s.%s → %s.%s",
            spoke_id,
            source_table,
            plan.target_schema,
            plan.target_table,
        )

        try:
            # Phase 1: simulate — mark estimated rows as transferred
            progress.rows_total = plan.estimated_rows or 0
            progress.rows_transferred = progress.rows_total
            progress.status = BackfillStatus.COMPLETE
            progress.completed_at = datetime.now(tz=timezone.utc)

            logger.info(
                "Backfill complete: %s.%s (%d rows)",
                spoke_id,
                source_table,
                progress.rows_transferred,
            )
        except Exception as exc:
            progress.status = BackfillStatus.FAILED
            progress.error = str(exc)
            logger.exception(
                "Backfill failed: %s.%s",
                spoke_id,
                source_table,
            )

        return progress

    async def run_spoke(self, spoke_id: str) -> BackfillSpokeSummary:
        """Execute backfill for all tables in a spoke, respecting dependencies.

        Tables are sorted by priority and FK dependencies.
        """
        plans = self._plans.get(spoke_id, [])
        if not plans:
            raise ValueError(f"No backfill plans for spoke '{spoke_id}'")

        # Sort by priority (lower first), then by dependency count
        sorted_plans = sorted(
            plans, key=lambda p: (p.priority, len(p.depends_on))
        )

        for plan in sorted_plans:
            await self.run_table(spoke_id, plan.source_table)

        return self.plan_spoke(spoke_id)

    def validate_table(
        self, spoke_id: str, source_table: str
    ) -> BackfillProgress:
        """Validate a backfilled table by checking row counts.

        Phase 1: Checks that rows_transferred > 0 and status is COMPLETE.
        Phase 2: Actual row count + checksum comparison against source.
        """
        progress = self._progress.get(spoke_id, {}).get(source_table)
        if progress is None:
            raise ValueError(
                f"No backfill progress for {spoke_id}.{source_table}"
            )

        if progress.status != BackfillStatus.COMPLETE:
            progress.status = BackfillStatus.FAILED
            progress.error = (
                f"Cannot validate — status is {progress.status.value}"
            )
            return progress

        # Phase 1: simple validation
        progress.rows_validated = progress.rows_transferred
        progress.status = BackfillStatus.COMPLETE
        logger.info(
            "Validated: %s.%s (%d rows)",
            spoke_id,
            source_table,
            progress.rows_validated,
        )
        return progress

    def get_progress(
        self, spoke_id: str, source_table: str | None = None
    ) -> BackfillProgress | BackfillSpokeSummary:
        """Get backfill progress for a table or entire spoke."""
        if source_table:
            progress = self._progress.get(spoke_id, {}).get(source_table)
            if progress is None:
                raise ValueError(
                    f"No backfill progress for {spoke_id}.{source_table}"
                )
            return progress
        return self.plan_spoke(spoke_id)

    def list_spokes(self) -> list[str]:
        """List all spokes with backfill plans."""
        return list(self._plans.keys())

    @property
    def total_tables_planned(self) -> int:
        return sum(len(plans) for plans in self._plans.values())

    @property
    def total_tables_complete(self) -> int:
        return sum(
            1
            for spoke_progress in self._progress.values()
            for prog in spoke_progress.values()
            if prog.status == BackfillStatus.COMPLETE
        )

    def _find_plan(
        self, spoke_id: str, source_table: str
    ) -> BackfillTablePlan | None:
        for plan in self._plans.get(spoke_id, []):
            if plan.source_table == source_table:
                return plan
        return None
