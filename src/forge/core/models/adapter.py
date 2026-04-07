"""Adapter models — capability declarations and lifecycle state.

Every external system connects to Forge through an adapter.
Adapters are plugins that conform to a standard interface
governed by FACTS specs.
"""

from __future__ import annotations

from datetime import datetime  # noqa: TC003 — Pydantic needs runtime access
from forge._compat import StrEnum
from typing import Any

from pydantic import BaseModel, Field


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

    schema_ref: str
    output_format: str = "contextual_record"
    context_fields: list[str] = Field(default_factory=list)


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
