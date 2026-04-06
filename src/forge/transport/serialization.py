# ruff: noqa: UP017
"""Pydantic ↔ Protobuf serialization utilities.

Converts between Forge Pydantic models and proto-compatible dicts that
mirror the Protobuf wire format. When compiled proto stubs are available,
these dicts can be passed directly to proto message constructors.

Design principles:
  1. Round-trip fidelity: pydantic → proto → pydantic must be lossless
  2. Type preservation: RecordValue.raw uses typed variants, not JSON-everything
  3. Timestamp normalization: Python datetime ↔ {seconds, nanos} dict
  4. Enum mapping: Python StrEnum ↔ proto enum int values
  5. Testable without protoc: works with plain dicts until stubs are generated

Usage:
    from forge.transport.serialization import pydantic_to_proto, proto_to_pydantic

    record = ContextualRecord(...)
    proto_dict = pydantic_to_proto(record)     # → dict ready for proto constructor
    restored = proto_to_pydantic(proto_dict)   # → ContextualRecord
    assert record == restored
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from forge.core.models.adapter import (
    AdapterCapabilities,
    AdapterHealth,
    AdapterManifest,
    AdapterState,
    AdapterTier,
    ConnectionParam,
    DataContract,
)
from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)

# ---------------------------------------------------------------------------
# Enum ↔ int mappings (mirror proto enum numbering from enums.proto)
# ---------------------------------------------------------------------------

_QUALITY_CODE_TO_INT: dict[str, int] = {
    "GOOD": 1,
    "UNCERTAIN": 2,
    "BAD": 3,
    "NOT_AVAILABLE": 4,
}
_INT_TO_QUALITY_CODE: dict[int, str] = {v: k for k, v in _QUALITY_CODE_TO_INT.items()}

_ADAPTER_STATE_TO_INT: dict[str, int] = {
    "REGISTERED": 1,
    "CONNECTING": 2,
    "HEALTHY": 3,
    "DEGRADED": 4,
    "FAILED": 5,
    "STOPPED": 6,
}
_INT_TO_ADAPTER_STATE: dict[int, str] = {
    v: k for k, v in _ADAPTER_STATE_TO_INT.items()
}

_ADAPTER_TIER_TO_INT: dict[str, int] = {
    "OT": 1,
    "MES_MOM": 2,
    "ERP_BUSINESS": 3,
    "HISTORIAN": 4,
    "DOCUMENT": 5,
}
_INT_TO_ADAPTER_TIER: dict[int, str] = {
    v: k for k, v in _ADAPTER_TIER_TO_INT.items()
}


# ---------------------------------------------------------------------------
# Timestamp conversion
# ---------------------------------------------------------------------------


def _datetime_to_proto(dt: datetime | None) -> dict[str, int] | None:
    """Convert Python datetime to proto Timestamp dict {seconds, nanos}."""
    if dt is None:
        return None
    # Ensure timezone-aware (assume UTC if naive)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    ts = dt.timestamp()
    seconds = int(ts)
    nanos = int((ts - seconds) * 1_000_000_000)
    return {"seconds": seconds, "nanos": nanos}


def _proto_to_datetime(proto_ts: dict[str, int] | None) -> datetime | None:
    """Convert proto Timestamp dict {seconds, nanos} to Python datetime."""
    if proto_ts is None:
        return None
    seconds = proto_ts.get("seconds", 0)
    nanos = proto_ts.get("nanos", 0)
    return datetime.fromtimestamp(seconds + nanos / 1_000_000_000, tz=timezone.utc)


# ---------------------------------------------------------------------------
# RecordValue.raw ↔ oneof typed_value
# ---------------------------------------------------------------------------


def _raw_to_typed_value(raw: Any) -> dict[str, Any]:
    """Convert Python raw value to proto oneof typed_value dict.

    Returns a dict with exactly one key matching a oneof variant:
      number_value, integer_value, string_value, bool_value,
      bytes_value, or json_value.
    """
    if raw is None:
        # Proto oneof with no field set represents None
        return {}
    if isinstance(raw, bool):
        # Must check bool BEFORE int (bool is subclass of int in Python)
        return {"bool_value": raw}
    if isinstance(raw, int):
        return {"integer_value": raw}
    if isinstance(raw, float):
        if math.isnan(raw) or math.isinf(raw):
            # NaN/Inf can't round-trip through proto double reliably
            return {"string_value": str(raw)}
        return {"number_value": raw}
    if isinstance(raw, str):
        return {"string_value": raw}
    if isinstance(raw, bytes):
        return {"bytes_value": raw}
    if isinstance(raw, (dict, list)):
        return {"json_value": json.dumps(raw, default=str)}
    # Fallback: JSON-encode anything else
    return {"json_value": json.dumps(raw, default=str)}


def _typed_value_to_raw(typed: dict[str, Any]) -> Any:
    """Convert proto oneof typed_value dict back to Python raw value."""
    if "number_value" in typed:
        return typed["number_value"]
    if "integer_value" in typed:
        return typed["integer_value"]
    if "string_value" in typed:
        return typed["string_value"]
    if "bool_value" in typed:
        return typed["bool_value"]
    if "bytes_value" in typed:
        return typed["bytes_value"]
    if "json_value" in typed:
        return json.loads(typed["json_value"])
    return None


# ---------------------------------------------------------------------------
# Pydantic → Proto dict converters
# ---------------------------------------------------------------------------


def _record_source_to_proto(source: RecordSource) -> dict[str, Any]:
    return {
        "adapter_id": source.adapter_id,
        "system": source.system,
        "tag_path": source.tag_path or "",
        "connection_id": source.connection_id or "",
    }


def _record_timestamp_to_proto(ts: RecordTimestamp) -> dict[str, Any]:
    result: dict[str, Any] = {
        "source_time": _datetime_to_proto(ts.source_time),
        "ingestion_time": _datetime_to_proto(ts.ingestion_time),
    }
    if ts.server_time is not None:
        result["server_time"] = _datetime_to_proto(ts.server_time)
    return result


def _record_value_to_proto(value: RecordValue) -> dict[str, Any]:
    result = _raw_to_typed_value(value.raw)
    result["engineering_units"] = value.engineering_units or ""
    result["quality"] = _QUALITY_CODE_TO_INT.get(value.quality.value, 0)
    result["data_type"] = value.data_type
    return result


def _record_context_to_proto(ctx: RecordContext) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for field in (
        "equipment_id", "area", "site", "batch_id", "lot_id",
        "recipe_id", "operating_mode", "shift", "operator_id",
    ):
        val = getattr(ctx, field, None)
        result[field] = val or ""
    # extra → map<string, string>: complex values JSON-encoded
    extra_map: dict[str, str] = {}
    for k, v in ctx.extra.items():
        extra_map[k] = v if isinstance(v, str) else json.dumps(v, default=str)
    result["extra"] = extra_map
    return result


def _record_lineage_to_proto(lineage: RecordLineage) -> dict[str, Any]:
    return {
        "schema_ref": lineage.schema_ref,
        "adapter_id": lineage.adapter_id,
        "adapter_version": lineage.adapter_version,
        "transformation_chain": list(lineage.transformation_chain),
    }


def _contextual_record_to_proto(record: ContextualRecord) -> dict[str, Any]:
    """Convert a ContextualRecord to a proto-compatible dict."""
    return {
        "record_id": str(record.record_id),
        "source": _record_source_to_proto(record.source),
        "timestamp": _record_timestamp_to_proto(record.timestamp),
        "value": _record_value_to_proto(record.value),
        "context": _record_context_to_proto(record.context),
        "lineage": _record_lineage_to_proto(record.lineage),
    }


# ---------------------------------------------------------------------------
# Adapter models → Proto dict converters
# ---------------------------------------------------------------------------


def _capabilities_to_proto(caps: AdapterCapabilities) -> dict[str, bool]:
    return {
        "read": caps.read,
        "write": caps.write,
        "subscribe": caps.subscribe,
        "backfill": caps.backfill,
        "discover": caps.discover,
    }


def _connection_param_to_proto(param: ConnectionParam) -> dict[str, Any]:
    return {
        "name": param.name,
        "description": param.description or "",
        "required": param.required,
        "secret": param.secret,
        "default_value": param.default or "",
    }


def _data_contract_to_proto(contract: DataContract) -> dict[str, Any]:
    return {
        "schema_ref": contract.schema_ref,
        "output_format": contract.output_format,
        "context_fields": list(contract.context_fields),
    }


def _manifest_to_proto(manifest: AdapterManifest) -> dict[str, Any]:
    return {
        "adapter_id": manifest.adapter_id,
        "name": manifest.name,
        "version": manifest.version,
        "type": manifest.type,
        "protocol": manifest.protocol,
        "tier": _ADAPTER_TIER_TO_INT.get(manifest.tier.value, 0),
        "capabilities": _capabilities_to_proto(manifest.capabilities),
        "data_contract": _data_contract_to_proto(manifest.data_contract),
        "health_check_interval_ms": manifest.health_check_interval_ms,
        "connection_params": [
            _connection_param_to_proto(p) for p in manifest.connection_params
        ],
        "auth_methods": list(manifest.auth_methods),
        "metadata": manifest.metadata,
    }


def _health_to_proto(health: AdapterHealth) -> dict[str, Any]:
    return {
        "adapter_id": health.adapter_id,
        "state": _ADAPTER_STATE_TO_INT.get(health.state.value, 0),
        "last_check": _datetime_to_proto(health.last_check),
        "last_healthy": _datetime_to_proto(health.last_healthy),
        "error_message": health.error_message or "",
        "records_collected": health.records_collected,
        "records_failed": health.records_failed,
        "uptime_seconds": health.uptime_seconds,
    }


# ---------------------------------------------------------------------------
# Proto dict → Pydantic converters
# ---------------------------------------------------------------------------


def _proto_to_record_source(d: dict[str, Any]) -> RecordSource:
    return RecordSource(
        adapter_id=d["adapter_id"],
        system=d["system"],
        tag_path=d.get("tag_path") or None,
        connection_id=d.get("connection_id") or None,
    )


def _proto_to_record_timestamp(d: dict[str, Any]) -> RecordTimestamp:
    return RecordTimestamp(
        source_time=_proto_to_datetime(d["source_time"]),
        server_time=_proto_to_datetime(d.get("server_time")),
        ingestion_time=_proto_to_datetime(d.get("ingestion_time")),
    )


def _proto_to_record_value(d: dict[str, Any]) -> RecordValue:
    # Extract the oneof typed_value
    typed_keys = {
        "number_value", "integer_value", "string_value",
        "bool_value", "bytes_value", "json_value",
    }
    typed = {k: v for k, v in d.items() if k in typed_keys}
    raw = _typed_value_to_raw(typed)

    quality_int = d.get("quality", 1)
    quality_str = _INT_TO_QUALITY_CODE.get(quality_int, "GOOD")

    return RecordValue(
        raw=raw,
        engineering_units=d.get("engineering_units") or None,
        quality=QualityCode(quality_str),
        data_type=d.get("data_type", "string"),
    )


def _proto_to_record_context(d: dict[str, Any]) -> RecordContext:
    extra_raw = d.get("extra", {})
    # Try to JSON-decode extra values
    extra: dict[str, Any] = {}
    for k, v in extra_raw.items():
        if isinstance(v, str):
            try:
                extra[k] = json.loads(v)
            except (json.JSONDecodeError, ValueError):
                extra[k] = v
        else:
            extra[k] = v

    return RecordContext(
        equipment_id=d.get("equipment_id") or None,
        area=d.get("area") or None,
        site=d.get("site") or None,
        batch_id=d.get("batch_id") or None,
        lot_id=d.get("lot_id") or None,
        recipe_id=d.get("recipe_id") or None,
        operating_mode=d.get("operating_mode") or None,
        shift=d.get("shift") or None,
        operator_id=d.get("operator_id") or None,
        extra=extra,
    )


def _proto_to_record_lineage(d: dict[str, Any]) -> RecordLineage:
    return RecordLineage(
        schema_ref=d["schema_ref"],
        adapter_id=d["adapter_id"],
        adapter_version=d["adapter_version"],
        transformation_chain=list(d.get("transformation_chain", [])),
    )


def _proto_to_contextual_record(d: dict[str, Any]) -> ContextualRecord:
    """Convert a proto-compatible dict back to a ContextualRecord."""
    return ContextualRecord(
        record_id=UUID(d["record_id"]),
        source=_proto_to_record_source(d["source"]),
        timestamp=_proto_to_record_timestamp(d["timestamp"]),
        value=_proto_to_record_value(d["value"]),
        context=_proto_to_record_context(d.get("context", {})),
        lineage=_proto_to_record_lineage(d["lineage"]),
    )


def _proto_to_capabilities(d: dict[str, Any]) -> AdapterCapabilities:
    return AdapterCapabilities(
        read=d.get("read", True),
        write=d.get("write", False),
        subscribe=d.get("subscribe", False),
        backfill=d.get("backfill", False),
        discover=d.get("discover", False),
    )


def _proto_to_connection_param(d: dict[str, Any]) -> ConnectionParam:
    return ConnectionParam(
        name=d["name"],
        description=d.get("description") or None,
        required=d.get("required", True),
        secret=d.get("secret", False),
        default=d.get("default_value") or None,
    )


def _proto_to_data_contract(d: dict[str, Any]) -> DataContract:
    return DataContract(
        schema_ref=d["schema_ref"],
        output_format=d.get("output_format", "contextual_record"),
        context_fields=list(d.get("context_fields", [])),
    )


def _proto_to_manifest(d: dict[str, Any]) -> AdapterManifest:
    tier_int = d.get("tier", 0)
    tier_str = _INT_TO_ADAPTER_TIER.get(tier_int, "OT")

    return AdapterManifest(
        adapter_id=d["adapter_id"],
        name=d["name"],
        version=d["version"],
        type=d.get("type", "INGESTION"),
        protocol=d["protocol"],
        tier=AdapterTier(tier_str),
        capabilities=_proto_to_capabilities(d.get("capabilities", {})),
        data_contract=_proto_to_data_contract(d["data_contract"]),
        health_check_interval_ms=d.get("health_check_interval_ms", 5000),
        connection_params=[
            _proto_to_connection_param(p)
            for p in d.get("connection_params", [])
        ],
        auth_methods=list(d.get("auth_methods", ["none"])),
        metadata=d.get("metadata", {}),
    )


def _proto_to_health(d: dict[str, Any]) -> AdapterHealth:
    state_int = d.get("state", 0)
    state_str = _INT_TO_ADAPTER_STATE.get(state_int, "REGISTERED")

    return AdapterHealth(
        adapter_id=d["adapter_id"],
        state=AdapterState(state_str),
        last_check=_proto_to_datetime(d.get("last_check")),
        last_healthy=_proto_to_datetime(d.get("last_healthy")),
        error_message=d.get("error_message") or None,
        records_collected=d.get("records_collected", 0),
        records_failed=d.get("records_failed", 0),
        uptime_seconds=d.get("uptime_seconds", 0.0),
    )


# ---------------------------------------------------------------------------
# Public API — generic dispatchers
# ---------------------------------------------------------------------------

# Type registry for pydantic_to_proto
_PYDANTIC_TO_PROTO = {
    ContextualRecord: _contextual_record_to_proto,
    AdapterManifest: _manifest_to_proto,
    AdapterHealth: _health_to_proto,
    RecordSource: _record_source_to_proto,
    RecordTimestamp: _record_timestamp_to_proto,
    RecordValue: _record_value_to_proto,
    RecordContext: _record_context_to_proto,
    RecordLineage: _record_lineage_to_proto,
    AdapterCapabilities: _capabilities_to_proto,
    DataContract: _data_contract_to_proto,
}

# Type registry for proto_to_pydantic
_PROTO_TO_PYDANTIC = {
    "ContextualRecord": _proto_to_contextual_record,
    "AdapterManifest": _proto_to_manifest,
    "AdapterHealth": _proto_to_health,
    "RecordSource": _proto_to_record_source,
    "RecordTimestamp": _proto_to_record_timestamp,
    "RecordValue": _proto_to_record_value,
    "RecordContext": _proto_to_record_context,
    "RecordLineage": _proto_to_record_lineage,
    "AdapterCapabilities": _proto_to_capabilities,
    "DataContract": _proto_to_data_contract,
}


def pydantic_to_proto(model: Any) -> dict[str, Any]:
    """Convert a Forge Pydantic model instance to a proto-compatible dict.

    Supported types: ContextualRecord, AdapterManifest, AdapterHealth,
    and all component models (RecordSource, RecordTimestamp, etc.).

    Raises TypeError if the model type is not registered.
    """
    converter = _PYDANTIC_TO_PROTO.get(type(model))
    if converter is None:
        msg = f"No proto converter registered for {type(model).__name__}"
        raise TypeError(msg)
    return converter(model)


def proto_to_pydantic(proto_dict: dict[str, Any], target_type: str) -> Any:
    """Convert a proto-compatible dict back to a Forge Pydantic model.

    Args:
        proto_dict: Dict matching the proto message structure.
        target_type: Name of the target Pydantic class, e.g. "ContextualRecord".

    Raises KeyError if the target type is not registered.
    """
    converter = _PROTO_TO_PYDANTIC.get(target_type)
    if converter is None:
        msg = f"No Pydantic converter registered for '{target_type}'"
        raise KeyError(msg)
    return converter(proto_dict)
