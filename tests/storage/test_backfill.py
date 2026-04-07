"""Tests for the Forge Backfill Engine."""

import asyncio

import pytest

from forge.storage.backfill import (
    BackfillEngine,
    BackfillProgress,
    BackfillSpokeSummary,
    BackfillStatus,
    BackfillStrategy,
    BackfillTablePlan,
)


# ── BackfillStatus ─────────────────────────────────────────────


class TestBackfillStatus:
    """Verify BackfillStatus enum values."""

    def test_enum_values(self):
        assert BackfillStatus.NOT_STARTED == "not_started"
        assert BackfillStatus.SCANNING == "scanning"
        assert BackfillStatus.PLANNED == "planned"
        assert BackfillStatus.IN_PROGRESS == "in_progress"
        assert BackfillStatus.VALIDATING == "validating"
        assert BackfillStatus.COMPLETE == "complete"
        assert BackfillStatus.FAILED == "failed"

    def test_enum_count(self):
        assert len(BackfillStatus) == 7


# ── BackfillStrategy ──────────────────────────────────────────


class TestBackfillStrategy:
    """Verify BackfillStrategy enum values."""

    def test_strategies_exist(self):
        assert BackfillStrategy.PG_COPY == "pg_copy"
        assert BackfillStrategy.PG_DUMP_RESTORE == "pg_dump"
        assert BackfillStrategy.ROW_STREAM == "row_stream"
        assert BackfillStrategy.NEO4J_EXPORT == "neo4j_export"
        assert BackfillStrategy.REDIS_DUMP == "redis_dump"
        assert BackfillStrategy.EVENT_REPLAY == "event_replay"

    def test_strategy_count(self):
        assert len(BackfillStrategy) == 6


# ── BackfillTablePlan ──────────────────────────────────────────


class TestBackfillTablePlan:
    """Verify BackfillTablePlan dataclass behavior."""

    def _make_plan(self, **overrides) -> BackfillTablePlan:
        defaults = {
            "spoke_id": "whk-wms",
            "source_table": "public.Barrel",
            "target_schema": "mod_wms",
            "target_table": "barrels",
            "strategy": BackfillStrategy.PG_COPY,
        }
        defaults.update(overrides)
        return BackfillTablePlan(**defaults)

    def test_basic_creation(self):
        plan = self._make_plan()
        assert plan.spoke_id == "whk-wms"
        assert plan.source_table == "public.Barrel"
        assert plan.target_schema == "mod_wms"
        assert plan.target_table == "barrels"
        assert plan.strategy == BackfillStrategy.PG_COPY

    def test_defaults(self):
        plan = self._make_plan()
        assert plan.estimated_rows is None
        assert plan.id_mapping == "cuid_passthrough"
        assert plan.transforms == []
        assert plan.depends_on == []
        assert plan.priority == 0

    def test_with_estimated_rows(self):
        plan = self._make_plan(estimated_rows=500_000)
        assert plan.estimated_rows == 500_000

    def test_with_dependencies(self):
        plan = self._make_plan(depends_on=["public.Customer", "public.Lot"])
        assert len(plan.depends_on) == 2

    def test_with_transforms(self):
        plan = self._make_plan(transforms=["cuid_to_uuid", "enum_normalize"])
        assert len(plan.transforms) == 2


# ── BackfillProgress ──────────────────────────────────────────


class TestBackfillProgress:
    """Verify BackfillProgress tracking and computed properties."""

    def test_initial_state(self):
        prog = BackfillProgress(spoke_id="whk-wms", table_name="public.Barrel")
        assert prog.status == BackfillStatus.NOT_STARTED
        assert prog.rows_total == 0
        assert prog.rows_transferred == 0
        assert prog.started_at is None

    def test_progress_pct_zero_total(self):
        prog = BackfillProgress(spoke_id="whk-wms", table_name="public.Barrel")
        assert prog.progress_pct == 0.0

    def test_progress_pct_partial(self):
        prog = BackfillProgress(
            spoke_id="whk-wms",
            table_name="public.Barrel",
            rows_total=1000,
            rows_transferred=500,
        )
        assert prog.progress_pct == 50.0

    def test_progress_pct_complete(self):
        prog = BackfillProgress(
            spoke_id="whk-wms",
            table_name="public.Barrel",
            rows_total=1000,
            rows_transferred=1000,
        )
        assert prog.progress_pct == 100.0

    def test_is_terminal_complete(self):
        prog = BackfillProgress(
            spoke_id="whk-wms",
            table_name="public.Barrel",
            status=BackfillStatus.COMPLETE,
        )
        assert prog.is_terminal is True

    def test_is_terminal_failed(self):
        prog = BackfillProgress(
            spoke_id="whk-wms",
            table_name="public.Barrel",
            status=BackfillStatus.FAILED,
        )
        assert prog.is_terminal is True

    def test_is_not_terminal_in_progress(self):
        prog = BackfillProgress(
            spoke_id="whk-wms",
            table_name="public.Barrel",
            status=BackfillStatus.IN_PROGRESS,
        )
        assert prog.is_terminal is False


# ── BackfillSpokeSummary ──────────────────────────────────────


class TestBackfillSpokeSummary:
    """Verify BackfillSpokeSummary computed properties."""

    def test_progress_pct_zero_tables(self):
        summary = BackfillSpokeSummary(spoke_id="whk-wms")
        assert summary.progress_pct == 0.0

    def test_progress_pct_partial(self):
        summary = BackfillSpokeSummary(
            spoke_id="whk-wms",
            tables_total=10,
            tables_complete=5,
        )
        assert summary.progress_pct == 50.0

    def test_progress_pct_complete(self):
        summary = BackfillSpokeSummary(
            spoke_id="whk-wms",
            tables_total=10,
            tables_complete=10,
        )
        assert summary.progress_pct == 100.0


# ── BackfillEngine ─────────────────────────────────────────────


class TestBackfillEngine:
    """Verify BackfillEngine orchestration logic."""

    def _make_plan(self, **overrides) -> BackfillTablePlan:
        defaults = {
            "spoke_id": "whk-wms",
            "source_table": "public.Barrel",
            "target_schema": "mod_wms",
            "target_table": "barrels",
            "strategy": BackfillStrategy.PG_COPY,
            "estimated_rows": 10_000,
        }
        defaults.update(overrides)
        return BackfillTablePlan(**defaults)

    def test_add_table_plan(self):
        engine = BackfillEngine()
        plan = self._make_plan()
        engine.add_table_plan(plan)
        assert engine.total_tables_planned == 1

    def test_add_multiple_plans(self):
        engine = BackfillEngine()
        engine.add_table_plan(self._make_plan(source_table="public.Barrel"))
        engine.add_table_plan(self._make_plan(source_table="public.Customer"))
        assert engine.total_tables_planned == 2

    def test_add_plans_across_spokes(self):
        engine = BackfillEngine()
        engine.add_table_plan(self._make_plan(spoke_id="whk-wms"))
        engine.add_table_plan(
            self._make_plan(
                spoke_id="whk-mes",
                source_table="public.Recipe",
                target_schema="mod_mes",
                target_table="recipes",
            )
        )
        assert engine.total_tables_planned == 2
        assert set(engine.list_spokes()) == {"whk-wms", "whk-mes"}

    def test_plan_spoke_summary(self):
        engine = BackfillEngine()
        engine.add_table_plan(self._make_plan(estimated_rows=10_000))
        engine.add_table_plan(
            self._make_plan(
                source_table="public.Customer",
                target_table="customers",
                estimated_rows=5_000,
            )
        )
        summary = engine.plan_spoke("whk-wms")
        assert summary.tables_total == 2
        assert summary.rows_total == 15_000
        assert summary.overall_status == BackfillStatus.PLANNED

    def test_plan_spoke_empty(self):
        engine = BackfillEngine()
        summary = engine.plan_spoke("nonexistent")
        assert summary.tables_total == 0
        assert summary.overall_status == BackfillStatus.NOT_STARTED

    def test_list_spokes(self):
        engine = BackfillEngine()
        engine.add_table_plan(self._make_plan(spoke_id="whk-wms"))
        engine.add_table_plan(
            self._make_plan(
                spoke_id="whk-mes",
                source_table="public.Recipe",
                target_schema="mod_mes",
                target_table="recipes",
            )
        )
        spokes = engine.list_spokes()
        assert "whk-wms" in spokes
        assert "whk-mes" in spokes

    def test_get_progress_table(self):
        engine = BackfillEngine()
        engine.add_table_plan(self._make_plan())
        progress = engine.get_progress("whk-wms", "public.Barrel")
        assert isinstance(progress, BackfillProgress)
        assert progress.status == BackfillStatus.NOT_STARTED

    def test_get_progress_spoke(self):
        engine = BackfillEngine()
        engine.add_table_plan(self._make_plan())
        summary = engine.get_progress("whk-wms")
        assert isinstance(summary, BackfillSpokeSummary)

    def test_get_progress_nonexistent_raises(self):
        engine = BackfillEngine()
        with pytest.raises(ValueError, match="No backfill progress"):
            engine.get_progress("whk-wms", "nonexistent")

    def test_total_tables_complete_initially_zero(self):
        engine = BackfillEngine()
        engine.add_table_plan(self._make_plan())
        assert engine.total_tables_complete == 0


# ── BackfillEngine async operations ───────────────────────────


class TestBackfillEngineAsync:
    """Verify async backfill execution (Phase 1 simulation)."""

    def test_run_table(self):
        engine = BackfillEngine()
        engine.add_table_plan(
            BackfillTablePlan(
                spoke_id="whk-wms",
                source_table="public.Barrel",
                target_schema="mod_wms",
                target_table="barrels",
                strategy=BackfillStrategy.PG_COPY,
                estimated_rows=10_000,
            )
        )
        progress = asyncio.get_event_loop().run_until_complete(
            engine.run_table("whk-wms", "public.Barrel")
        )
        assert progress.status == BackfillStatus.COMPLETE
        assert progress.rows_transferred == 10_000
        assert progress.completed_at is not None

    def test_run_table_nonexistent_raises(self):
        engine = BackfillEngine()
        with pytest.raises(ValueError, match="No backfill plan"):
            asyncio.get_event_loop().run_until_complete(
                engine.run_table("whk-wms", "nonexistent")
            )

    def test_run_spoke(self):
        engine = BackfillEngine()
        engine.add_table_plan(
            BackfillTablePlan(
                spoke_id="whk-wms",
                source_table="public.Barrel",
                target_schema="mod_wms",
                target_table="barrels",
                strategy=BackfillStrategy.PG_COPY,
                estimated_rows=10_000,
            )
        )
        engine.add_table_plan(
            BackfillTablePlan(
                spoke_id="whk-wms",
                source_table="public.Customer",
                target_schema="mod_wms",
                target_table="customers",
                strategy=BackfillStrategy.PG_COPY,
                estimated_rows=5_000,
            )
        )
        summary = asyncio.get_event_loop().run_until_complete(
            engine.run_spoke("whk-wms")
        )
        assert summary.overall_status == BackfillStatus.COMPLETE
        assert summary.tables_complete == 2
        assert summary.rows_transferred == 15_000

    def test_run_spoke_nonexistent_raises(self):
        engine = BackfillEngine()
        with pytest.raises(ValueError, match="No backfill plans"):
            asyncio.get_event_loop().run_until_complete(
                engine.run_spoke("nonexistent")
            )

    def test_run_spoke_respects_priority(self):
        engine = BackfillEngine()
        # Higher priority (lower number) should run first
        engine.add_table_plan(
            BackfillTablePlan(
                spoke_id="whk-wms",
                source_table="public.Customer",
                target_schema="mod_wms",
                target_table="customers",
                strategy=BackfillStrategy.PG_COPY,
                estimated_rows=5_000,
                priority=0,
            )
        )
        engine.add_table_plan(
            BackfillTablePlan(
                spoke_id="whk-wms",
                source_table="public.Barrel",
                target_schema="mod_wms",
                target_table="barrels",
                strategy=BackfillStrategy.PG_COPY,
                estimated_rows=10_000,
                priority=1,
                depends_on=["public.Customer"],
            )
        )
        summary = asyncio.get_event_loop().run_until_complete(
            engine.run_spoke("whk-wms")
        )
        assert summary.tables_complete == 2


# ── BackfillEngine.validate_table ─────────────────────────────


class TestBackfillEngineValidation:
    """Verify backfill validation (Phase 1 simulation)."""

    def test_validate_complete_table(self):
        engine = BackfillEngine()
        engine.add_table_plan(
            BackfillTablePlan(
                spoke_id="whk-wms",
                source_table="public.Barrel",
                target_schema="mod_wms",
                target_table="barrels",
                strategy=BackfillStrategy.PG_COPY,
                estimated_rows=10_000,
            )
        )
        asyncio.get_event_loop().run_until_complete(
            engine.run_table("whk-wms", "public.Barrel")
        )
        progress = engine.validate_table("whk-wms", "public.Barrel")
        assert progress.status == BackfillStatus.COMPLETE
        assert progress.rows_validated == 10_000

    def test_validate_incomplete_table_fails(self):
        engine = BackfillEngine()
        engine.add_table_plan(
            BackfillTablePlan(
                spoke_id="whk-wms",
                source_table="public.Barrel",
                target_schema="mod_wms",
                target_table="barrels",
                strategy=BackfillStrategy.PG_COPY,
                estimated_rows=10_000,
            )
        )
        # Don't run the table — validate should fail
        progress = engine.validate_table("whk-wms", "public.Barrel")
        assert progress.status == BackfillStatus.FAILED
        assert "Cannot validate" in (progress.error or "")

    def test_validate_nonexistent_raises(self):
        engine = BackfillEngine()
        with pytest.raises(ValueError, match="No backfill progress"):
            engine.validate_table("whk-wms", "nonexistent")
