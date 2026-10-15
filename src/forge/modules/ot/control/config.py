"""Declarative configuration for the OT control runtime (FB-065).

One JSON document describes everything the changeover sequence needs on
the OT side: writable PLC tags with their ranges, safety interlocks, write
permissions, per-equipment recipe parameter mappings, the MES changeover
areas this module serves (with their CIP policy and PLC CIP sequence) and
how MES topics reach the module (embedded broker or external MQTT).

Cross-references are checked when the document is parsed, so a tag that a
recipe or CIP sequence writes but the validator does not know fails at
start-up rather than in the middle of a changeover::

    {
      "site": "whk01",
      "write_tags": [{"tag_path": "WH/WHK01/Cooker01/TIT_2010/SP", "data_type": "FLOAT",
                      "min_value": 0, "max_value": 212, "engineering_units": "degF"}],
      "permissions": [{"area_pattern": "*", "tag_pattern": "WH/WHK01/**", "min_role": "ENGINEER"}],
      "recipes": [{"equipment_id": "Cooker01", "area": "cooker",
                   "mappings": [{"parameter_name": "target_temp",
                                 "tag_path": "WH/WHK01/Cooker01/TIT_2010/SP"}]}],
      "changeover_areas": [{"area": "cooker", "equipment_id": "Cooker01", "cooker_number": "1",
                            "cip_policy": "runner",
                            "cip": {"start_tag": "...", "state_tag": "..."}}]
    }

The dataclasses from ``forge.modules.ot.control.models`` and
``recipe_integration`` are validated directly by pydantic (field types and
enums are coerced from JSON); unknown keys are rejected explicitly.
"""

from __future__ import annotations

import dataclasses
import json
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from forge.modules.ot.control.changeover_orchestrator import (
    OT_ADAPTER_ID,
    AreaChangeoverConfig,
    CipPolicy,
)
from forge.modules.ot.control.cip_runner import PlcCipSpec  # noqa: TC001 — pydantic field type
from forge.modules.ot.control.models import InterlockRule, TagWriteConfig, WritePermission
from forge.modules.ot.control.recipe_integration import (
    RecipeParameterMapping,
    RecipeWriteConfig,
)

DEFAULT_CONFIG_ENV = "FORGE_OT_CONTROL_CONFIG"


class ConfigError(ValueError):
    """The control configuration document is inconsistent."""


class MqttIngressSettings(BaseModel):
    """How MES topics reach the module."""

    model_config = ConfigDict(extra="forbid")

    #: ``local`` = the embedded Forge broker (started by the runtime unless one is
    #: injected); ``external`` = an aiomqtt client to a broker; ``none`` = messages
    #: are fed programmatically (tests, custom transports).
    mode: Literal["local", "external", "none"] = "local"
    host: str = "127.0.0.1"
    port: int = Field(default=1883, ge=0, le=65535)
    username: str = ""
    password: str = ""
    client_id: str = "forge-ot-control"
    use_tls: bool = False
    ca_certs: str = ""
    certfile: str = ""
    keyfile: str = ""
    reconnect_min_delay: float = Field(default=1.0, gt=0)
    reconnect_max_delay: float = Field(default=60.0, gt=0)
    #: Publish ``<root>/<site>/<area>/equipment/cipState`` (retained) while CIP runs.
    publish_cip_state: bool = True
    #: Publish every control write result on ``<root>/<site>/<area>/ot/control/audit/<id>``.
    publish_audit: bool = True


class ChangeoverAreaSpec(BaseModel):
    """One MES changeover area and the PLC CIP sequence behind it."""

    model_config = ConfigDict(extra="forbid")

    area: str
    equipment_id: str
    cooker_number: str
    cip_policy: CipPolicy = CipPolicy.EXTERNAL
    auto_start: bool = False
    cip: PlcCipSpec | None = None

    @model_validator(mode="after")
    def _check(self) -> ChangeoverAreaSpec:
        # Validates the area name and the policy value.
        self.to_area_config()
        if self.cip_policy is CipPolicy.RUNNER and self.cip is None:
            msg = f"area '{self.area}': cip_policy 'runner' needs a 'cip' block"
            raise ValueError(msg)
        return self

    def to_area_config(self) -> AreaChangeoverConfig:
        return AreaChangeoverConfig(
            area=self.area,
            equipment_id=self.equipment_id,
            cooker_number=self.cooker_number,
            cip_policy=self.cip_policy,
            auto_start=self.auto_start,
        )


class OTControlConfig(BaseModel):
    """The control runtime document."""

    model_config = ConfigDict(extra="forbid")

    site: str = "whk01"
    topic_root: str = "whk"
    #: Identity recorded on MES writes, PLC writes and audit records.
    requested_by: str = OT_ADAPTER_ID
    #: Adapter id of the MES spoke the changeover commands are written to.
    mes_adapter_id: str = "forge-mes"
    act_on_retained: bool = False
    audit_log: bool = True
    readback_tolerance: float = Field(default=0.001, ge=0)
    mqtt: MqttIngressSettings = Field(default_factory=MqttIngressSettings)
    write_tags: list[TagWriteConfig] = Field(default_factory=list)
    interlocks: list[InterlockRule] = Field(default_factory=list)
    permissions: list[WritePermission] = Field(default_factory=list)
    recipes: list[RecipeWriteConfig] = Field(default_factory=list)
    changeover_areas: list[ChangeoverAreaSpec] = Field(default_factory=list)

    @field_validator("write_tags", "interlocks", "permissions", "recipes", mode="before")
    @classmethod
    def _reject_unknown_keys(cls, items: Any, info: Any) -> Any:
        """pydantic ignores extra keys on stdlib dataclasses; a typo must not pass."""
        allowed = _ALLOWED_KEYS[info.field_name]
        if isinstance(items, list):
            for index, item in enumerate(items):
                if isinstance(item, dict):
                    _check_keys(f"{info.field_name}[{index}]", item, allowed)
                    if info.field_name == "recipes":
                        for j, mapping in enumerate(item.get("mappings") or []):
                            if isinstance(mapping, dict):
                                _check_keys(
                                    f"recipes[{index}].mappings[{j}]",
                                    mapping,
                                    _ALLOWED_KEYS["mappings"],
                                )
        return items

    @model_validator(mode="after")
    def _cross_check(self) -> OTControlConfig:
        problems: list[str] = []
        tag_paths = [t.tag_path for t in self.write_tags]
        problems += _duplicates("write_tags.tag_path", tag_paths)
        problems += _duplicates("interlocks.rule_id", [r.rule_id for r in self.interlocks])
        problems += _duplicates(
            "permissions.permission_id", [p.permission_id for p in self.permissions]
        )
        problems += _duplicates("recipes.equipment_id", [r.equipment_id for r in self.recipes])
        problems += _duplicates("changeover_areas.area", [a.area for a in self.changeover_areas])

        known = set(tag_paths)
        for recipe in self.recipes:
            for mapping in recipe.mappings:
                if mapping.tag_path not in known:
                    problems.append(
                        f"recipes[{recipe.equipment_id}].{mapping.parameter_name}: tag "
                        f"'{mapping.tag_path}' is not in write_tags"
                    )
        equipment = {r.equipment_id for r in self.recipes}
        for spec in self.changeover_areas:
            if spec.equipment_id not in equipment:
                problems.append(
                    f"changeover_areas[{spec.area}]: equipment '{spec.equipment_id}' has no "
                    "recipes entry, so no recipe could ever be downloaded"
                )
            if spec.cip is not None and spec.cip.start_tag not in known:
                problems.append(
                    f"changeover_areas[{spec.area}].cip.start_tag '{spec.cip.start_tag}' "
                    "is not in write_tags"
                )
        if problems:
            raise ValueError("; ".join(problems))
        return self

    # -- derived views --------------------------------------------------------

    def area_configs(self) -> list[AreaChangeoverConfig]:
        return [spec.to_area_config() for spec in self.changeover_areas]

    def cip_specs(self) -> dict[str, PlcCipSpec]:
        return {spec.area: spec.cip for spec in self.changeover_areas if spec.cip is not None}

    def topic(self, area: str, *leaf: str) -> str:
        return "/".join((self.topic_root, self.site, area, *leaf))

    def describe(self) -> dict[str, Any]:
        return {
            "site": self.site,
            "topic_root": self.topic_root,
            "mes_adapter_id": self.mes_adapter_id,
            "mqtt_mode": self.mqtt.mode,
            "write_tags": len(self.write_tags),
            "interlocks": len(self.interlocks),
            "permissions": len(self.permissions),
            "recipes": {r.equipment_id: len(r.mappings) for r in self.recipes},
            "changeover_areas": {
                a.area: {
                    "equipment_id": a.equipment_id,
                    "cip_policy": a.cip_policy.value,
                    "auto_start": a.auto_start,
                }
                for a in self.changeover_areas
            },
        }


_ALLOWED_KEYS: dict[str, frozenset[str]] = {
    "write_tags": frozenset(f.name for f in dataclasses.fields(TagWriteConfig)),
    "interlocks": frozenset(f.name for f in dataclasses.fields(InterlockRule)),
    "permissions": frozenset(f.name for f in dataclasses.fields(WritePermission)),
    "recipes": frozenset(f.name for f in dataclasses.fields(RecipeWriteConfig)),
    "mappings": frozenset(f.name for f in dataclasses.fields(RecipeParameterMapping)),
}


def _check_keys(where: str, item: dict[str, Any], allowed: frozenset[str]) -> None:
    unknown = sorted(set(item) - allowed)
    if unknown:
        msg = f"{where}: unknown key(s) {unknown}; allowed: {sorted(allowed)}"
        raise ValueError(msg)


def _duplicates(what: str, values: list[str]) -> list[str]:
    seen: set[str] = set()
    dupes: list[str] = []
    for value in values:
        if value in seen and value not in dupes:
            dupes.append(value)
        seen.add(value)
    return [f"duplicate {what}: {d!r}" for d in dupes]


def parse_control_config(data: dict[str, Any] | OTControlConfig) -> OTControlConfig:
    """Validate a parsed document (or pass a model through)."""
    if isinstance(data, OTControlConfig):
        return data
    try:
        return OTControlConfig.model_validate(data)
    except ValueError as exc:
        raise ConfigError(str(exc)) from exc


def load_control_config(path: str | Path) -> OTControlConfig:
    """Read and validate a JSON control configuration file."""
    file = Path(path)
    try:
        data = json.loads(file.read_text(encoding="utf-8"))
    except FileNotFoundError:
        msg = f"control config not found: {file}"
        raise ConfigError(msg) from None
    except json.JSONDecodeError as exc:
        msg = f"{file}: invalid JSON at line {exc.lineno}: {exc.msg}"
        raise ConfigError(msg) from exc
    if not isinstance(data, dict):
        msg = f"{file}: expected a JSON object at the top level"
        raise ConfigError(msg)
    try:
        return parse_control_config(data)
    except ConfigError as exc:
        msg = f"{file}: {exc}"
        raise ConfigError(msg) from None
