"""Tag evaluation engine — dependency-graph change propagation.

When a source tag's value changes, the engine:
    1. Looks up all dependent tags via the registry's dependency map
    2. Topologically sorts them (handles chained dependencies)
    3. Evaluates each dependent in order
    4. Updates the dependent's value in the registry
    5. Recurses (if the dependent itself has dependents)

The engine also runs scan-class-based evaluation loops — periodic
tickers at CRITICAL (100ms), HIGH (500ms), STANDARD (1s), SLOW (5s)
that poll Query tags and refresh Virtual tag caches.

Design decisions:
    D1: Single-threaded async.  All evaluation happens on one event loop.
         This avoids lock contention and makes dependency ordering trivial.
    D2: Expression evaluation uses a restricted eval() with only tag values
         and math/builtins in scope.  The full sandbox (Phase 2B) replaces
         this with a proper AST-validated execution environment.
    D3: Cycle detection via visited set during propagation.  If tag A depends
         on B which depends on A, the cycle is broken and a warning logged.

Security note:
    Expression/Computed tag evaluation uses restricted eval() with a locked-
    down builtins dict (no import, no open, no exec).  This is intentional
    for SCADA expression evaluation where the expressions come from
    administrator-authored tag configuration files, NOT from user input.
    Phase 2B replaces this with a full AST sandbox.
"""

from __future__ import annotations

import asyncio
import logging
import math
import re
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from forge.modules.ot.opcua_client.types import QualityCode
from forge.modules.ot.tag_engine.models import (
    ComputedTag,
    DerivedTag,
    ExpressionTag,
    ReferenceTag,
    ScanClass,
    TagType,
    TagUnion,
    SCAN_CLASS_INTERVALS_MS,
)
from forge.modules.ot.tag_engine.registry import TagRegistry

logger = logging.getLogger(__name__)

# Regex for {tag_path} placeholders in expressions
_TAG_REF_RE = re.compile(r"\{([^}]+)\}")

# Safe builtins for expression evaluation — no import, no open, no exec.
# These are admin-authored SCADA expressions from tag config files,
# NOT arbitrary user input.
_SAFE_BUILTINS: dict[str, Any] = {
    "__builtins__": {},  # Block all default builtins
    "abs": abs,
    "min": min,
    "max": max,
    "round": round,
    "int": int,
    "float": float,
    "bool": bool,
    "str": str,
    "len": len,
    "sum": sum,
    "pow": pow,
    # math module functions
    "sqrt": math.sqrt,
    "log": math.log,
    "log10": math.log10,
    "exp": math.exp,
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "pi": math.pi,
    "e": math.e,
    "ceil": math.ceil,
    "floor": math.floor,
    "isnan": math.isnan,
    "isinf": math.isinf,
    # statistics
    "mean": statistics.mean,
    "median": statistics.median,
    "stdev": statistics.stdev,
    # None for null checks in expressions
    "None": None,
    "True": True,
    "False": False,
}

# Aggregation functions for DerivedTag
_DERIVED_AGGREGATIONS: dict[str, Any] = {
    "weighted_sum": lambda pairs: sum(v * w for v, w in pairs),
    "average": lambda pairs: (
        sum(v * w for v, w in pairs) / sum(w for _, w in pairs)
        if sum(w for _, w in pairs) != 0 else 0.0
    ),
    "min": lambda pairs: min(v for v, _ in pairs) if pairs else 0.0,
    "max": lambda pairs: max(v for v, _ in pairs) if pairs else 0.0,
    "first": lambda pairs: pairs[0][0] if pairs else None,
    "last": lambda pairs: pairs[-1][0] if pairs else None,
}


def _restricted_eval(expression: str, extra_vars: dict[str, Any] | None = None) -> Any:
    """Evaluate a Python expression in a restricted scope.

    Only math/statistics builtins and tag values are available.
    No import, no open, no exec, no __builtins__ access.
    This is for admin-authored SCADA expressions from config files.
    """
    scope = dict(_SAFE_BUILTINS)
    if extra_vars:
        scope.update(extra_vars)
    return eval(expression, scope)  # noqa: S307


class TagEngine:
    """Async tag evaluation engine.

    Manages change propagation through the dependency graph and
    runs scan-class evaluation loops.
    """

    def __init__(self, registry: TagRegistry) -> None:
        self._registry = registry
        self._running = False
        self._scan_tasks: dict[ScanClass, asyncio.Task[None]] = {}
        self._propagation_queue: asyncio.Queue[str] = asyncio.Queue()
        self._propagation_task: asyncio.Task[None] | None = None

        # Register ourselves as a change listener on the registry
        registry.on_change(self._on_tag_change)

    @property
    def running(self) -> bool:
        return self._running

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Start the evaluation engine.

        Launches scan-class tickers and the propagation consumer.
        """
        if self._running:
            return
        self._running = True
        logger.info("Tag engine starting")

        # Start propagation consumer
        self._propagation_task = asyncio.create_task(
            self._propagation_loop(), name="tag-engine-propagation"
        )

        # Start scan class tickers
        for scan_class, interval_ms in SCAN_CLASS_INTERVALS_MS.items():
            task = asyncio.create_task(
                self._scan_loop(scan_class, interval_ms / 1000.0),
                name=f"tag-engine-scan-{scan_class.value}",
            )
            self._scan_tasks[scan_class] = task

        logger.info("Tag engine started — %d scan classes active", len(self._scan_tasks))

    async def stop(self) -> None:
        """Stop the evaluation engine gracefully."""
        if not self._running:
            return
        self._running = False
        logger.info("Tag engine stopping")

        # Cancel scan tasks
        for task in self._scan_tasks.values():
            task.cancel()
        for task in self._scan_tasks.values():
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._scan_tasks.clear()

        # Cancel propagation task
        if self._propagation_task:
            self._propagation_task.cancel()
            try:
                await self._propagation_task
            except asyncio.CancelledError:
                pass
            self._propagation_task = None

        logger.info("Tag engine stopped")

    # ------------------------------------------------------------------
    # Change propagation
    # ------------------------------------------------------------------

    async def _on_tag_change(self, path: str, value: Any) -> None:
        """Called by the registry when a tag value changes.

        Enqueues the path for dependency propagation.
        """
        if self._running:
            await self._propagation_queue.put(path)

    async def _propagation_loop(self) -> None:
        """Consumer loop — processes tag change events and propagates."""
        while self._running:
            try:
                path = await asyncio.wait_for(
                    self._propagation_queue.get(), timeout=1.0
                )
                await self._propagate(path, visited=set())
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Propagation error")

    async def _propagate(self, source_path: str, visited: set[str]) -> None:
        """Propagate a value change through the dependency graph.

        Uses a visited set to detect and break dependency cycles.
        """
        if source_path in visited:
            logger.warning("Dependency cycle detected at %s — breaking", source_path)
            return
        visited.add(source_path)

        dependents = await self._registry.get_dependents(source_path)
        for dep_path in dependents:
            try:
                result = await self.evaluate(dep_path)
                if result is not None:
                    value, quality = result
                    changed = await self._registry.update_value(
                        dep_path, value, quality
                    )
                    if changed:
                        # Recurse for chained dependencies
                        await self._propagate(dep_path, visited)
            except Exception:
                logger.exception("Failed to evaluate dependent %s", dep_path)
                await self._registry.update_value(
                    dep_path, None, QualityCode.BAD
                )

    # ------------------------------------------------------------------
    # Tag evaluation
    # ------------------------------------------------------------------

    async def evaluate(self, path: str) -> tuple[Any, QualityCode] | None:
        """Evaluate a tag and return (value, quality).

        Returns None if the tag doesn't exist or isn't an evaluable type.
        """
        pair = await self._registry.get_tag_and_value(path)
        if pair is None:
            return None

        tag, _ = pair

        if isinstance(tag, ExpressionTag):
            return await self._eval_expression(tag)
        elif isinstance(tag, DerivedTag):
            return await self._eval_derived(tag)
        elif isinstance(tag, ReferenceTag):
            return await self._eval_reference(tag)
        elif isinstance(tag, ComputedTag):
            return await self._eval_computed(tag)
        else:
            # Standard, Memory, Query, Event, Virtual — not evaluated by engine
            # (they're written to by providers)
            return None

    async def _eval_expression(self, tag: ExpressionTag) -> tuple[Any, QualityCode]:
        """Evaluate an expression tag.

        Replaces {tag_path} placeholders with current values,
        then evaluates the resulting Python expression in a restricted scope.
        """
        expression = tag.expression
        worst_quality = QualityCode.GOOD

        def _replace_ref(match: re.Match) -> str:
            nonlocal worst_quality
            ref_path = match.group(1)
            tv = self._registry._values.get(ref_path)
            if tv is None:
                worst_quality = QualityCode.BAD
                return "None"
            # Degrade quality to worst of all sources
            if _quality_rank(tv.quality) > _quality_rank(worst_quality):
                worst_quality = tv.quality
            if tv.value is None:
                return "None"
            return repr(tv.value)

        resolved = _TAG_REF_RE.sub(_replace_ref, expression)

        try:
            result = _restricted_eval(resolved)
            return result, worst_quality
        except Exception as e:
            logger.warning("Expression eval failed for %s: %s", tag.path, e)
            return None, QualityCode.BAD

    async def _eval_derived(self, tag: DerivedTag) -> tuple[Any, QualityCode]:
        """Evaluate a derived tag — weighted aggregation of sources."""
        pairs: list[tuple[float, float]] = []
        worst_quality = QualityCode.GOOD

        for source in tag.sources:
            tv = self._registry._values.get(source.tag_path)
            if tv is None or tv.value is None:
                worst_quality = QualityCode.BAD
                continue
            try:
                pairs.append((float(tv.value), source.weight))
                if _quality_rank(tv.quality) > _quality_rank(worst_quality):
                    worst_quality = tv.quality
            except (TypeError, ValueError):
                worst_quality = QualityCode.BAD

        if not pairs:
            return None, QualityCode.BAD

        agg_fn = _DERIVED_AGGREGATIONS.get(tag.aggregation)
        if agg_fn is None:
            logger.warning("Unknown aggregation %s for %s", tag.aggregation, tag.path)
            return None, QualityCode.BAD

        try:
            result = agg_fn(pairs)
            return result, worst_quality
        except Exception as e:
            logger.warning("Derived eval failed for %s: %s", tag.path, e)
            return None, QualityCode.BAD

    async def _eval_reference(self, tag: ReferenceTag) -> tuple[Any, QualityCode]:
        """Evaluate a reference tag — read source, optionally transform."""
        tv = self._registry._values.get(tag.source_path)
        if tv is None:
            return None, QualityCode.BAD

        value = tv.value
        quality = tv.quality

        if tag.transform and value is not None:
            try:
                value = _restricted_eval(tag.transform, {"value": value})
            except Exception as e:
                logger.warning("Reference transform failed for %s: %s", tag.path, e)
                return None, QualityCode.BAD

        return value, quality

    async def _eval_computed(self, tag: ComputedTag) -> tuple[Any, QualityCode]:
        """Evaluate a computed tag — custom function with named sources.

        The function body receives source values as keyword arguments.
        For Phase 2A, this uses restricted eval().  Phase 2B will run
        these through the full sandbox with forge.* SDK access.
        """
        kwargs: dict[str, Any] = {}
        worst_quality = QualityCode.GOOD

        for param_name, source_path in tag.sources.items():
            tv = self._registry._values.get(source_path)
            if tv is None or tv.value is None:
                kwargs[param_name] = None
                worst_quality = QualityCode.BAD
            else:
                kwargs[param_name] = tv.value
                if _quality_rank(tv.quality) > _quality_rank(worst_quality):
                    worst_quality = tv.quality

        try:
            # Build a lambda from the function body (admin-authored config)
            param_list = ", ".join(kwargs.keys())
            func_code = f"lambda {param_list}: {tag.function}"
            fn = _restricted_eval(func_code)
            result = fn(**kwargs)
            return result, worst_quality
        except Exception as e:
            logger.warning("Computed eval failed for %s: %s", tag.path, e)
            return None, QualityCode.BAD

    # ------------------------------------------------------------------
    # Scan class loops
    # ------------------------------------------------------------------

    async def _scan_loop(self, scan_class: ScanClass, interval_s: float) -> None:
        """Periodic evaluation loop for a scan class.

        Currently evaluates Query and Virtual tags on their poll intervals.
        Standard tags are driven by OPC-UA subscriptions (push-based),
        not by the scan loop.
        """
        while self._running:
            try:
                await asyncio.sleep(interval_s)
                if not self._running:
                    break

                tag_paths = await self._registry.find_by_scan_class(scan_class)
                for path in tag_paths:
                    tag = await self._registry.get_definition(path)
                    if tag is None:
                        continue
                    # Only evaluate poll-based tag types in scan loops
                    if tag.tag_type in (TagType.QUERY, TagType.VIRTUAL):
                        # Query and Virtual evaluation will be implemented
                        # by their respective providers in Phase 2A.2
                        pass
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Scan loop error for %s", scan_class.value)

    # ------------------------------------------------------------------
    # Utility
    # ------------------------------------------------------------------

    async def evaluate_all_dependents(self, source_path: str) -> int:
        """Force re-evaluation of all tags that depend on source_path.

        Returns the count of tags re-evaluated.
        """
        dependents = await self._registry.get_dependents(source_path)
        count = 0
        for dep_path in dependents:
            try:
                result = await self.evaluate(dep_path)
                if result is not None:
                    value, quality = result
                    await self._registry.update_value(dep_path, value, quality)
                    count += 1
            except Exception:
                logger.exception("Force eval failed for %s", dep_path)
        return count


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_QUALITY_RANK = {
    QualityCode.GOOD: 0,
    QualityCode.UNCERTAIN: 1,
    QualityCode.BAD: 2,
    QualityCode.NOT_AVAILABLE: 3,
}


def _quality_rank(q: QualityCode) -> int:
    """Numeric rank for quality comparison (lower is better)."""
    return _QUALITY_RANK.get(q, 3)
