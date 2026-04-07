"""ContextualRecord — the fundamental data unit in Forge.

A contextual record is a value with its operational context attached.
This is the core innovation that makes decision-quality possible.
The value 78.4°F means something very different depending on whether
the fermenter is in production, CIP, startup, or idle mode.
"""

from __future__ import annotations

from datetime import datetime
from forge._compat import StrEnum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field


class QualityCode(StrEnum):
    """OPC UA-inspired data quality codes."""

    GOOD = "GOOD"
    UNCERTAIN = "UNCERTAIN"
    BAD = "BAD"
    NOT_AVAILABLE = "NOT_AVAILABLE"


class RecordTimestamp(BaseModel):
    """Triple-timestamp for full temporal context.

    source_time: when the value was generated at the source system
    server_time: when the source system's server processed it
    ingestion_time: when Forge received it
    """

    source_time: datetime
    server_time: datetime | None = None
    ingestion_time: datetime = Field(default_factory=datetime.utcnow)


class RecordValue(BaseModel):
    """The actual value with its engineering context."""

    raw: Any
    engineering_units: str | None = None
    quality: QualityCode = QualityCode.GOOD
    data_type: str = "string"


class RecordContext(BaseModel):
    """Operational context that travels with every data record.

    This is what makes Forge different from a raw data pipeline.
    Every record carries enough context for correct interpretation.
    """

    equipment_id: str | None = None
    area: str | None = None
    site: str | None = None
    batch_id: str | None = None
    lot_id: str | None = None
    recipe_id: str | None = None
    operating_mode: str | None = None
    shift: str | None = None
    operator_id: str | None = None
    extra: dict[str, Any] = Field(default_factory=dict)


class RecordLineage(BaseModel):
    """Provenance chain — where this record came from and how it was transformed."""

    schema_ref: str
    adapter_id: str
    adapter_version: str
    transformation_chain: list[str] = Field(default_factory=list)


class RecordSource(BaseModel):
    """Source identification — which adapter and system produced this record."""

    adapter_id: str
    system: str
    tag_path: str | None = None
    connection_id: str | None = None


class ContextualRecord(BaseModel):
    """The fundamental data unit in Forge.

    Every piece of data that enters the platform is wrapped in a
    ContextualRecord that preserves its operational context, source,
    timestamps, and lineage. This ensures that when an analyst,
    dashboard, AI model, or automated workflow later reads this value,
    the context required for correct interpretation is present.
    """

    record_id: UUID = Field(default_factory=uuid4)
    source: RecordSource
    timestamp: RecordTimestamp
    value: RecordValue
    context: RecordContext = Field(default_factory=RecordContext)
    lineage: RecordLineage

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "record_id": "01234567-89ab-cdef-0123-456789abcdef",
                "source": {
                    "adapter_id": "opcua-generic",
                    "system": "ignition-prod",
                    "tag_path": "Area1/Fermenter3/Temperature",
                },
                "timestamp": {
                    "source_time": "2026-04-05T14:30:00.123Z",
                    "ingestion_time": "2026-04-05T14:30:00.200Z",
                },
                "value": {
                    "raw": 78.4,
                    "engineering_units": "°F",
                    "quality": "GOOD",
                    "data_type": "float64",
                },
                "context": {
                    "equipment_id": "FERM-003",
                    "batch_id": "B2026-0405-003",
                    "operating_mode": "PRODUCTION",
                    "shift": "B",
                },
                "lineage": {
                    "schema_ref": "forge://schemas/opcua-generic/v1",
                    "adapter_id": "opcua-generic",
                    "adapter_version": "0.1.0",
                },
            }
        }
    )
