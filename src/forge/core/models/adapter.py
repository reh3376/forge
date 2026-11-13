"""Adapter models — capability declarations and lifecycle state.

Every external system connects to Forge through an adapter.
Adapters are plugins that conform to a standard interface
governed by FACTS specs.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from forge.core.clock import ClockOffsetStats
from forge.core.schema_ref import require_versioned_ref


class AdapterTier(StrEnum):
    """The system tier this adapter connects to."""

    OT = "OT"  # PLC, SCADA, HMI, DCS
    MES_MOM = "MES_MOM"  # MES, QMS, WMS, LIMS, CMMS, EBR
    ERP_BUSINESS = "ERP_BUSINESS"  # ERP, SCM, CRM, PLM, BI
    HISTORIAN = "HISTORIAN"  # OSIsoft PI, AVEVA, etc.
    DOCUMENT = "DOCUMENT"  # SharePoint, file shares, DMS


class AdapterState(StrEnum):
    """Adapter lifecycle states."""

    REGISTERED = "REGISTERED"
    CONNECTING = "CONNECTING"
    HEALTHY = "HEALTHY"
    DEGRADED = "DEGRADED"
    FAILED = "FAILED"
    STOPPED = "STOPPED"


class AdapterCapabilities(BaseModel):
    """What this adapter can do."""

    read: bool = True
    write: bool = False
    subscribe: bool = False
    backfill: bool = False
    discover: bool = False


class ConnectionParam(BaseModel):
    """A parameter required to connect to the source system."""

    name: str
    description: str | None = None
    required: bool = True
    secret: bool = False
    default: str | None = None


class DataContract(BaseModel):
    """What this adapter produces."""

    schema_ref: str = Field(
        description=(
            "Contract ref of the adapter's output, forge://schemas/<spoke>/v<version>"
            " (forge.core.schema_ref, FB-008)."
        )
    )
    output_format: str = "contextual_record"
    context_fields: list[str] = Field(default_factory=list)

    @field_validator("schema_ref")
    @classmethod
    def _schema_ref_is_versioned(cls, value: str) -> str:
        return require_versioned_ref(value, field="schema_ref")


#: One-clock record P-8: the tolerance classes a link may declare.
ToleranceClass = Literal["T0", "T1", "T2", "T3", "T4", "T5", "it-lan", "it-wan", "edge-mqtt"]
#: One-clock record P-2: how a spoke reads the clock of the source it pulls from.
ClockReadMethod = Literal[
    "opcua-response-header",
    "opcua-current-time",
    "cip-wall-clock-time",
    "s7-clock",
    "modbus-registers",
    "sparkplug-payload-timestamp",
]
SourceTimestampOrigin = Literal["device", "server", "edge", "forge"]


class ConnectionTimeGovernance(BaseModel):
    """A per-connection time-governance declaration (FACTS ``time_governance.connections[]``)."""

    name: str = Field(min_length=1)
    clock_read_method: ClockReadMethod | None = None
    clock_probe_interval_seconds: float | None = Field(default=None, ge=1)
    source_timestamp_origin: SourceTimestampOrigin | None = None
    tolerance_class: ToleranceClass | None = None


class TimeGovernance(BaseModel):
    """How a spoke is time-governed: the FACTS ``time_governance`` section (FB-090).

    One clock (``docs/decisions/one-clock-ot-source-time.md`` P-7): where the host takes
    time, what disciplines its clock, how the spoke reads its source's clock, the probe
    cadence, which clock stamps its values, the tolerance class of the link and that it
    fails closed. The hub refuses a spoke whose clock is outside its class (FB-093).
    """

    time_source: Literal["hub-ntp", "site-ptp", "gnss"]
    sync_protocol: Literal["ntp", "ptp-cip-sync", "ptp-802.1as", "profinet-ptcp", "none"]
    clock_read_method: ClockReadMethod | None = None
    clock_probe_interval_seconds: float = Field(default=30.0, ge=1)
    source_timestamp_origin: SourceTimestampOrigin
    tolerance_class: ToleranceClass
    fail_closed: Literal[True] = True
    connections: list[ConnectionTimeGovernance] = Field(default_factory=list)

    def origin_for(self, connection: str | None) -> str:
        """The declared origin for ``connection`` (its own entry, else the spoke's default)."""
        for entry in self.connections:
            if connection and entry.name == connection and entry.source_timestamp_origin:
                return entry.source_timestamp_origin
        return self.source_timestamp_origin


class AdapterManifest(BaseModel):
    """Declares an adapter's identity, capabilities, and data contract.

    The manifest is the adapter's self-description. It is loaded at
    registration time and validated against the FACTS schema. The hub
    knows nothing about adapter internals — only what the manifest declares.
    """

    adapter_id: str
    name: str
    version: str
    type: str = "INGESTION"
    protocol: str
    tier: AdapterTier
    capabilities: AdapterCapabilities = Field(default_factory=AdapterCapabilities)
    data_contract: DataContract
    health_check_interval_ms: int = 5000
    connection_params: list[ConnectionParam] = Field(default_factory=list)
    auth_methods: list[str] = Field(default_factory=lambda: ["none"])
    metadata: dict[str, Any] = Field(default_factory=dict)
    time_governance: TimeGovernance | None = Field(
        default=None,
        description=(
            "The FACTS time_governance section, carried to the hub at Register (one clock, "
            "FB-090). None only for a manifest built before FB-090; FB-093 refuses a "
            "registration without it. Proto field 13."
        ),
    )


class AdapterHealth(BaseModel):
    """Current health status of an adapter instance."""

    adapter_id: str
    state: AdapterState
    last_check: datetime | None = None
    last_healthy: datetime | None = None
    error_message: str | None = None
    records_collected: int = 0
    records_failed: int = 0
    uptime_seconds: float = 0.0
    clock: dict[str, ClockOffsetStats] = Field(
        default_factory=dict,
        description=(
            "Measured clock offsets of this adapter per link (spoke, server, source) as the "
            "hub sees them (FB-089). Hub-side only: not on the wire until FB-092 puts time "
            "in the contract."
        ),
    )
    refusals: dict[str, int] = Field(
        default_factory=dict,
        description=(
            "Values this adapter refused rather than invent something about them, by cause: "
            "source_stamp_missing (a value without a source timestamp on a connection that "
            "does not declare origin forge, FB-088); the clock refusals of FB-093 join it. "
            "Hub-side only until the health contract carries it (FB-092); on the wire, "
            "error_message names the last refusal."
        ),
    )
    last_refusal: str | None = Field(
        default=None,
        description=(
            "The last refusal, with its cause, as the adapter reported it. A refusal is never "
            "silent (owner, 2026-11-03): it is here, on error_message, on the adapter's state "
            "(DEGRADED) and on the forge.ingest.refused metric."
        ),
    )
