"""Map MES Recipe + MashingProtocol -> Forge ProcessDefinition.

MES Recipe fields (from Prisma schema):
    id, name, version, whiskeyType, isPublished, isClassDefinition,
    customerId, operations[], parameters[], recipeBom[]

MES MashingProtocol fields (from Prisma schema):
    id, name, templateCategory, master (bool), recipeId,
    steps[] (with holdType, duration, temperature, etc.)

Key insight: MES uses a class/instance pattern:
    - Recipe with isClassDefinition=true -> master recipe template
    - Recipe with isClassDefinition=false -> runtime instance
    - MashingProtocol with master=true -> protocol template
    - MashingProtocol with master=false -> runtime copy

The mapper captures the class/instance distinction in metadata
so downstream consumers can differentiate templates from executions.

Forge ProcessDefinition fields:
    name, version, product_type, is_published, customer_id,
    steps, parameters, bill_of_materials, description
    + provenance envelope
"""

from __future__ import annotations

import logging
from typing import Any

from forge.core.models.manufacturing.process_definition import (
    ProcessDefinition,
    ProcessStep,
)

logger = logging.getLogger(__name__)

_SOURCE_SYSTEM = "whk-mes"


def map_recipe(raw: dict[str, Any]) -> ProcessDefinition | None:
    """Map an MES Recipe dict to a Forge ProcessDefinition.

    Handles both class definitions (master templates) and runtime
    instances. The is_class_definition flag is preserved in metadata
    for downstream consumers that need to distinguish them.

    Returns None if the recipe id or name is missing.
    """
    recipe_id = raw.get("id") or raw.get("recipe_id") or raw.get("recipeId")
    name = raw.get("name") or raw.get("recipeName") or raw.get("recipe_name")
    if not recipe_id or not name:
        logger.warning("Recipe dict missing id or name -- skipping: %s", raw)
        return None

    # Extract steps from operations or mashing protocol steps
    steps = _extract_steps(raw)

    # Extract parameters
    parameters = _extract_parameters(raw)

    # Extract BOM (bill of materials)
    bom = _extract_bom(raw)

    # Use explicit None checks — these are booleans where False is meaningful
    is_class = raw.get("isClassDefinition")
    if is_class is None:
        is_class = raw.get("is_class_definition")
    is_master = raw.get("master")

    return ProcessDefinition(
        source_system=_SOURCE_SYSTEM,
        source_id=str(recipe_id),
        name=str(name),
        version=raw.get("version"),
        product_type=raw.get("whiskeyType") or raw.get("whiskey_type"),
        is_published=bool(raw.get("isPublished") or raw.get("is_published")),
        customer_id=_str_or_none(raw.get("customerId") or raw.get("customer_id")),
        steps=steps,
        parameters=parameters,
        bill_of_materials=bom,
        description=raw.get("description"),
        metadata={
            k: v
            for k, v in {
                "is_class_definition": is_class,
                "is_master": is_master,
                "template_category": raw.get("templateCategory")
                or raw.get("template_category"),
                "whiskey_type_id": raw.get("whiskeyTypeId")
                or raw.get("whiskey_type_id"),
                "recipe_group_id": raw.get("recipeGroupId")
                or raw.get("recipe_group_id"),
            }.items()
            if v is not None
        },
    )


def _extract_steps(raw: dict[str, Any]) -> list[ProcessStep]:
    """Extract process steps from recipe operations or protocol steps.

    MES recipes have operations (ISA-88 hierarchy), and mashing
    protocols have steps with hold types and durations. Both map
    to ProcessStep with appropriate step_type values.
    """
    steps: list[ProcessStep] = []

    # Try operations first (ISA-88 hierarchy)
    operations = raw.get("operations") or raw.get("steps") or []
    if isinstance(operations, list):
        for idx, op in enumerate(operations):
            if not isinstance(op, dict):
                continue
            op_id = op.get("id") or f"step-{idx}"
            op_name = op.get("name") or op.get("stepName") or f"Step {idx + 1}"
            steps.append(
                ProcessStep(
                    source_system=_SOURCE_SYSTEM,
                    source_id=str(op_id),
                    step_number=op.get("stepIndex") or op.get("step_index") or idx + 1,
                    name=str(op_name),
                    step_type=(
                        op.get("holdType")
                        or op.get("hold_type")
                        or op.get("type")
                        or "operation"
                    ),
                    parent_step_id=_str_or_none(
                        op.get("parentId") or op.get("parent_id")
                    ),
                    duration_minutes=_float_or_none(
                        op.get("duration") or op.get("durationMinutes")
                    ),
                    parameters={
                        k: v
                        for k, v in {
                            "temperature": op.get("temperature") or op.get("targetTemperature"),
                            "ph": op.get("ph"),
                            "gravity": op.get("gravity"),
                        }.items()
                        if v is not None
                    },
                    description=op.get("description"),
                )
            )

    return steps


def _extract_parameters(raw: dict[str, Any]) -> dict[str, str | float | bool]:
    """Extract top-level recipe parameters."""
    params: dict[str, str | float | bool] = {}
    raw_params = raw.get("parameters") or raw.get("recipeParameters") or []
    if isinstance(raw_params, list):
        for p in raw_params:
            if isinstance(p, dict):
                key = p.get("name") or p.get("parameterName") or p.get("key")
                val = p.get("value") or p.get("defaultValue")
                if key and val is not None:
                    params[str(key)] = val
    elif isinstance(raw_params, dict):
        params = {k: v for k, v in raw_params.items() if v is not None}
    return params


def _extract_bom(raw: dict[str, Any]) -> list[dict[str, str | float]]:
    """Extract bill of materials items."""
    bom: list[dict[str, str | float]] = []
    raw_bom = raw.get("recipeBom") or raw.get("recipe_bom") or raw.get("bom") or []
    if isinstance(raw_bom, list):
        for item in raw_bom:
            if not isinstance(item, dict):
                continue
            entry: dict[str, str | float] = {}
            item_id = item.get("itemId") or item.get("item_id")
            if item_id:
                entry["item_id"] = str(item_id)
            qty = _float_or_none(item.get("quantity"))
            if qty is not None:
                entry["quantity"] = qty
            unit = item.get("unit") or item.get("unitOfMeasure")
            if unit:
                entry["unit"] = str(unit)
            if entry:
                bom.append(entry)
    return bom


def _str_or_none(val: Any) -> str | None:
    return str(val) if val else None


def _float_or_none(val: Any) -> float | None:
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None
