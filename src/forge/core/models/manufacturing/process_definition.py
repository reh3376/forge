"""ProcessDefinition — recipe or protocol (how to make something).

Maps from:
    WMS: Recipe (globalId, data JSON) — simple key-value store
    MES: Recipe (very complex: whiskeyType, version, isPublished, with
         Operations, Parameters, BOMs) + MashingProtocol (templateCategory,
         steps with hold types and durations) + Operation (ISA-88 hierarchy)

WMS stores recipes as opaque JSON — Forge captures the identity.
MES has a deep recipe hierarchy (Recipe → UnitProcedure → Operation →
EquipmentPhase → PhaseParameter). ProcessDefinition captures the common
envelope; the steps list handles the hierarchy; system-specific depth
lives in metadata.
"""

from __future__ import annotations

from pydantic import Field

from forge.core.models.manufacturing.base import ManufacturingModelBase


class ProcessStep(ManufacturingModelBase):
    """A single step within a process definition.

    Steps may be nested (parent_step_id) to represent ISA-88
    procedural hierarchies: Procedure → UnitProcedure → Operation →
    Phase.
    """

    step_number: int = Field(
        ...,
        description="Ordinal position within the parent process or step.",
    )
    name: str = Field(
        ...,
        description="Step name or operation name.",
    )
    step_type: str | None = Field(
        default=None,
        description="Classification (e.g. 'operation', 'phase', 'hold').",
    )
    parent_step_id: str | None = Field(
        default=None,
        description="Reference to parent step for hierarchical processes.",
    )
    duration_minutes: float | None = Field(
        default=None,
        description="Expected duration in minutes.",
    )
    parameters: dict[str, str | float | bool] = Field(
        default_factory=dict,
        description="Key parameters for this step (setpoints, targets).",
    )
    description: str | None = Field(
        default=None,
        description="Human-readable description of this step.",
    )


class ProcessDefinition(ManufacturingModelBase):
    """A recipe, protocol, or procedure for making something.

    Carries enough structure for adapters to represent both simple
    (WMS JSON recipe) and complex (MES ISA-88 hierarchy) definitions.
    """

    name: str = Field(
        ...,
        description="Recipe or protocol name.",
    )
    version: str | None = Field(
        default=None,
        description="Version identifier.",
    )
    product_type: str | None = Field(
        default=None,
        description="Product classification this recipe produces.",
    )
    is_published: bool = Field(
        default=False,
        description="Whether this definition is approved for production use.",
    )
    customer_id: str | None = Field(
        default=None,
        description="Reference to owning BusinessEntity if customer-specific.",
    )
    steps: list[ProcessStep] = Field(
        default_factory=list,
        description="Ordered list of process steps (may be empty for simple recipes).",
    )
    parameters: dict[str, str | float | bool] = Field(
        default_factory=dict,
        description="Top-level recipe parameters (setpoints, targets).",
    )
    bill_of_materials: list[dict[str, str | float]] = Field(
        default_factory=list,
        description="List of material requirements (item_id, quantity, unit).",
    )
    description: str | None = Field(
        default=None,
        description="Human-readable recipe description.",
    )
