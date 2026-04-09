"""Tag template system — parameterized tag definitions for common equipment.

Templates solve the SCADA configuration explosion problem: a distillery
with 200 analog instruments doesn't need 1000+ hand-configured tags.
Instead, define an `AnalogInstrument` template once and instantiate it
per device.  Template changes propagate to all instances.

This is the Forge equivalent of Ignition's UDT (User Defined Type) system,
extended with:
    - Typed parameters (str, int, float, bool) with defaults and validation
    - Template inheritance (e.g., `VFD_Drive` extends `MotorStarter`)
    - Forge-exclusive tag types in definitions (Computed, Event, Virtual)
    - JSON-serializable for Git-native config management

Example usage:
    analog = TagTemplate(
        name="AnalogInstrument",
        parameters={"connection": TemplateParam(type="str", required=True),
                     "base_path": TemplateParam(type="str", required=True),
                     "tag_id": TemplateParam(type="str", required=True),
                     "units": TemplateParam(type="str", default=""),
                     "hi_alarm": TemplateParam(type="float", default=None),
                     "lo_alarm": TemplateParam(type="float", default=None)},
        tags=[
            TemplateTagDef(
                path_template="{base_path}/{tag_id}/Out_PV",
                tag_type="standard",
                data_type="Float",
                opcua_node_id_template="ns=2;s={base_path}.{tag_id}.Out_PV",
                connection_name_template="{connection}",
                engineering_units_template="{units}",
            ),
            ...
        ],
    )

    tags = analog.instantiate(
        instance_name="TIT_2010",
        params={"connection": "WHK01", "base_path": "Distillery01",
                "tag_id": "TIT_2010", "units": "°F"},
    )
"""

from __future__ import annotations

import copy
import logging
import re
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field, field_validator

from forge.modules.ot.opcua_client.types import DataType
from forge.modules.ot.tag_engine.models import (
    AlarmConfig,
    BaseTag,
    ClampConfig,
    HistoryConfig,
    ScaleConfig,
    ScanClass,
    TagType,
    TagUnion,
    StandardTag,
    MemoryTag,
    ExpressionTag,
    ComputedTag,
    DerivedTag,
    ReferenceTag,
    QueryTag,
    EventTag,
    VirtualTag,
)

logger = logging.getLogger(__name__)

# Regex for template parameter references: {param_name}
_PARAM_REF_RE = re.compile(r"\{(\w+)\}")

# Maps tag_type string → Pydantic model class
_TAG_TYPE_TO_CLASS: dict[str, type[BaseTag]] = {
    "standard": StandardTag,
    "memory": MemoryTag,
    "expression": ExpressionTag,
    "computed": ComputedTag,
    "derived": DerivedTag,
    "reference": ReferenceTag,
    "query": QueryTag,
    "event": EventTag,
    "virtual": VirtualTag,
}


# ---------------------------------------------------------------------------
# Template parameter definition
# ---------------------------------------------------------------------------


class TemplateParam(BaseModel):
    """A typed parameter for a tag template.

    Parameters are resolved at instantiation time.  They can be referenced
    in tag definitions using {param_name} syntax.
    """

    type: str = Field(
        default="str",
        description="Parameter type: str, int, float, bool",
    )
    description: str = ""
    required: bool = False
    default: Any = None

    @field_validator("type")
    @classmethod
    def _validate_type(cls, v: str) -> str:
        allowed = {"str", "int", "float", "bool"}
        if v not in allowed:
            raise ValueError(f"Parameter type must be one of {allowed}, got: {v}")
        return v

    def coerce(self, value: Any) -> Any:
        """Coerce a value to the declared parameter type."""
        if value is None:
            return None
        coercers = {"str": str, "int": int, "float": float, "bool": bool}
        return coercers[self.type](value)


# ---------------------------------------------------------------------------
# Template tag definition (pre-instantiation)
# ---------------------------------------------------------------------------


class TemplateTagDef(BaseModel):
    """A tag definition within a template — contains parameter placeholders.

    Fields ending in _template can contain {param_name} references that
    are resolved during instantiation.
    """

    # Core — all tags
    path_template: str = Field(
        description="Tag path with {param} placeholders (e.g., '{base_path}/{tag_id}/Out_PV')"
    )
    tag_type: str = Field(
        default="standard",
        description="One of the 9 Forge tag types",
    )
    data_type: str = Field(default="Double")
    scan_class: str = Field(default="standard")
    description_template: str = ""
    engineering_units_template: str = ""
    area_template: str = ""
    equipment_id_template: str = ""
    enabled: bool = True

    # Optional configs
    scale: ScaleConfig | None = None
    clamp: ClampConfig | None = None
    alarm: AlarmConfig | None = None
    history: HistoryConfig | None = None

    metadata: dict[str, Any] = Field(default_factory=dict)

    # StandardTag-specific
    opcua_node_id_template: str | None = None
    connection_name_template: str | None = None

    # MemoryTag-specific
    default_value: Any = None
    persist: bool = False

    # ExpressionTag-specific
    expression_template: str | None = None

    # ComputedTag-specific
    sources_template: dict[str, str] | None = None
    function_body_template: str | None = None

    # EventTag-specific
    event_source: str | None = None
    topic_or_exchange_template: str | None = None

    @field_validator("tag_type")
    @classmethod
    def _validate_tag_type(cls, v: str) -> str:
        if v not in _TAG_TYPE_TO_CLASS:
            raise ValueError(f"Unknown tag type: {v}")
        return v


# ---------------------------------------------------------------------------
# Tag template
# ---------------------------------------------------------------------------


class TagTemplate(BaseModel):
    """A parameterized tag template — the Forge equivalent of Ignition UDTs.

    Templates define a reusable set of tag definitions with parameter
    placeholders.  Instantiation resolves all placeholders and produces
    concrete tag objects ready for registration.
    """

    name: str = Field(description="Template name (e.g., 'AnalogInstrument')")
    description: str = ""
    version: str = "1.0.0"
    parameters: dict[str, TemplateParam] = Field(default_factory=dict)
    tags: list[TemplateTagDef] = Field(default_factory=list)

    # Optional parent template name for inheritance
    extends: str | None = None

    # Metadata
    metadata: dict[str, Any] = Field(default_factory=dict)

    def validate_params(self, params: dict[str, Any]) -> dict[str, Any]:
        """Validate and coerce instance parameters against template declarations.

        Returns a resolved params dict with defaults filled in.
        Raises ValueError if required params are missing or types are wrong.
        """
        resolved: dict[str, Any] = {}
        errors: list[str] = []

        for name, param_def in self.parameters.items():
            if name in params:
                try:
                    resolved[name] = param_def.coerce(params[name])
                except (ValueError, TypeError) as e:
                    errors.append(f"Parameter '{name}': {e}")
            elif param_def.required:
                errors.append(f"Required parameter '{name}' not provided")
            else:
                resolved[name] = param_def.default

        # Warn about extra params
        extra = set(params.keys()) - set(self.parameters.keys())
        if extra:
            logger.warning(
                "Template '%s': ignoring unknown parameters: %s",
                self.name,
                extra,
            )

        if errors:
            raise ValueError(
                f"Template '{self.name}' parameter errors: {'; '.join(errors)}"
            )
        return resolved

    def instantiate(
        self,
        instance_name: str,
        params: dict[str, Any],
        *,
        path_prefix: str = "",
    ) -> list[TagUnion]:
        """Create concrete tag objects by resolving all parameter placeholders.

        Args:
            instance_name: Unique name for this instance (for logging/tracing)
            params: Parameter values to resolve placeholders
            path_prefix: Optional prefix prepended to all tag paths

        Returns:
            List of concrete tag objects ready for registry.register()
        """
        resolved_params = self.validate_params(params)
        tags: list[TagUnion] = []

        for tag_def in self.tags:
            try:
                tag = self._build_tag(tag_def, resolved_params, path_prefix)
                tags.append(tag)
            except Exception:
                logger.exception(
                    "Template '%s' instance '%s': failed to build tag from %s",
                    self.name,
                    instance_name,
                    tag_def.path_template,
                )
                raise

        logger.debug(
            "Template '%s' instance '%s': created %d tags",
            self.name,
            instance_name,
            len(tags),
        )
        return tags

    def _build_tag(
        self,
        tag_def: TemplateTagDef,
        params: dict[str, Any],
        path_prefix: str,
    ) -> TagUnion:
        """Build a single concrete tag from a template definition."""
        resolve = lambda s: self._resolve_template(s, params) if s else ""

        # Resolve path
        path = resolve(tag_def.path_template)
        if path_prefix:
            path = f"{path_prefix}/{path}"

        # Build common kwargs
        kwargs: dict[str, Any] = {
            "path": path,
            "data_type": DataType(tag_def.data_type),
            "scan_class": ScanClass(tag_def.scan_class),
            "description": resolve(tag_def.description_template),
            "engineering_units": resolve(tag_def.engineering_units_template),
            "area": resolve(tag_def.area_template),
            "equipment_id": resolve(tag_def.equipment_id_template),
            "enabled": tag_def.enabled,
            "metadata": {**tag_def.metadata, "_template": self.name},
        }

        # Optional configs
        if tag_def.scale:
            kwargs["scale"] = tag_def.scale
        if tag_def.clamp:
            kwargs["clamp"] = tag_def.clamp
        if tag_def.alarm:
            kwargs["alarm"] = tag_def.alarm
        if tag_def.history:
            kwargs["history"] = tag_def.history

        # Type-specific fields
        tag_type = tag_def.tag_type
        if tag_type == "standard":
            kwargs["opcua_node_id"] = resolve(tag_def.opcua_node_id_template or "")
            kwargs["connection_name"] = resolve(tag_def.connection_name_template or "")
        elif tag_type == "memory":
            kwargs["default_value"] = tag_def.default_value
            kwargs["persist"] = tag_def.persist
        elif tag_type == "expression":
            kwargs["expression"] = resolve(tag_def.expression_template or "")
        elif tag_type == "computed":
            if tag_def.sources_template:
                kwargs["sources"] = {
                    k: resolve(v) for k, v in tag_def.sources_template.items()
                }
            kwargs["function_body"] = resolve(tag_def.function_body_template or "")
        elif tag_type == "event":
            kwargs["event_source"] = tag_def.event_source or ""
            kwargs["topic_or_exchange"] = resolve(
                tag_def.topic_or_exchange_template or ""
            )

        cls = _TAG_TYPE_TO_CLASS[tag_type]
        return cls(**kwargs)

    @staticmethod
    def _resolve_template(template_str: str, params: dict[str, Any]) -> str:
        """Replace {param_name} references with resolved values."""
        if not template_str:
            return ""

        def _replace(match: re.Match) -> str:
            key = match.group(1)
            if key in params:
                return str(params[key]) if params[key] is not None else ""
            # Leave unresolved — might be a tag reference like {other/tag}
            return match.group(0)

        return _PARAM_REF_RE.sub(_replace, template_str)


# ---------------------------------------------------------------------------
# Template registry
# ---------------------------------------------------------------------------


class TemplateRegistry:
    """In-memory catalog of tag templates.

    Supports inheritance: if template A extends template B, instantiation
    first collects B's tags then A's tags (A can override by path).
    """

    def __init__(self) -> None:
        self._templates: dict[str, TagTemplate] = {}

    @property
    def count(self) -> int:
        return len(self._templates)

    def register(self, template: TagTemplate) -> None:
        """Register a template. Raises ValueError if name already exists."""
        if template.name in self._templates:
            raise ValueError(f"Template already registered: {template.name}")
        if template.extends and template.extends not in self._templates:
            raise ValueError(
                f"Template '{template.name}' extends '{template.extends}' "
                f"which is not registered"
            )
        self._templates[template.name] = template

    def get(self, name: str) -> TagTemplate | None:
        return self._templates.get(name)

    def list_templates(self) -> list[str]:
        return sorted(self._templates.keys())

    def instantiate(
        self,
        template_name: str,
        instance_name: str,
        params: dict[str, Any],
        *,
        path_prefix: str = "",
    ) -> list[TagUnion]:
        """Instantiate a template, resolving inheritance chain.

        If the template extends a parent, the parent's tags are created first,
        then the child's tags are added (or override by path).
        """
        template = self._templates.get(template_name)
        if template is None:
            raise ValueError(f"Unknown template: {template_name}")

        # Collect inheritance chain (child first)
        chain: list[TagTemplate] = []
        current: TagTemplate | None = template
        visited: set[str] = set()
        while current is not None:
            if current.name in visited:
                raise ValueError(
                    f"Circular template inheritance: {current.name}"
                )
            visited.add(current.name)
            chain.append(current)
            current = self._templates.get(current.extends) if current.extends else None

        # Reverse to get parent first
        chain.reverse()

        # Merge parameters (parent first, child overrides)
        merged_params: dict[str, TemplateParam] = {}
        for tmpl in chain:
            merged_params.update(tmpl.parameters)

        # Build a synthetic template with merged params for validation
        validation_template = TagTemplate(
            name=template_name,
            parameters=merged_params,
        )
        resolved_params = validation_template.validate_params(params)

        # Instantiate tags: parent first, child can override by path
        tag_by_path: dict[str, TagUnion] = {}
        for tmpl in chain:
            for tag_def in tmpl.tags:
                tag = tmpl._build_tag(tag_def, resolved_params, path_prefix)
                tag_by_path[tag.path] = tag

        return list(tag_by_path.values())
