"""Data Product models — curated, decision-ready datasets.

A data product is a governed dataset or service that preserves the
metadata, lineage, time alignment, and operating context needed
for correct business interpretation.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from forge.core.clock import OneClockModel, utc_now
from forge.core.schema_ref import parse_schema_ref


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

    schema_ref: str = Field(
        description=(
            "A schema reference, forge://schemas/<spoke>[/<Entity>][/v<version>]"
            " (forge.core.schema_ref, FB-008), e.g. forge://schemas/production-context/v2."
        )
    )
    version: str
    compatibility_mode: str = "BACKWARD"

    @field_validator("schema_ref")
    @classmethod
    def _schema_ref_parses(cls, value: str) -> str:
        parse_schema_ref(value)
        return value


class DataProduct(OneClockModel):
    """A curated, decision-ready dataset with governance metadata.

    Data products are the primary output of the Forge curation layer.
    They have clear ownership, registered schemas, quality rules,
    complete lineage, and access controls.
    """

    # ``schema`` stays the wire name (JSON key, constructor keyword) but cannot be the
    # attribute: it would shadow ``BaseModel.schema()`` and Pydantic warns on import (FB-086).
    model_config = ConfigDict(
        validate_by_name=True, validate_by_alias=True, serialize_by_alias=True
    )

    product_id: str
    name: str
    description: str
    owner: str  # Named individual, not a department
    status: DataProductStatus = DataProductStatus.DRAFT
    product_schema: DataProductSchema = Field(alias="schema")
    source_adapters: list[str] = Field(default_factory=list)
    quality_slos: list[QualitySLO] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    metadata: dict[str, Any] = Field(default_factory=dict)
