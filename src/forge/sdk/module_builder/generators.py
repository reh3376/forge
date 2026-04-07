"""Code generators — produce Python source from a manifest dict.

Each generator takes a manifest (dict) and returns a string of Python
source code ready to be written to a file. The generated code follows
the exact patterns proven across 7+ Forge adapters.

Generators:
    generate_config       → config.py (Pydantic model from connection_params)
    generate_adapter      → adapter.py (AdapterBase subclass with lifecycle)
    generate_context      → context.py (RecordContext builder with enrichment hooks)
    generate_record_builder → record_builder.py (ContextualRecord assembler)
    generate_init         → __init__.py (module init with adapter class import)
    generate_facts_spec   → <id>.facts.json (FACTS governance spec scaffold)
    generate_tests        → test_<id>.py (pytest test scaffold)
"""

from __future__ import annotations

import json
from typing import Any

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _to_snake(name: str) -> str:
    """Convert an adapter_id like 'whk-plc' to snake_case 'whk_plc'."""
    return name.replace("-", "_")


def _to_pascal(name: str) -> str:
    """Convert an adapter_id like 'whk-plc' to PascalCase 'WhkPlc'."""
    return "".join(part.capitalize() for part in name.replace("-", "_").split("_"))


def _field_type(param: dict[str, Any]) -> str:
    """Derive a Pydantic field type from a connection_param."""
    name = param["name"].lower()
    default = param.get("default")

    # Type heuristics based on naming conventions
    if any(kw in name for kw in ("port", "timeout", "interval", "ms", "retries")):
        return "int"
    if any(kw in name for kw in ("use_tls", "enabled", "verify")):
        return "bool"

    # If optional (not required), make it str | None
    if not param.get("required", True):
        if default is not None:
            return "str"  # Has a default, so not None
        return "str | None"

    return "str"


def _field_default(param: dict[str, Any], field_type: str) -> str:
    """Generate the Field() default expression."""
    default = param.get("default")
    required = param.get("required", True)

    if required and default is None:
        return "..."  # Required with no default

    if default is not None:
        if field_type == "int":
            return str(int(default))
        if field_type == "bool":
            return str(default).capitalize()
        return f'"{default}"'

    # Optional with no default
    if "None" in field_type:
        return "None"

    return "..."


# ---------------------------------------------------------------------------
# config.py generator
# ---------------------------------------------------------------------------


def generate_config(manifest: dict[str, Any]) -> str:
    """Generate config.py — Pydantic model from manifest connection_params.

    The generated model maps 1:1 to the connection_params declared in
    the manifest. Required params become required fields; optional params
    get defaults. The model is frozen for immutability.
    """
    adapter_id = manifest["adapter_id"]
    snake = _to_snake(adapter_id)
    pascal = _to_pascal(adapter_id)
    params = manifest.get("connection_params", [])

    lines = [
        f'"""Typed configuration for the {manifest["name"]}.', '',
        'Connection parameters are declared in the FACTS spec and validated',
        'by the hub before being passed to configure(). This module provides',
        'a Pydantic model for type-safe access.',
        '"""', '',
        'from __future__ import annotations', '',
        'from pydantic import BaseModel, ConfigDict, Field', '',
        '',
        f'class {pascal}Config(BaseModel):',
        f'    """Connection parameters for the {manifest["name"]}.', '',
        f'    Maps directly to the {len(params)} connection_params in {adapter_id}.facts.json.',
        '    Required params have no default; optional params have sensible defaults.',
        '    """', '',
    ]

    if not params:
        lines.append('    pass  # No connection params declared yet')
    else:
        # Group: required first, then optional
        required = [p for p in params if p.get("required", True)]
        optional = [p for p in params if not p.get("required", True)]

        if required:
            lines.append('    # Required')
            for p in required:
                ftype = _field_type(p)
                fdefault = _field_default(p, ftype)
                desc = p.get("description", p["name"])
                lines.append(f'    {p["name"]}: {ftype} = Field(')
                lines.append(f'        {fdefault},')
                lines.append(f'        description="{desc}",')
                lines.append('    )')

        if optional:
            if required:
                lines.append('')
            lines.append('    # Optional')
            for p in optional:
                ftype = _field_type(p)
                fdefault = _field_default(p, ftype)
                desc = p.get("description", p["name"])

                # Build Field kwargs
                field_kwargs = [f'default={fdefault}']
                field_kwargs.append(f'description="{desc}"')

                # Add constraints for numeric types
                if ftype == "int" and "timeout" in p["name"].lower():
                    field_kwargs.extend(['ge=1_000', 'le=60_000'])

                lines.append(f'    {p["name"]}: {ftype} = Field(')
                for i, kw in enumerate(field_kwargs):
                    comma = ',' if i < len(field_kwargs) - 1 else ','
                    lines.append(f'        {kw}{comma}')
                lines.append('    )')

    lines.extend(['', '    model_config = ConfigDict(frozen=True)', ''])

    return '\n'.join(lines)


# ---------------------------------------------------------------------------
# adapter.py generator
# ---------------------------------------------------------------------------


def generate_adapter(manifest: dict[str, Any]) -> str:
    """Generate adapter.py — AdapterBase subclass with lifecycle methods.

    Determines which capability mixins to inherit based on the manifest,
    generates the manifest loading boilerplate, and provides method stubs
    for all required and optional interfaces.
    """
    adapter_id = manifest["adapter_id"]
    snake = _to_snake(adapter_id)
    pascal = _to_pascal(adapter_id)
    caps = manifest.get("capabilities", {})

    # Determine base classes
    bases = ["AdapterBase"]
    imports_from_base = ["AdapterBase"]
    if caps.get("subscribe"):
        bases.append("SubscriptionProvider")
        imports_from_base.append("SubscriptionProvider")
    if caps.get("write"):
        bases.append("WritableAdapter")
        imports_from_base.append("WritableAdapter")
    if caps.get("backfill"):
        bases.append("BackfillProvider")
        imports_from_base.append("BackfillProvider")
    if caps.get("discover"):
        bases.append("DiscoveryProvider")
        imports_from_base.append("DiscoveryProvider")

    bases_str = ",\n    ".join(bases)
    imports_str = ",\n    ".join(imports_from_base)

    lines = [
        f'"""{manifest["name"]}.',
        '',
        f'Forge adapter for {adapter_id}.',
        '',
        'Data flow:',
        f'    Source → raw dicts → context mapper → ContextualRecord → governance',
        '"""',
        '',
        'from __future__ import annotations',
        '',
        'import json',
        'import logging',
        'from datetime import datetime',
        'from pathlib import Path',
        'from typing import Any',
        '',
        'from forge.adapters.base.interface import (',
        f'    {imports_str},',
        ')',
        f'from forge.adapters.{snake}.config import {pascal}Config',
        f'from forge.adapters.{snake}.context import build_record_context',
        f'from forge.adapters.{snake}.record_builder import build_contextual_record',
        'from forge.core.models.adapter import (',
        '    AdapterCapabilities,',
        '    AdapterHealth,',
        '    AdapterManifest,',
        '    AdapterState,',
        '    AdapterTier,',
        '    ConnectionParam,',
        '    DataContract,',
        ')',
        '',
        'logger = logging.getLogger(__name__)',
        '',
        '# Load manifest from the co-located JSON file',
        '_MANIFEST_PATH = Path(__file__).parent / "manifest.json"',
        '',
        '',
        'def _load_manifest() -> AdapterManifest:',
        '    """Load and parse the adapter manifest from manifest.json."""',
        '    raw = json.loads(_MANIFEST_PATH.read_text())',
        '    return AdapterManifest(',
        '        adapter_id=raw["adapter_id"],',
        '        name=raw["name"],',
        '        version=raw["version"],',
        '        type=raw.get("type", "INGESTION"),',
        '        protocol=raw["protocol"],',
        '        tier=AdapterTier(raw["tier"]),',
        '        capabilities=AdapterCapabilities(**raw.get("capabilities", {})),',
        '        data_contract=DataContract(**raw.get("data_contract", {})),',
        '        health_check_interval_ms=raw.get("health_check_interval_ms", 30_000),',
        '        connection_params=[',
        '            ConnectionParam(**p) for p in raw.get("connection_params", [])',
        '        ],',
        '        auth_methods=raw.get("auth_methods", ["none"]),',
        '        metadata=raw.get("metadata", {}),',
        '    )',
        '',
        '',
        f'class {pascal}Adapter(',
        f'    {bases_str},',
        '):',
        f'    """Forge adapter for {adapter_id}."""',
        '',
        '    manifest: AdapterManifest = _load_manifest()',
        '',
        '    def __init__(self) -> None:',
        '        super().__init__()',
        f'        self._config: {pascal}Config | None = None',
        '        self._consecutive_failures: int = 0',
        '        self._last_healthy: datetime | None = None',
        '',
        '    # ── Lifecycle (AdapterBase) ─────────────────────────────────',
        '',
        '    async def configure(self, params: dict[str, Any]) -> None:',
        '        """Validate and store connection parameters."""',
        f'        self._config = {pascal}Config(**params)',
        '        self._state = AdapterState.REGISTERED',
        '        logger.info(',
        f'            "{adapter_id} adapter configured",',
        '        )',
        '',
        '    async def start(self) -> None:',
        '        """Begin active operation."""',
        '        if self._config is None:',
        '            msg = "Adapter not configured — call configure() first"',
        '            raise RuntimeError(msg)',
        '        self._state = AdapterState.CONNECTING',
        '        # TODO: Establish source system connection',
        '        self._state = AdapterState.HEALTHY',
        '        self._last_healthy = datetime.utcnow()',
        f'        logger.info("{adapter_id} adapter started (state=%s)", self._state)',
        '',
        '    async def stop(self) -> None:',
        '        """Graceful shutdown."""',
        '        # TODO: Close source system connections',
        '        self._state = AdapterState.STOPPED',
        f'        logger.info("{adapter_id} adapter stopped")',
        '',
        '    async def health(self) -> AdapterHealth:',
        '        """Return current health status."""',
        '        return AdapterHealth(',
        '            adapter_id=self.adapter_id,',
        '            state=self._state,',
        '            last_healthy=self._last_healthy,',
        '            records_collected=self._records_collected,',
        '            records_failed=self._records_failed,',
        '        )',
        '',
        '    # ── Core read interface (AdapterBase) ───────────────────────',
        '',
        '    async def collect(self):',
        '        """Yield ContextualRecords from the source system.',
        '',
        '        TODO: Implement source-specific data collection logic.',
        '        The pattern below processes pre-loaded records for testing.',
        '        """',
        '        for raw_event in self._pending_records:',
        '            try:',
        '                context = build_record_context(raw_event)',
        '                record = build_contextual_record(',
        '                    raw_event=raw_event,',
        '                    context=context,',
        '                    adapter_id=self.adapter_id,',
        '                    adapter_version=self.manifest.version,',
        '                )',
        '                self._records_collected += 1',
        '                yield record',
        '            except Exception:',
        '                self._records_failed += 1',
        f'                logger.exception("Failed to map {adapter_id} event")',
        '',
        '    def inject_records(self, records: list[dict[str, Any]]) -> None:',
        '        """Inject raw data for testing/static collection."""',
        '        self._injected_records = list(records)',
        '',
        '    @property',
        '    def _pending_records(self) -> list[dict[str, Any]]:',
        '        return getattr(self, "_injected_records", [])',
        '',
    ]

    # Add capability method stubs
    if caps.get("subscribe"):
        lines.extend([
            '    # ── SubscriptionProvider ────────────────────────────────────',
            '',
            '    async def subscribe(',
            '        self,',
            '        tags: list[str],',
            '        callback: Any,',
            '    ) -> str:',
            f'        """Subscribe to {adapter_id} event streams."""',
            '        import uuid',
            '        sub_id = str(uuid.uuid4())',
            '        # TODO: Bind to source system subscriptions',
            f'        logger.info("{adapter_id} subscription %s: tags=%s", sub_id, tags)',
            '        return sub_id',
            '',
            '    async def unsubscribe(self, subscription_id: str) -> None:',
            '        """Cancel a subscription."""',
            '        # TODO: Unbind from source system',
            '',
        ])

    if caps.get("write"):
        lines.extend([
            '    # ── WritableAdapter ────────────────────────────────────────',
            '',
            '    async def write(',
            '        self,',
            '        tag_path: str,',
            '        value: Any,',
            '        *,',
            '        confirm: bool = True,',
            '    ) -> bool:',
            f'        """Write a value to {adapter_id}."""',
            '        # TODO: Implement write-back to source system',
            '        return False',
            '',
        ])

    if caps.get("backfill"):
        lines.extend([
            '    # ── BackfillProvider ────────────────────────────────────────',
            '',
            '    async def backfill(',
            '        self,',
            '        tags: list[str],',
            '        start: datetime,',
            '        end: datetime,',
            '        *,',
            '        max_records: int | None = None,',
            '    ):',
            f'        """Retrieve historical {adapter_id} data."""',
            '        # TODO: Query source system for historical records',
            '        return',
            '        yield',
            '',
            '    async def get_earliest_timestamp(self, tag: str) -> datetime | None:',
            '        """Return earliest available timestamp for a tag."""',
            '        # TODO: Query source system',
            '        return None',
            '',
        ])

    if caps.get("discover"):
        lines.extend([
            '    # ── DiscoveryProvider ───────────────────────────────────────',
            '',
            '    async def discover(self) -> list[dict[str, Any]]:',
            f'        """Enumerate available {adapter_id} data sources."""',
            '        # TODO: Introspect source system schema/endpoints',
            '        return [',
            '            {',
            f'                "tag_path": "{snake}.default",',
            '                "data_type": "entity",',
            f'                "description": "Default {adapter_id} data source",',
            '            },',
            '        ]',
            '',
        ])

    return '\n'.join(lines)


# ---------------------------------------------------------------------------
# context.py generator
# ---------------------------------------------------------------------------


def generate_context(manifest: dict[str, Any]) -> str:
    """Generate context.py — RecordContext builder with enrichment hooks."""
    adapter_id = manifest["adapter_id"]
    context_fields = manifest.get("data_contract", {}).get("context_fields", [])

    lines = [
        f'"""{adapter_id} context mapper — transforms raw events into RecordContext.',
        '',
        'Implements the context field mappings defined in the FACTS spec.',
        '',
        'Context fields:',
    ]
    for f in context_fields:
        lines.append(f'    {f}')
    lines.extend([
        '"""',
        '',
        'from __future__ import annotations',
        '',
        'import logging',
        'from typing import Any',
        '',
        'from forge.core.models.contextual_record import RecordContext',
        '',
        'logger = logging.getLogger(__name__)',
        '',
        '',
        'def build_record_context(',
        '    raw_event: dict[str, Any],',
        ') -> RecordContext:',
        f'    """Build a RecordContext from a raw {adapter_id} event dict.',
        '',
        '    Args:',
        '        raw_event: Raw dict from the source system.',
        '',
        '    Returns:',
        '        RecordContext with all available context fields populated.',
        '    """',
    ])

    # Generate field extraction for each context field
    lines.append('    # ── Direct field mappings ─────────────────────────────')
    for field in context_fields:
        camel = _snake_to_camel(field)
        lines.append(f'    {field} = (')
        lines.append(f'        raw_event.get("{field}")')
        lines.append(f'        or raw_event.get("{camel}")')
        lines.append('    )')

    # Build extra dict for FACTS-specific fields
    lines.extend([
        '',
        '    # ── Extra context fields (FACTS-specific) ──────────────',
        '    extra: dict[str, Any] = {}',
    ])
    for field in context_fields:
        if field not in ("equipment_id", "area", "site", "batch_id", "lot_id",
                         "recipe_id", "operating_mode", "shift", "operator_id"):
            lines.append(f'    if {field}:')
            lines.append(f'        extra["{field}"] = {field}')

    # Build return with known RecordContext fields
    known_rc_fields = {
        "equipment_id", "area", "site", "batch_id", "lot_id",
        "recipe_id", "operating_mode", "shift", "operator_id",
    }
    used_fields = [f for f in context_fields if f in known_rc_fields]
    unused_fields = [f for f in context_fields if f not in known_rc_fields]

    lines.extend([
        '',
        '    return RecordContext(',
    ])
    for field in used_fields:
        lines.append(f'        {field}={field},')
    lines.append('        extra=extra,')
    lines.append('    )')
    lines.append('')

    return '\n'.join(lines)


def _snake_to_camel(name: str) -> str:
    """Convert snake_case to camelCase."""
    parts = name.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


# ---------------------------------------------------------------------------
# record_builder.py generator
# ---------------------------------------------------------------------------


def generate_record_builder(manifest: dict[str, Any]) -> str:
    """Generate record_builder.py — ContextualRecord assembler."""
    adapter_id = manifest["adapter_id"]
    snake = _to_snake(adapter_id)
    schema_ref = manifest.get("data_contract", {}).get("schema_ref", f"forge://schemas/{adapter_id}/v0.1.0")

    return f'''"""Record builder — assembles ContextualRecords from mapped {adapter_id} data.

Data flow:
    raw dict → context mapper → RecordContext
    (raw dict, RecordContext) → record_builder → ContextualRecord
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)

logger = logging.getLogger(__name__)

_SCHEMA_REF = "{schema_ref}"


def build_contextual_record(
    *,
    raw_event: dict[str, Any],
    context: RecordContext,
    adapter_id: str,
    adapter_version: str,
) -> ContextualRecord:
    """Assemble a ContextualRecord from a raw event and its context.

    Args:
        raw_event: Original raw dict from the source system.
        context: RecordContext produced by build_record_context().
        adapter_id: Adapter identity string (e.g. "{adapter_id}").
        adapter_version: Adapter version (e.g. "0.1.0").

    Returns:
        A fully-formed ContextualRecord ready for the governance pipeline.
    """
    # ── Timestamps ─────────────────────────────────────────────
    source_time = _extract_source_time(raw_event)
    now = datetime.now(tz=timezone.utc)
    timestamp = RecordTimestamp(
        source_time=source_time or now,
        server_time=_extract_server_time(raw_event),
        ingestion_time=now,
    )

    # ── Value ──────────────────────────────────────────────────
    value = RecordValue(
        raw=raw_event,
        data_type="object",
        quality=_assess_quality(raw_event),
    )

    # ── Source ─────────────────────────────────────────────────
    tag_path = _derive_tag_path(raw_event)
    source = RecordSource(
        adapter_id=adapter_id,
        system="{adapter_id}",
        tag_path=tag_path,
    )

    # ── Lineage ────────────────────────────────────────────────
    lineage = RecordLineage(
        schema_ref=_SCHEMA_REF,
        adapter_id=adapter_id,
        adapter_version=adapter_version,
    )

    return ContextualRecord(
        source=source,
        timestamp=timestamp,
        value=value,
        context=context,
        lineage=lineage,
    )


def _extract_source_time(raw: dict[str, Any]) -> datetime | None:
    """Extract the original event timestamp from the raw data."""
    for key in ("event_timestamp", "timestamp", "created_at"):
        val = raw.get(key)
        if val is None:
            continue
        if isinstance(val, datetime):
            return val
        if isinstance(val, str):
            try:
                return datetime.fromisoformat(val.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                continue
    return None


def _extract_server_time(raw: dict[str, Any]) -> datetime | None:
    """Extract the server processing timestamp if present."""
    for key in ("server_time", "processed_at", "updated_at"):
        val = raw.get(key)
        if val is None:
            continue
        if isinstance(val, datetime):
            return val
        if isinstance(val, str):
            try:
                return datetime.fromisoformat(val.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                continue
    return None


def _assess_quality(raw: dict[str, Any]) -> QualityCode:
    """Assess data quality from available signals in the raw event."""
    if raw.get("error") or raw.get("is_error"):
        return QualityCode.BAD

    has_id = bool(
        raw.get("id")
        or raw.get("equipment_id")
        or raw.get("entity_id")
    )
    has_time = bool(
        raw.get("event_timestamp")
        or raw.get("timestamp")
        or raw.get("created_at")
    )

    if has_id and has_time:
        return QualityCode.GOOD
    if has_id or has_time:
        return QualityCode.UNCERTAIN
    return QualityCode.NOT_AVAILABLE


def _derive_tag_path(raw: dict[str, Any]) -> str | None:
    """Derive a tag path from the raw event for source identification."""
    source_type = raw.get("source_type", "default")
    entity = raw.get("entity_type") or raw.get("record_name") or "event"
    return f"{snake}.{{source_type}}.{{entity}}".lower()
'''


# ---------------------------------------------------------------------------
# __init__.py generator
# ---------------------------------------------------------------------------


def generate_init(manifest: dict[str, Any]) -> str:
    """Generate __init__.py — module init with adapter class export."""
    adapter_id = manifest["adapter_id"]
    snake = _to_snake(adapter_id)
    pascal = _to_pascal(adapter_id)

    return f'"""{manifest["name"]}."""\n\nfrom forge.adapters.{snake}.adapter import {pascal}Adapter\n\n__all__ = ["{pascal}Adapter"]\n'


# ---------------------------------------------------------------------------
# FACTS spec generator
# ---------------------------------------------------------------------------


def generate_facts_spec(manifest: dict[str, Any]) -> str:
    """Generate a FACTS governance spec scaffold from the manifest."""
    adapter_id = manifest["adapter_id"]
    caps = manifest.get("capabilities", {})
    params = manifest.get("connection_params", [])
    context_fields = manifest.get("data_contract", {}).get("context_fields", [])

    # Build state transitions based on capabilities
    transitions = [
        {"from": "REGISTERED", "to": "CONNECTING", "trigger": "start() called"},
        {"from": "CONNECTING", "to": "HEALTHY", "trigger": "Source system connection established"},
        {"from": "CONNECTING", "to": "FAILED", "trigger": "startup_timeout_ms exceeded"},
        {"from": "HEALTHY", "to": "DEGRADED", "trigger": "Health check fails 3 consecutive times"},
        {"from": "DEGRADED", "to": "HEALTHY", "trigger": "Health check passes"},
        {"from": "DEGRADED", "to": "FAILED", "trigger": "Failures exceed threshold"},
        {"from": "FAILED", "to": "CONNECTING", "trigger": "restart_policy triggers reconnection"},
        {"from": "HEALTHY", "to": "STOPPED", "trigger": "stop() called"},
        {"from": "DEGRADED", "to": "STOPPED", "trigger": "stop() called"},
    ]

    # Build connection params for spec
    spec_params = []
    for p in params:
        sp: dict[str, Any] = {
            "name": p["name"],
            "type": "string",
            "required": p.get("required", True),
            "secret": p.get("secret", False),
            "description": p.get("description", ""),
        }
        if "default" in p:
            sp["default"] = p["default"]
        spec_params.append(sp)

    # Build context mapping
    context_mapping = {
        "mandatory_fields": context_fields[:6] if len(context_fields) > 6 else context_fields,
        "optional_fields": context_fields[6:] if len(context_fields) > 6 else [],
        "enrichment_rules": [
            {
                "rule": "TODO: Define enrichment rules",
                "description": "Add domain-specific enrichment logic",
            },
        ],
    }

    spec = {
        "spec_version": "0.1.0",
        "adapter_identity": {
            "adapter_id": adapter_id,
            "name": manifest["name"],
            "version": manifest["version"],
            "type": manifest.get("type", "INGESTION"),
            "tier": manifest["tier"],
            "protocol": manifest["protocol"],
        },
        "capabilities": dict(caps),
        "lifecycle": {
            "startup_timeout_ms": 30000,
            "shutdown_timeout_ms": 15000,
            "health_check_interval_ms": manifest.get("health_check_interval_ms", 30000),
            "restart_policy": "on_failure",
            "state_transitions": transitions,
        },
        "connection_params": spec_params,
        "data_contract": {
            "schema_ref": manifest.get("data_contract", {}).get("schema_ref", ""),
            "output_format": "contextual_record",
            "context_mapping": context_mapping,
        },
        "auth": {
            "methods": manifest.get("auth_methods", ["none"]),
        },
        "integrity": {
            "spec_hash": "",
            "hash_state": "draft",
            "approved_by": [],
            "change_history": [],
        },
    }

    return json.dumps(spec, indent=2) + "\n"


# ---------------------------------------------------------------------------
# test scaffold generator
# ---------------------------------------------------------------------------


def generate_tests(manifest: dict[str, Any]) -> str:
    """Generate a pytest test scaffold for the adapter."""
    adapter_id = manifest["adapter_id"]
    snake = _to_snake(adapter_id)
    pascal = _to_pascal(adapter_id)
    caps = manifest.get("capabilities", {})
    params = manifest.get("connection_params", [])

    # Build a minimal config dict for tests
    config_pairs = []
    for p in params:
        default = p.get("default")
        if default is not None:
            continue  # Skip params with defaults
        name = p["name"]
        if p.get("secret"):
            config_pairs.append(f'    "{name}": "test-secret"')
        elif "url" in name.lower():
            config_pairs.append(f'    "{name}": "http://localhost:9999"')
        elif "host" in name.lower():
            config_pairs.append(f'    "{name}": "localhost"')
        elif "port" in name.lower():
            config_pairs.append(f'    "{name}": 9999')
        elif "id" in name.lower():
            config_pairs.append(f'    "{name}": "test-id"')
        else:
            config_pairs.append(f'    "{name}": "test-value"')

    config_dict = "{\n" + ",\n".join(config_pairs) + "\n}" if config_pairs else "{}"

    lines = [
        f'"""Tests for the {manifest["name"]}.',
        '',
        'Validates:',
        '    1. Manifest loading and structure',
        '    2. Configuration validation',
        '    3. Lifecycle (configure → start → stop)',
        '    4. Record collection pipeline',
        f'    5. Capability-specific interfaces{" (subscribe, backfill, discover)" if any(caps.get(c) for c in ("subscribe", "backfill", "discover")) else ""}',
        '"""',
        '',
        'from __future__ import annotations',
        '',
        'import pytest',
        '',
        f'from forge.adapters.{snake}.adapter import {pascal}Adapter',
        f'from forge.adapters.{snake}.config import {pascal}Config',
        f'from forge.adapters.{snake}.context import build_record_context',
        f'from forge.adapters.{snake}.record_builder import build_contextual_record',
        'from forge.core.models.adapter import AdapterState',
        '',
        '',
        '# ---------------------------------------------------------------------------',
        '# Test configuration',
        '# ---------------------------------------------------------------------------',
        '',
        f'_TEST_CONFIG = {config_dict}',
        '',
        '',
        '# ---------------------------------------------------------------------------',
        '# Manifest Tests',
        '# ---------------------------------------------------------------------------',
        '',
        '',
        f'class Test{pascal}Manifest:',
        '    def test_manifest_loads(self):',
        f'        adapter = {pascal}Adapter()',
        '        assert adapter.manifest is not None',
        f'        assert adapter.manifest.adapter_id == "{adapter_id}"',
        '',
        '    def test_manifest_capabilities(self):',
        f'        adapter = {pascal}Adapter()',
        '        caps = adapter.manifest.capabilities',
        f'        assert caps.read is {caps.get("read", True)}',
        f'        assert caps.write is {caps.get("write", False)}',
        '',
        '',
        '# ---------------------------------------------------------------------------',
        '# Config Tests',
        '# ---------------------------------------------------------------------------',
        '',
        '',
        f'class Test{pascal}Config:',
        '    def test_valid_config(self):',
        f'        config = {pascal}Config(**_TEST_CONFIG)',
        '        assert config is not None',
        '',
        '    def test_config_is_frozen(self):',
        f'        config = {pascal}Config(**_TEST_CONFIG)',
        '        with pytest.raises(Exception):',
        '            config.__dict__["_frozen"] = False  # type: ignore[attr-defined]',
        '',
        '',
        '# ---------------------------------------------------------------------------',
        '# Lifecycle Tests',
        '# ---------------------------------------------------------------------------',
        '',
        '',
        f'class Test{pascal}Lifecycle:',
        '    @pytest.mark.asyncio',
        '    async def test_configure(self):',
        f'        adapter = {pascal}Adapter()',
        '        await adapter.configure(_TEST_CONFIG)',
        '        assert adapter.state == AdapterState.REGISTERED',
        '',
        '    @pytest.mark.asyncio',
        '    async def test_start_stop(self):',
        f'        adapter = {pascal}Adapter()',
        '        await adapter.configure(_TEST_CONFIG)',
        '        await adapter.start()',
        '        assert adapter.state == AdapterState.HEALTHY',
        '        await adapter.stop()',
        '        assert adapter.state == AdapterState.STOPPED',
        '',
        '    @pytest.mark.asyncio',
        '    async def test_start_without_configure_raises(self):',
        f'        adapter = {pascal}Adapter()',
        '        with pytest.raises(RuntimeError):',
        '            await adapter.start()',
        '',
        '    @pytest.mark.asyncio',
        '    async def test_health(self):',
        f'        adapter = {pascal}Adapter()',
        '        await adapter.configure(_TEST_CONFIG)',
        '        await adapter.start()',
        '        health = await adapter.health()',
        f'        assert health.adapter_id == "{adapter_id}"',
        '        assert health.state == AdapterState.HEALTHY',
        '',
        '',
        '# ---------------------------------------------------------------------------',
        '# Record Collection Tests',
        '# ---------------------------------------------------------------------------',
        '',
        '',
        f'class Test{pascal}Collection:',
        '    @pytest.mark.asyncio',
        '    async def test_collect_empty(self):',
        f'        adapter = {pascal}Adapter()',
        '        await adapter.configure(_TEST_CONFIG)',
        '        await adapter.start()',
        '        records = [r async for r in adapter.collect()]',
        '        assert records == []',
        '',
        '    @pytest.mark.asyncio',
        '    async def test_collect_with_injected_records(self):',
        f'        adapter = {pascal}Adapter()',
        '        await adapter.configure(_TEST_CONFIG)',
        '        await adapter.start()',
        '        adapter.inject_records([',
        '            {"id": "test-1", "timestamp": "2026-01-01T00:00:00Z"},',
        '            {"id": "test-2", "timestamp": "2026-01-01T01:00:00Z"},',
        '        ])',
        '        records = [r async for r in adapter.collect()]',
        '        assert len(records) == 2',
        '',
        '    @pytest.mark.asyncio',
        '    async def test_collect_updates_counters(self):',
        f'        adapter = {pascal}Adapter()',
        '        await adapter.configure(_TEST_CONFIG)',
        '        await adapter.start()',
        '        adapter.inject_records([{"id": "r1", "timestamp": "2026-01-01T00:00:00Z"}])',
        '        _ = [r async for r in adapter.collect()]',
        '        health = await adapter.health()',
        '        assert health.records_collected >= 1',
        '',
        '',
        '# ---------------------------------------------------------------------------',
        '# Context and Record Builder Tests',
        '# ---------------------------------------------------------------------------',
        '',
        '',
        f'class Test{pascal}ContextBuilder:',
        '    def test_build_context_minimal(self):',
        '        ctx = build_record_context({"id": "test"})',
        '        assert ctx is not None',
        '',
        '    def test_build_context_with_fields(self):',
        '        raw = {',
        '            "id": "test",',
        '            "equipment_id": "EQ-001",',
        '            "timestamp": "2026-01-01T00:00:00Z",',
        '        }',
        '        ctx = build_record_context(raw)',
        '        assert ctx.equipment_id == "EQ-001"',
        '',
        '',
        f'class Test{pascal}RecordBuilder:',
        '    def test_build_record(self):',
        '        raw = {"id": "test", "timestamp": "2026-01-01T00:00:00Z"}',
        '        ctx = build_record_context(raw)',
        '        record = build_contextual_record(',
        '            raw_event=raw,',
        '            context=ctx,',
        f'            adapter_id="{adapter_id}",',
        '            adapter_version="0.1.0",',
        '        )',
        '        assert record is not None',
        f'        assert record.source.adapter_id == "{adapter_id}"',
        '        assert record.lineage.adapter_version == "0.1.0"',
        '',
    ]

    return '\n'.join(lines)
