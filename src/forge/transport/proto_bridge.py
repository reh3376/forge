# ruff: noqa: UP017
"""Pydantic ↔ Protobuf message bridge for hardened gRPC transport.

Converts between Forge Pydantic domain models and compiled protobuf
message objects. Unlike the dict-based serialization module, this bridge
works with actual proto message instances — the same types that gRPC
serializes to/from binary on the wire.

Architecture:
    Pydantic model ──to_proto()──► Proto message ──gRPC binary──► wire
    wire ──gRPC binary──► Proto message ──from_proto()──► Pydantic model

The bridge ensures:
  1. Type fidelity: proto schema enforces field types at serialization
  2. Round-trip correctness: pydantic → proto → pydantic is lossless
  3. Enum mapping: Python StrEnum ↔ proto int enum via explicit tables
  4. Timestamp precision: datetime ↔ google.protobuf.Timestamp (nanosecond)
  5. oneof typed_value: RecordValue.raw dispatched to correct proto variant
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from google.protobuf.timestamp_pb2 import Timestamp

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
from forge.proto_gen.forge.v1 import adapter_pb2 as adapter_msg
from forge.proto_gen.forge.v1 import contextual_record_pb2 as record_msg
from forge.proto_gen.forge.v1 import enums_pb2 as enums

# ---------------------------------------------------------------------------
# Enum mapping tables (Python StrEnum value → proto int)
# ---------------------------------------------------------------------------

_QUALITY_TO_PROTO: dict[str, int] = {
    "GOOD": enums.QUALITY_CODE_GOOD,
    "UNCERTAIN": enums.QUALITY_CODE_UNCERTAIN,
    "BAD": enums.QUALITY_CODE_BAD,
    "NOT_AVAILABLE": enums.QUALITY_CODE_NOT_AVAILABLE,
}
_PROTO_TO_QUALITY: dict[int, str] = {v: k for k, v in _QUALITY_TO_PROTO.items()}

_ADAPTER_STATE_TO_PROTO: dict[str, int] = {
    "REGISTERED": enums.ADAPTER_STATE_REGISTERED,
    "CONNECTING": enums.ADAPTER_STATE_CONNECTING,
    "HEALTHY": enums.ADAPTER_STATE_HEALTHY,
    "DEGRADED": enums.ADAPTER_STATE_DEGRADED,
    "FAILED": enums.ADAPTER_STATE_FAILED,
    "STOPPED": enums.ADAPTER_STATE_STOPPED,
}
_PROTO_TO_ADAPTER_STATE: dict[int, str] = {
    v: k for k, v in _ADAPTER_STATE_TO_PROTO.items()
}

_ADAPTER_TIER_TO_PROTO: dict[str, int] = {
    "OT": enums.ADAPTER_TIER_OT,
    "MES_MOM": enums.ADAPTER_TIER_MES_MOM,
    "ERP_BUSINESS": enums.ADAPTER_TIER_ERP_BUSINESS,
    "HISTORIAN": enums.ADAPTER_TIER_HISTORIAN,
    "DOCUMENT": enums.ADAPTER_TIER_DOCUMENT,
}
_PROTO_TO_ADAPTER_TIER: dict[int, str] = {
    v: k for k, v in _ADAPTER_TIER_TO_PROTO.items()
}


# ---------------------------------------------------------------------------
# Timestamp helpers
# ---------------------------------------------------------------------------


def _dt_to_timestamp(dt: datetime | None) -> Timestamp | None:
    """Convert Python datetime to google.protobuf.Timestamp."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    ts = Timestamp()
    ts.FromDatetime(dt)
    return ts


def _timestamp_to_dt(ts: Timestamp | None) -> datetime | None:
    """Convert google.protobuf.Timestamp to Python datetime."""
    if ts is None or (ts.seconds == 0 and ts.nanos == 0):
        return None
    return ts.ToDatetime(tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# RecordValue.raw ↔ oneof typed_value
# ---------------------------------------------------------------------------


def _set_typed_value(msg: record_msg.RecordValue, raw: Any) -> None:
    """Set the oneof typed_value field on a RecordValue proto message."""
    if raw is None:
        return  # Leave oneof unset
    if isinstance(raw, bool):
        msg.bool_value = raw
    elif isinstance(raw, int):
        msg.integer_value = raw
    elif isinstance(raw, float):
        if math.isnan(raw) or math.isinf(raw):
            msg.string_value = str(raw)
        else:
            msg.number_value = raw
    elif isinstance(raw, str):
        msg.string_value = raw
    elif isinstance(raw, bytes):
        msg.bytes_value = raw
    elif isinstance(raw, (dict, list)):
        msg.json_value = json.dumps(raw, default=str)
    else:
        msg.json_value = json.dumps(raw, default=str)


def _get_typed_value(msg: record_msg.RecordValue) -> Any:
    """Extract the raw value from a RecordValue proto message's oneof."""
    which = msg.WhichOneof("typed_value")
    if which is None:
        return None
    if which == "number_value":
        return msg.number_value
    if which == "integer_value":
        return msg.integer_value
    if which == "string_value":
        return msg.string_value
    if which == "bool_value":
        return msg.bool_value
    if which == "bytes_value":
        return msg.bytes_value
    if which == "json_value":
        return json.loads(msg.json_value)
    return None


# ---------------------------------------------------------------------------
# Pydantic → Proto message converters
# ---------------------------------------------------------------------------


def record_source_to_proto(source: RecordSource) -> record_msg.RecordSource:
    """Convert Pydantic RecordSource to proto RecordSource."""
    return record_msg.RecordSource(
        adapter_id=source.adapter_id,
        system=source.system,
        tag_path=source.tag_path or "",
        connection_id=source.connection_id or "",
    )


def record_timestamp_to_proto(ts: RecordTimestamp) -> record_msg.RecordTimestamp:
    """Convert Pydantic RecordTimestamp to proto RecordTimestamp."""
    proto_ts = record_msg.RecordTimestamp()
    source_ts = _dt_to_timestamp(ts.source_time)
    if source_ts is not None:
        proto_ts.source_time.CopyFrom(source_ts)
    if ts.server_time is not None:
        server_ts = _dt_to_timestamp(ts.server_time)
        if server_ts is not None:
            proto_ts.server_time.CopyFrom(server_ts)
    ingest_ts = _dt_to_timestamp(ts.ingestion_time)
    if ingest_ts is not None:
        proto_ts.ingestion_time.CopyFrom(ingest_ts)
    return proto_ts


def record_value_to_proto(value: RecordValue) -> record_msg.RecordValue:
    """Convert Pydantic RecordValue to proto RecordValue."""
    proto_val = record_msg.RecordValue(
        engineering_units=value.engineering_units or "",
        quality=_QUALITY_TO_PROTO.get(value.quality.value, enums.QUALITY_CODE_UNSPECIFIED),
        data_type=value.data_type,
    )
    _set_typed_value(proto_val, value.raw)
    return proto_val


def record_context_to_proto(ctx: RecordContext) -> record_msg.RecordContext:
    """Convert Pydantic RecordContext to proto RecordContext."""
    extra_map: dict[str, str] = {}
    for k, v in ctx.extra.items():
        extra_map[k] = v if isinstance(v, str) else json.dumps(v, default=str)

    return record_msg.RecordContext(
        equipment_id=ctx.equipment_id or "",
        area=ctx.area or "",
        site=ctx.site or "",
        batch_id=ctx.batch_id or "",
        lot_id=ctx.lot_id or "",
        recipe_id=ctx.recipe_id or "",
        operating_mode=ctx.operating_mode or "",
        shift=ctx.shift or "",
        operator_id=ctx.operator_id or "",
        extra=extra_map,
    )


def record_lineage_to_proto(lineage: RecordLineage) -> record_msg.RecordLineage:
    """Convert Pydantic RecordLineage to proto RecordLineage."""
    return record_msg.RecordLineage(
        schema_ref=lineage.schema_ref,
        adapter_id=lineage.adapter_id,
        adapter_version=lineage.adapter_version,
        transformation_chain=list(lineage.transformation_chain),
    )


def contextual_record_to_proto(record: ContextualRecord) -> record_msg.ContextualRecord:
    """Convert Pydantic ContextualRecord to proto ContextualRecord message."""
    return record_msg.ContextualRecord(
        record_id=str(record.record_id),
        source=record_source_to_proto(record.source),
        timestamp=record_timestamp_to_proto(record.timestamp),
        value=record_value_to_proto(record.value),
        context=record_context_to_proto(record.context),
        lineage=record_lineage_to_proto(record.lineage),
    )


def capabilities_to_proto(caps: AdapterCapabilities) -> adapter_msg.AdapterCapabilities:
    """Convert Pydantic AdapterCapabilities to proto AdapterCapabilities."""
    return adapter_msg.AdapterCapabilities(
        read=caps.read,
        write=caps.write,
        subscribe=caps.subscribe,
        backfill=caps.backfill,
        discover=caps.discover,
    )


def connection_param_to_proto(param: ConnectionParam) -> adapter_msg.ConnectionParam:
    """Convert Pydantic ConnectionParam to proto ConnectionParam."""
    return adapter_msg.ConnectionParam(
        name=param.name,
        description=param.description or "",
        required=param.required,
        secret=param.secret,
        default_value=param.default or "",
    )


def data_contract_to_proto(contract: DataContract) -> adapter_msg.DataContract:
    """Convert Pydantic DataContract to proto DataContract."""
    return adapter_msg.DataContract(
        schema_ref=contract.schema_ref,
        output_format=contract.output_format,
        context_fields=list(contract.context_fields),
    )


def manifest_to_proto(manifest: AdapterManifest) -> adapter_msg.AdapterManifest:
    """Convert Pydantic AdapterManifest to proto AdapterManifest message."""
    proto_manifest = adapter_msg.AdapterManifest(
        adapter_id=manifest.adapter_id,
        name=manifest.name,
        version=manifest.version,
        type=manifest.type,
        protocol=manifest.protocol,
        tier=_ADAPTER_TIER_TO_PROTO.get(manifest.tier.value, enums.ADAPTER_TIER_UNSPECIFIED),
        capabilities=capabilities_to_proto(manifest.capabilities),
        data_contract=data_contract_to_proto(manifest.data_contract),
        health_check_interval_ms=manifest.health_check_interval_ms,
        connection_params=[connection_param_to_proto(p) for p in manifest.connection_params],
        auth_methods=list(manifest.auth_methods),
    )
    # metadata → google.protobuf.Struct
    if manifest.metadata:
        proto_manifest.metadata.update(manifest.metadata)
    return proto_manifest


def health_to_proto(health: AdapterHealth) -> adapter_msg.AdapterHealth:
    """Convert Pydantic AdapterHealth to proto AdapterHealth message."""
    proto_health = adapter_msg.AdapterHealth(
        adapter_id=health.adapter_id,
        state=_ADAPTER_STATE_TO_PROTO.get(
            health.state.value, enums.ADAPTER_STATE_UNSPECIFIED,
        ),
        error_message=health.error_message or "",
        records_collected=health.records_collected,
        records_failed=health.records_failed,
        uptime_seconds=health.uptime_seconds,
    )
    last_check = _dt_to_timestamp(health.last_check)
    if last_check is not None:
        proto_health.last_check.CopyFrom(last_check)
    last_healthy = _dt_to_timestamp(health.last_healthy)
    if last_healthy is not None:
        proto_health.last_healthy.CopyFrom(last_healthy)
    return proto_health


# ---------------------------------------------------------------------------
# Proto message → Pydantic converters
# ---------------------------------------------------------------------------


def proto_to_record_source(msg: record_msg.RecordSource) -> RecordSource:
    """Convert proto RecordSource to Pydantic RecordSource."""
    return RecordSource(
        adapter_id=msg.adapter_id,
        system=msg.system,
        tag_path=msg.tag_path or None,
        connection_id=msg.connection_id or None,
    )


def proto_to_record_timestamp(msg: record_msg.RecordTimestamp) -> RecordTimestamp:
    """Convert proto RecordTimestamp to Pydantic RecordTimestamp."""
    return RecordTimestamp(
        source_time=_timestamp_to_dt(msg.source_time),
        server_time=_timestamp_to_dt(msg.server_time),
        ingestion_time=_timestamp_to_dt(msg.ingestion_time),
    )


def proto_to_record_value(msg: record_msg.RecordValue) -> RecordValue:
    """Convert proto RecordValue to Pydantic RecordValue."""
    raw = _get_typed_value(msg)
    quality_str = _PROTO_TO_QUALITY.get(msg.quality, "GOOD")
    return RecordValue(
        raw=raw,
        engineering_units=msg.engineering_units or None,
        quality=QualityCode(quality_str),
        data_type=msg.data_type or "string",
    )


def proto_to_record_context(msg: record_msg.RecordContext) -> RecordContext:
    """Convert proto RecordContext to Pydantic RecordContext."""
    extra: dict[str, Any] = {}
    for k, v in msg.extra.items():
        try:
            extra[k] = json.loads(v)
        except (json.JSONDecodeError, ValueError):
            extra[k] = v

    return RecordContext(
        equipment_id=msg.equipment_id or None,
        area=msg.area or None,
        site=msg.site or None,
        batch_id=msg.batch_id or None,
        lot_id=msg.lot_id or None,
        recipe_id=msg.recipe_id or None,
        operating_mode=msg.operating_mode or None,
        shift=msg.shift or None,
        operator_id=msg.operator_id or None,
        extra=extra,
    )


def proto_to_record_lineage(msg: record_msg.RecordLineage) -> RecordLineage:
    """Convert proto RecordLineage to Pydantic RecordLineage."""
    return RecordLineage(
        schema_ref=msg.schema_ref,
        adapter_id=msg.adapter_id,
        adapter_version=msg.adapter_version,
        transformation_chain=list(msg.transformation_chain),
    )


def proto_to_contextual_record(msg: record_msg.ContextualRecord) -> ContextualRecord:
    """Convert proto ContextualRecord message to Pydantic ContextualRecord."""
    return ContextualRecord(
        record_id=UUID(msg.record_id) if msg.record_id else None,
        source=proto_to_record_source(msg.source),
        timestamp=proto_to_record_timestamp(msg.timestamp),
        value=proto_to_record_value(msg.value),
        context=proto_to_record_context(msg.context),
        lineage=proto_to_record_lineage(msg.lineage),
    )


def proto_to_capabilities(msg: adapter_msg.AdapterCapabilities) -> AdapterCapabilities:
    """Convert proto AdapterCapabilities to Pydantic AdapterCapabilities."""
    return AdapterCapabilities(
        read=msg.read,
        write=msg.write,
        subscribe=msg.subscribe,
        backfill=msg.backfill,
        discover=msg.discover,
    )


def proto_to_connection_param(msg: adapter_msg.ConnectionParam) -> ConnectionParam:
    """Convert proto ConnectionParam to Pydantic ConnectionParam."""
    return ConnectionParam(
        name=msg.name,
        description=msg.description or None,
        required=msg.required,
        secret=msg.secret,
        default=msg.default_value or None,
    )


def proto_to_data_contract(msg: adapter_msg.DataContract) -> DataContract:
    """Convert proto DataContract to Pydantic DataContract."""
    return DataContract(
        schema_ref=msg.schema_ref,
        output_format=msg.output_format or "contextual_record",
        context_fields=list(msg.context_fields),
    )


def proto_to_manifest(msg: adapter_msg.AdapterManifest) -> AdapterManifest:
    """Convert proto AdapterManifest message to Pydantic AdapterManifest."""
    tier_str = _PROTO_TO_ADAPTER_TIER.get(msg.tier, "OT")
    return AdapterManifest(
        adapter_id=msg.adapter_id,
        name=msg.name,
        version=msg.version,
        type=msg.type,
        protocol=msg.protocol,
        tier=AdapterTier(tier_str),
        capabilities=proto_to_capabilities(msg.capabilities),
        data_contract=proto_to_data_contract(msg.data_contract),
        health_check_interval_ms=msg.health_check_interval_ms,
        connection_params=[proto_to_connection_param(p) for p in msg.connection_params],
        auth_methods=list(msg.auth_methods) if msg.auth_methods else ["none"],
        metadata=dict(msg.metadata) if msg.HasField("metadata") else {},
    )


def proto_to_health(msg: adapter_msg.AdapterHealth) -> AdapterHealth:
    """Convert proto AdapterHealth message to Pydantic AdapterHealth."""
    state_str = _PROTO_TO_ADAPTER_STATE.get(msg.state, "REGISTERED")
    return AdapterHealth(
        adapter_id=msg.adapter_id,
        state=AdapterState(state_str),
        last_check=_timestamp_to_dt(msg.last_check),
        last_healthy=_timestamp_to_dt(msg.last_healthy),
        error_message=msg.error_message or None,
        records_collected=msg.records_collected,
        records_failed=msg.records_failed,
        uptime_seconds=msg.uptime_seconds,
    )
