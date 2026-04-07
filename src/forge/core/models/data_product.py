"""Data Product models — curated, decision-ready datasets.

A data product is a governed dataset or service that preserves the
metadata, lineage, time alignment, and operating context needed
for correct business interpretation.
"""

from __future__ import annotations

from datetime import datetime
from forge._compat import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class DataProductStatus(StrEnum):
    """Lifecycle status of a data product."""

    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    DEPRECATED = "DEPRECATED"
    RETIRED = "RETIRED"


class QualitySLO(BaseModel):
    """Quality service level objective for a data product."""

    metric: str  # e.g., "completeness", "freshness", "accuracy"
    target: float  # e.g., 99.5 (percent)
    measurement: str  # e.g., "percentage of non-null required fields"
    window: str = "1h"  # evaluation window


class DataProductSchema(BaseModel):
    """Schema reference for a data product."""

    schema_ref: str  # e.g., "forge://schemas/production-context/v2"
    version: str
    compatibility_mode: str = "BACKWARD"


class DataProduct(BaseModel):
    """A curated, decision-ready dataset with governance metadata.

    Data products are the primary output of the Forge curation layer.
    They have clear ownership, registered schemas, quality rules,
    complete lineage, and access controls.
    """

    product_id: str
    name: str
    description: str
    owner: str  # Named individual, not a department
    status: DataProductStatus = DataProductStatus.DRAFT
    schema: DataProductSchema
    source_adapters: list[str] = Field(default_factory=list)
    quality_slos: list[QualitySLO] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)
