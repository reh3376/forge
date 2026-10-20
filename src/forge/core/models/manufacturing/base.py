"""Base model for all manufacturing domain entities.

Every manufacturing model inherits from ManufacturingModelBase, which
provides four fields that make cross-system joins and provenance
tracking possible:

    forge_id: Forge's internal identifier (UUID, auto-generated)
    source_system: Which adapter/system produced this record
    source_id: The entity's ID in the source system
    captured_at: When this snapshot was captured
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from pydantic import ConfigDict, Field

from forge.core.clock import OneClockModel, utc_now


class ManufacturingModelBase(OneClockModel):
    """Shared base for all manufacturing domain models.

    Every instance carries provenance — you always know where the
    data came from and when it was captured. The forge_id is Forge's
    own identifier; source_id is the origin system's primary key.
    They are independent and never collide.

    Every datetime field on every entity (``captured_at``, ``event_time``,
    ``planned_start``, ...) must be timezone-aware and is stored in UTC;
    a naive value is rejected (one clock, FB-014).
    """

    forge_id: UUID = Field(
        default_factory=uuid4,
        description="Forge-internal unique identifier.",
    )
    source_system: str = Field(
        ...,
        description="Adapter or system that produced this record (e.g. 'whk-wms').",
    )
    source_id: str = Field(
        ...,
        description="Primary key of this entity in the source system.",
    )
    captured_at: datetime = Field(
        default_factory=utc_now,
        description="UTC timestamp when this snapshot was captured by Forge.",
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Source-system-specific fields that don't map to core schema.",
    )

    model_config = ConfigDict(
        frozen=False,
        populate_by_name=True,
        ser_json_timedelta="iso8601",
    )
