"""Schema compatibility checker with diff capability.

Implements the four compatibility modes defined by the F20 spec:
    BACKWARD  — new schema can read data written by the old schema
    FORWARD   — old schema can read data written by the new schema
    FULL      — both BACKWARD and FORWARD
    NONE      — no enforcement

Compatibility is assessed by comparing required fields, field types,
and structural changes between two JSON schema versions.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from forge.registry.models import CompatibilityMode


@dataclass
class FieldDiff:
    """A single difference between two schema versions."""

    field_path: str
    change_type: str  # "added", "removed", "type_changed", "required_added", "required_removed"
    old_value: Any = None
    new_value: Any = None

    @property
    def description(self) -> str:
        if self.change_type == "added":
            return f"Field '{self.field_path}' was added"
        if self.change_type == "removed":
            return f"Field '{self.field_path}' was removed"
        if self.change_type == "type_changed":
            return (
                f"Field '{self.field_path}' type changed"
                f" from '{self.old_value}' to '{self.new_value}'"
            )
        if self.change_type == "required_added":
            return f"Field '{self.field_path}' became required"
        if self.change_type == "required_removed":
            return f"Field '{self.field_path}' is no longer required"
        return f"Field '{self.field_path}': {self.change_type}"


@dataclass
class CompatibilityResult:
    """Result of a compatibility check between two schema versions."""

    compatible: bool
    mode: CompatibilityMode
    diffs: list[FieldDiff] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    @property
    def diff_summary(self) -> list[str]:
        return [d.description for d in self.diffs]


def compute_diff(
    old_schema: dict[str, Any],
    new_schema: dict[str, Any],
    prefix: str = "",
) -> list[FieldDiff]:
    """Compute field-level diffs between two JSON schemas.

    Only inspects ``properties`` and ``required`` at each level.
    Recurses into nested object schemas.
    """
    diffs: list[FieldDiff] = []
    old_props = old_schema.get("properties", {})
    new_props = new_schema.get("properties", {})
    old_required = set(old_schema.get("required", []))
    new_required = set(new_schema.get("required", []))

    all_fields = set(old_props) | set(new_props)

    for fname in sorted(all_fields):
        path = f"{prefix}.{fname}" if prefix else fname
        in_old = fname in old_props
        in_new = fname in new_props

        if in_old and not in_new:
            diffs.append(FieldDiff(field_path=path, change_type="removed"))
            continue

        if in_new and not in_old:
            diffs.append(FieldDiff(field_path=path, change_type="added"))
            if fname in new_required:
                diffs.append(FieldDiff(field_path=path, change_type="required_added"))
            continue

        # Both exist — check type changes
        old_type = old_props[fname].get("type")
        new_type = new_props[fname].get("type")
        if old_type != new_type:
            diffs.append(
                FieldDiff(
                    field_path=path,
                    change_type="type_changed",
                    old_value=old_type,
                    new_value=new_type,
                )
            )

        # Required status changes
        if fname not in old_required and fname in new_required:
            diffs.append(FieldDiff(field_path=path, change_type="required_added"))
        elif fname in old_required and fname not in new_required:
            diffs.append(FieldDiff(field_path=path, change_type="required_removed"))

        # Recurse into nested objects
        if old_props[fname].get("type") == "object" and new_props[fname].get("type") == "object":
            diffs.extend(compute_diff(old_props[fname], new_props[fname], prefix=path))

    return diffs


def check_compatibility(
    old_schema: dict[str, Any],
    new_schema: dict[str, Any],
    mode: CompatibilityMode,
) -> CompatibilityResult:
    """Check if *new_schema* is compatible with *old_schema* under *mode*.

    Rules:
        BACKWARD — new schema can read old data:
            - No new required fields (old data won't have them)
            - No removed fields (old data has them, new schema must accept)
            - No type changes (old data has old types)

        FORWARD — old schema can read new data:
            - No removed required fields (new data may omit them)
            - No added fields that old schema doesn't know about
              (not strictly enforced — additionalProperties controls this)
            - No type changes

        FULL — both BACKWARD and FORWARD

        NONE — always compatible
    """
    if mode == CompatibilityMode.NONE:
        diffs = compute_diff(old_schema, new_schema)
        return CompatibilityResult(compatible=True, mode=mode, diffs=diffs)

    diffs = compute_diff(old_schema, new_schema)
    errors: list[str] = []

    if mode in (CompatibilityMode.BACKWARD, CompatibilityMode.FULL):
        # New required fields break backward compat (old data won't have them)
        for d in diffs:
            if d.change_type == "required_added" or d.change_type == "type_changed":
                errors.append(f"BACKWARD: {d.description}")

    if mode in (CompatibilityMode.FORWARD, CompatibilityMode.FULL):
        # Removing required fields breaks forward compat (new data may omit them)
        for d in diffs:
            if d.change_type == "removed" or d.change_type == "type_changed":
                errors.append(f"FORWARD: {d.description}")

    return CompatibilityResult(
        compatible=len(errors) == 0,
        mode=mode,
        diffs=diffs,
        errors=errors,
    )
