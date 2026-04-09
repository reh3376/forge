"""Expression tag provider — wires expression evaluation into the tag engine.

This provider doesn't evaluate expressions itself — that's the TagEngine's
job (using restricted scope evaluation for admin-authored SCADA configs).
Instead it:

    1. On startup, identifies all expression-dependent tags (Expression,
       Derived, Reference, Computed) and ensures their dependency graphs
       are properly registered in the TagRegistry.
    2. Triggers initial evaluation of all expression tags so they have
       values immediately (not just after the first source change).
    3. Reports metrics about the dependency graph.

The TagEngine's change propagation loop handles ongoing re-evaluation.
"""

from __future__ import annotations

import logging
from typing import Any

from forge.modules.ot.opcua_client.types import QualityCode
from forge.modules.ot.tag_engine.models import (
    ComputedTag,
    DerivedTag,
    ExpressionTag,
    ReferenceTag,
    TagType,
)
from forge.modules.ot.tag_engine.providers.base import BaseProvider
from forge.modules.ot.tag_engine.registry import TagRegistry

logger = logging.getLogger(__name__)

# Tag types that are evaluated by the engine (not by external providers)
_EVALUABLE_TYPES = (TagType.EXPRESSION, TagType.DERIVED, TagType.REFERENCE, TagType.COMPUTED)


class ExpressionProvider(BaseProvider):
    """Provider for expression-evaluated tags.

    Works in tandem with the TagEngine — the provider handles lifecycle
    (init, initial evaluation), the engine handles ongoing evaluation.
    """

    def __init__(
        self,
        registry: TagRegistry,
        engine: Any = None,  # TagEngine — optional to avoid circular import at construction
    ) -> None:
        super().__init__(name="expression", registry=registry)
        self._engine = engine
        self._evaluable_count = 0
        self._initial_eval_count = 0

    def set_engine(self, engine: Any) -> None:
        """Set the TagEngine reference (deferred to avoid circular deps)."""
        self._engine = engine

    async def _start(self) -> None:
        """Identify evaluable tags and run initial evaluation."""
        # Count evaluable tags
        for tag_type in _EVALUABLE_TYPES:
            tags = await self._registry.find_by_type(tag_type)
            self._evaluable_count += len(tags)

        logger.info(
            "ExpressionProvider: found %d evaluable tags", self._evaluable_count
        )

        # Run initial evaluation if engine is available
        if self._engine is not None:
            await self._run_initial_eval()

    async def _run_initial_eval(self) -> None:
        """Trigger initial evaluation of all expression-dependent tags.

        This ensures Expression/Derived/Reference/Computed tags have
        values immediately, rather than waiting for the first source change.
        Evaluation is delegated to the TagEngine.
        """
        for tag_type in _EVALUABLE_TYPES:
            tags = await self._registry.find_by_type(tag_type)
            for tag in tags:
                try:
                    result = await self._engine.evaluate(tag.path)
                    if result is not None:
                        value, quality = result
                        await self._registry.update_value(tag.path, value, quality)
                        self._initial_eval_count += 1
                except Exception:
                    logger.warning("Initial eval failed for %s", tag.path)

        logger.info(
            "ExpressionProvider: initially evaluated %d tags",
            self._initial_eval_count,
        )

    async def _stop(self) -> None:
        """Nothing to clean up."""
        pass

    async def _health(self) -> dict[str, Any]:
        stats = await self._registry.get_stats()
        return {
            "evaluable_tags": self._evaluable_count,
            "initial_eval_count": self._initial_eval_count,
            "dependency_edges": stats.get("dependency_edges", 0),
        }
