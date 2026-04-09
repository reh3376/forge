"""MES Recipe Write Integration.

Bridges the MES recipe system with the control write engine.  When a
production order starts (or a recipe parameter changes), MES pushes
setpoints to PLCs through the full 4-layer defense chain.

Components:

1. ``RecipeWriteAdapter`` — Translates MES recipe parameter payloads
   into WriteRequest objects and executes them through the control
   write engine.

2. ``RecipeWriteResult`` — Aggregates per-parameter results into a
   single batch outcome.

3. ``RecipeWriteConfig`` — Per-equipment mapping of recipe parameter
   names to tag paths and data types.

Design notes:
- Automated recipe writes use role ENGINEER by default — they are
  trusted above operator level but below admin.
- All writes in a recipe download share a ``batch_id`` so the audit
  trail groups them together.
- The adapter does NOT bypass interlocks — if a safety interlock blocks
  a recipe setpoint write, the entire batch is marked as partially
  failed and the MES system must resolve the conflict.
- Parameter-to-tag mapping is configured externally (per equipment),
  not hardcoded.  This allows the same recipe to drive different PLC
  tag paths on different production lines.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from forge.modules.ot.control.models import (
    DataType,
    WriteRequest,
    WriteResult,
    WriteRole,
    WriteStatus,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Recipe write config
# ---------------------------------------------------------------------------


@dataclass
class RecipeParameterMapping:
    """Maps a recipe parameter name to a PLC tag path."""

    parameter_name: str  # MES recipe parameter (e.g., "target_temp")
    tag_path: str  # OPC-UA tag path
    data_type: DataType = DataType.FLOAT
    engineering_units: str = ""
    description: str = ""


@dataclass
class RecipeWriteConfig:
    """Per-equipment recipe write configuration.

    Maps MES recipe parameters to PLC tag paths for a specific
    equipment instance.
    """

    equipment_id: str
    area: str = ""
    mappings: list[RecipeParameterMapping] = field(default_factory=list)
    default_role: WriteRole = WriteRole.ENGINEER
    default_requestor: str = "mes-recipe-engine"

    def get_mapping(self, parameter_name: str) -> RecipeParameterMapping | None:
        """Look up the tag mapping for a parameter name."""
        for m in self.mappings:
            if m.parameter_name == parameter_name:
                return m
        return None

    def add_mapping(self, mapping: RecipeParameterMapping) -> None:
        """Add or replace a parameter mapping."""
        self.mappings = [
            m for m in self.mappings if m.parameter_name != mapping.parameter_name
        ]
        self.mappings.append(mapping)


# ---------------------------------------------------------------------------
# Recipe write result
# ---------------------------------------------------------------------------


@dataclass
class RecipeWriteResult:
    """Aggregated result of a recipe parameter batch write."""

    batch_id: str
    equipment_id: str
    production_order_id: str = ""
    recipe_id: str = ""
    total_parameters: int = 0
    confirmed: int = 0
    failed: int = 0
    skipped: int = 0
    results: list[dict[str, Any]] = field(default_factory=list)
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: datetime | None = None

    @property
    def success(self) -> bool:
        """True if all parameters were confirmed."""
        return self.failed == 0 and self.skipped == 0

    @property
    def partial(self) -> bool:
        """True if some parameters succeeded and some failed."""
        return self.confirmed > 0 and (self.failed > 0 or self.skipped > 0)

    def to_dict(self) -> dict[str, Any]:
        return {
            "batch_id": self.batch_id,
            "equipment_id": self.equipment_id,
            "production_order_id": self.production_order_id,
            "recipe_id": self.recipe_id,
            "total_parameters": self.total_parameters,
            "confirmed": self.confirmed,
            "failed": self.failed,
            "skipped": self.skipped,
            "success": self.success,
            "partial": self.partial,
            "results": self.results,
            "started_at": self.started_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


# ---------------------------------------------------------------------------
# Recipe write adapter
# ---------------------------------------------------------------------------


class RecipeWriteAdapter:
    """Translates MES recipe parameters into control writes.

    Usage::

        adapter = RecipeWriteAdapter(write_engine)
        adapter.register_config(RecipeWriteConfig(
            equipment_id="Distillery01/TIT_2010",
            area="Distillery01",
            mappings=[
                RecipeParameterMapping("target_temp", "WH/WHK01/.../TIT_2010/SP"),
                RecipeParameterMapping("ramp_rate", "WH/WHK01/.../TIT_2010/RampRate"),
            ],
        ))

        result = await adapter.execute_recipe_write(
            equipment_id="Distillery01/TIT_2010",
            parameters={"target_temp": 165.0, "ramp_rate": 2.5},
            production_order_id="PO-001",
        )
    """

    def __init__(self, write_engine: Any) -> None:
        self._engine = write_engine
        self._configs: dict[str, RecipeWriteConfig] = {}

    # -- Config registry -----------------------------------------------------

    def register_config(self, config: RecipeWriteConfig) -> None:
        self._configs[config.equipment_id] = config

    def unregister_config(self, equipment_id: str) -> bool:
        return self._configs.pop(equipment_id, None) is not None

    def get_config(self, equipment_id: str) -> RecipeWriteConfig | None:
        return self._configs.get(equipment_id)

    def get_all_configs(self) -> list[RecipeWriteConfig]:
        return list(self._configs.values())

    # -- Batch execution -----------------------------------------------------

    async def execute_recipe_write(
        self,
        equipment_id: str,
        parameters: dict[str, Any],
        production_order_id: str = "",
        recipe_id: str = "",
        requestor: str | None = None,
        role: WriteRole | None = None,
        reason: str = "",
    ) -> RecipeWriteResult:
        """Execute a batch of recipe parameter writes.

        Each parameter is resolved to a tag path via the equipment's
        RecipeWriteConfig, then submitted to the control write engine.
        """
        config = self._configs.get(equipment_id)
        batch_id = str(uuid.uuid4())

        batch_result = RecipeWriteResult(
            batch_id=batch_id,
            equipment_id=equipment_id,
            production_order_id=production_order_id,
            recipe_id=recipe_id,
            total_parameters=len(parameters),
        )

        if config is None:
            logger.warning(
                "No recipe write config for equipment %s", equipment_id
            )
            batch_result.skipped = len(parameters)
            for param_name, param_value in parameters.items():
                batch_result.results.append({
                    "parameter": param_name,
                    "value": param_value,
                    "status": "SKIPPED",
                    "error": f"No config for equipment {equipment_id}",
                })
            batch_result.completed_at = datetime.now(timezone.utc)
            return batch_result

        effective_role = role or config.default_role
        effective_requestor = requestor or config.default_requestor
        effective_reason = reason or f"Recipe download: {recipe_id or 'unknown'}"

        for param_name, param_value in parameters.items():
            mapping = config.get_mapping(param_name)

            if mapping is None:
                batch_result.skipped += 1
                batch_result.results.append({
                    "parameter": param_name,
                    "value": param_value,
                    "status": "SKIPPED",
                    "error": f"No mapping for parameter '{param_name}'",
                })
                continue

            request = WriteRequest(
                tag_path=mapping.tag_path,
                value=param_value,
                data_type=mapping.data_type,
                requestor=effective_requestor,
                role=effective_role,
                reason=effective_reason,
                area=config.area,
                equipment_id=equipment_id,
                batch_id=batch_id,
            )

            try:
                result: WriteResult = await self._engine.execute(request)

                if result.status == WriteStatus.CONFIRMED:
                    batch_result.confirmed += 1
                else:
                    batch_result.failed += 1

                batch_result.results.append({
                    "parameter": param_name,
                    "value": param_value,
                    "tag_path": mapping.tag_path,
                    "status": result.status.value,
                    "request_id": result.request.request_id,
                    "error": (
                        result.validation_error
                        or result.interlock_error
                        or result.auth_error
                        or result.write_error
                        or result.readback_error
                        or ""
                    ),
                })
            except Exception as exc:
                batch_result.failed += 1
                batch_result.results.append({
                    "parameter": param_name,
                    "value": param_value,
                    "tag_path": mapping.tag_path,
                    "status": "ERROR",
                    "error": str(exc),
                })

        batch_result.completed_at = datetime.now(timezone.utc)
        return batch_result
