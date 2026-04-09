"""Map ERPI Recipe/RecipeParameter/RecipeGroup/Bom → Forge ProcessDefinition.

ERPI fields (from Prisma schema):
    Recipe: id, globalId, name, transactionInitiator, ...
    RecipeParameter: id, globalId, recipeId, name, value
    RecipeGroup: id, globalId, name
    Bom: id, globalId, name, recipeId

These entities flow primarily from NetSuite → ERPI → MES (master data).
The transactionInitiator is typically "ERP" for recipe data.
"""

from __future__ import annotations

import logging
from typing import Any

from forge.core.models.manufacturing.process_definition import (
    ProcessDefinition,
)

logger = logging.getLogger(__name__)

_SOURCE_SYSTEM = "whk-erpi"


def map_recipe(raw: dict[str, Any]) -> ProcessDefinition | None:
    """Map an ERPI Recipe dict to a Forge ProcessDefinition."""
    global_id = raw.get("globalId") or raw.get("global_id")
    name = raw.get("name")
    if not global_id or not name:
        logger.warning("Recipe missing globalId or name — skipping: %s", raw)
        return None

    return ProcessDefinition(
        source_system=_SOURCE_SYSTEM,
        source_id=str(raw.get("id", global_id)),
        name=str(name),
        version=_str_or_none(raw.get("version") or raw.get("schemaVersion")),
        description=_str_or_none(raw.get("description")),
        metadata=_build_metadata(raw),
    )


def map_recipe_parameter(raw: dict[str, Any]) -> ProcessDefinition | None:
    """Map an ERPI RecipeParameter to a minimal ProcessDefinition.

    RecipeParameters are child records of a Recipe. We map them as
    ProcessDefinitions with the parameter name and value in parameters dict,
    plus a reference to the parent recipe in metadata.
    """
    global_id = raw.get("globalId") or raw.get("global_id")
    name = raw.get("name") or raw.get("parameterName")
    if not global_id:
        logger.warning("RecipeParameter missing globalId — skipping: %s", raw)
        return None

    param_value = raw.get("value") or raw.get("parameterValue")
    recipe_id = raw.get("recipeId") or raw.get("recipe_id")

    return ProcessDefinition(
        source_system=_SOURCE_SYSTEM,
        source_id=str(raw.get("id", global_id)),
        name=str(name or f"Param-{global_id}"),
        parameters={str(name or "value"): param_value} if param_value is not None else {},
        metadata={
            **_build_metadata(raw),
            "parent_recipe_id": recipe_id,
            "entity_subtype": "recipe_parameter",
        },
    )


def map_recipe_group(raw: dict[str, Any]) -> ProcessDefinition | None:
    """Map an ERPI RecipeGroup to a ProcessDefinition (grouping container)."""
    global_id = raw.get("globalId") or raw.get("global_id")
    name = raw.get("name")
    if not global_id or not name:
        logger.warning("RecipeGroup missing globalId or name — skipping: %s", raw)
        return None

    return ProcessDefinition(
        source_system=_SOURCE_SYSTEM,
        source_id=str(raw.get("id", global_id)),
        name=str(name),
        description=_str_or_none(raw.get("description")),
        metadata={
            **_build_metadata(raw),
            "entity_subtype": "recipe_group",
        },
    )


def map_bom(raw: dict[str, Any]) -> ProcessDefinition | None:
    """Map an ERPI Bom to a ProcessDefinition with BOM focus.

    BOMs are linked to recipes and define the material requirements.
    The bill_of_materials field will be populated in Phase 2 when
    the adapter can query nested BomItem records.
    """
    global_id = raw.get("globalId") or raw.get("global_id")
    name = raw.get("name")
    if not global_id or not name:
        logger.warning("Bom missing globalId or name — skipping: %s", raw)
        return None

    recipe_id = raw.get("recipeId") or raw.get("recipe_id")

    return ProcessDefinition(
        source_system=_SOURCE_SYSTEM,
        source_id=str(raw.get("id", global_id)),
        name=str(name),
        description=_str_or_none(raw.get("description")),
        metadata={
            **_build_metadata(raw),
            "entity_subtype": "bill_of_materials",
            "parent_recipe_id": recipe_id,
        },
    )


def _build_metadata(raw: dict[str, Any]) -> dict[str, Any]:
    meta: dict[str, Any] = {}
    for key in ("transactionInitiator", "transactionStatus", "transactionType", "schemaVersion"):
        val = raw.get(key)
        if val is not None:
            meta[key] = val
    return meta


def _str_or_none(val: Any) -> str | None:
    return str(val) if val else None
