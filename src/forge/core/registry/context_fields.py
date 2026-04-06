"""Context field registry — canonical definitions for operational context fields.

Context fields are the named slots in a ContextualRecord's context that
carry operational meaning (lot_id, shift_id, operator_id, etc.). This
registry defines each field's type, description, and provenance from
source systems (WMS, MES).

The registry is the single source of truth for which context fields
exist and what they mean. Adapters use it to validate their context
mappings. Data products use it to understand what context is available.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ContextField:
    """Definition of a single context field."""

    name: str
    field_type: str  # e.g. "str", "datetime", "float"
    description: str
    wms_provenance: str | None = None  # WMS source field/table
    mes_provenance: str | None = None  # MES source field/table
    required: bool = False
    example: str | None = None


class ContextFieldRegistry:
    """Registry of canonical context fields.

    Provides lookup, listing, and validation of context fields
    used in ContextualRecord instances.
    """

    def __init__(self) -> None:
        self._fields: dict[str, ContextField] = {}

    def register(self, ctx_field: ContextField) -> None:
        """Register a context field definition."""
        self._fields[ctx_field.name] = ctx_field

    def get_field(self, name: str) -> ContextField | None:
        """Look up a context field by name."""
        return self._fields.get(name)

    def list_fields(self) -> list[ContextField]:
        """Return all registered fields, sorted by name."""
        return sorted(self._fields.values(), key=lambda f: f.name)

    def list_field_names(self) -> list[str]:
        """Return all registered field names, sorted."""
        return sorted(self._fields.keys())

    def validate_context(
        self, context: dict[str, object],
    ) -> list[str]:
        """Validate a context dict against the registry.

        Returns a list of error messages. Empty list = valid.
        """
        errors: list[str] = []

        # Check required fields
        for ctx_field in self._fields.values():
            if ctx_field.required and ctx_field.name not in context:
                errors.append(
                    f"Missing required context field: {ctx_field.name}",
                )

        # Check for unknown fields (excluding 'extra')
        known = set(self._fields.keys()) | {"extra"}
        for key in context:
            if key not in known:
                errors.append(f"Unknown context field: {key}")

        return errors

    def get_provenance(
        self, name: str, system: str,
    ) -> str | None:
        """Get the source-system provenance for a context field."""
        ctx_field = self._fields.get(name)
        if ctx_field is None:
            return None
        if system == "whk-wms":
            return ctx_field.wms_provenance
        if system == "whk-mes":
            return ctx_field.mes_provenance
        return None

    def __len__(self) -> int:
        return len(self._fields)

    def __contains__(self, name: str) -> bool:
        return name in self._fields


def build_default_registry() -> ContextFieldRegistry:
    """Build the default context field registry with WHK fields.

    These fields are derived from the FACTS specs (whk-wms and whk-mes)
    and the cross-spoke consistency analysis from Path 1.
    """
    registry = ContextFieldRegistry()

    # 6 cross-spoke fields identified in FACTS Path 1
    registry.register(ContextField(
        name="lot_id",
        field_type="str",
        description="Reference to the material lot being processed.",
        wms_provenance="Lot.id / BarrelEvent→Barrel.lotId",
        mes_provenance="Lot.id / Batch.lotId",
        required=False,
        example="lot-2026-0405-001",
    ))
    registry.register(ContextField(
        name="shift_id",
        field_type="str",
        description="Identifier for the work shift during the operation.",
        wms_provenance="EmployeeSchedule (derived)",
        mes_provenance="OperatorShift.shiftName",
        required=False,
        example="B",
    ))
    registry.register(ContextField(
        name="operator_id",
        field_type="str",
        description="User or operator performing the operation.",
        wms_provenance="BarrelEvent.createdBy / User.username",
        mes_provenance="StepExecution.operatorId / User.username",
        required=False,
        example="jsmith",
    ))
    registry.register(ContextField(
        name="event_timestamp",
        field_type="datetime",
        description="Timestamp of the operational event.",
        wms_provenance="BarrelEvent.eventTime",
        mes_provenance="ProductionEvent.timestamp / StepExecution.startedAt",
        required=False,
        example="2026-04-05T14:30:00Z",
    ))
    registry.register(ContextField(
        name="event_type",
        field_type="str",
        description="Classification of the operational event.",
        wms_provenance="EventType.name",
        mes_provenance="ProductionEvent.eventType",
        required=False,
        example="Entry",
    ))
    registry.register(ContextField(
        name="work_order_id",
        field_type="str",
        description="Reference to the work order driving this operation.",
        wms_provenance="WarehouseJobs.id / BarrelEvent.warehouseJobId",
        mes_provenance="ScheduleOrder.id / ProductionOrder.scheduleOrderId",
        required=False,
        example="job-2026-001",
    ))

    # Additional context fields from ContextualRecord.context
    registry.register(ContextField(
        name="equipment_id",
        field_type="str",
        description="Physical asset or equipment where operation occurs.",
        wms_provenance="StorageLocation.globalId / Warehouse.name",
        mes_provenance="Asset.id / Asset.globalId",
        required=False,
        example="FERM-003",
    ))
    registry.register(ContextField(
        name="batch_id",
        field_type="str",
        description="Reference to the production batch.",
        wms_provenance="(not directly — derived from Lot/ProductionOrder)",
        mes_provenance="Batch.id / Batch.globalId",
        required=False,
        example="B2026-0405-003",
    ))
    registry.register(ContextField(
        name="recipe_id",
        field_type="str",
        description="Reference to the recipe or process definition.",
        wms_provenance="Recipe.globalId / Lot.recipeId",
        mes_provenance="Recipe.id / Recipe.globalId",
        required=False,
        example="recipe-bourbon-001",
    ))
    registry.register(ContextField(
        name="operating_mode",
        field_type="str",
        description="Current operating mode of the equipment or process.",
        wms_provenance="(not directly available)",
        mes_provenance="Asset.operationalState / EquipmentStateTransition.toState",
        required=False,
        example="PRODUCTION",
    ))
    registry.register(ContextField(
        name="area",
        field_type="str",
        description="Physical area or zone within the facility.",
        wms_provenance="StorageLocation.warehouse + floor",
        mes_provenance="Asset hierarchy (area level)",
        required=False,
        example="Warehouse-A",
    ))
    registry.register(ContextField(
        name="site",
        field_type="str",
        description="Manufacturing site or facility.",
        wms_provenance="Warehouse.name (top-level)",
        mes_provenance="Asset hierarchy (site level)",
        required=False,
        example="WHK-Main",
    ))

    return registry


_DEFAULT_REGISTRY: ContextFieldRegistry | None = None


def get_default_registry() -> ContextFieldRegistry:
    """Get the default context field registry (lazily built, cached)."""
    global _DEFAULT_REGISTRY
    if _DEFAULT_REGISTRY is None:
        _DEFAULT_REGISTRY = build_default_registry()
    return _DEFAULT_REGISTRY
