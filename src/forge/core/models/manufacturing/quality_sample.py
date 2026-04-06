"""QualitySample — quality measurement with pass/fail.

Maps from:
    WMS: Sample (sampleTypeId, barrelId, sampledBy, sampleResult, sampleValue) +
         SampleType (typeName, typeResultType, limits, units) +
         BarrelSample (volume, volumeUnit)
    MES: TestParameter (name, testSetpointType, limits) +
         BatchParameterValue (value, timestamp, batchId) +
         BatchParameterConfiguration (collectionMethod, aggregationType)

Quality samples represent measurements taken to verify that a product
or process meets specifications. Both systems have the concept of
"measure something, compare to limits, decide pass/fail."
"""

from __future__ import annotations

from datetime import datetime  # noqa: TC003

from pydantic import Field

from forge.core.models.manufacturing.base import ManufacturingModelBase
from forge.core.models.manufacturing.enums import SampleOutcome


class SampleResult(ManufacturingModelBase):
    """An individual measurement within a quality sample."""

    parameter_name: str = Field(
        ...,
        description="Name of the measured parameter.",
    )
    measured_value: float | None = Field(
        default=None,
        description="Numeric result of the measurement.",
    )
    measured_text: str | None = Field(
        default=None,
        description="Text result for boolean or categorical measurements.",
    )
    unit_of_measure: str | None = Field(
        default=None,
        description="Engineering unit for the measurement.",
    )
    lower_limit: float | None = Field(
        default=None,
        description="Specification lower limit.",
    )
    upper_limit: float | None = Field(
        default=None,
        description="Specification upper limit.",
    )
    outcome: SampleOutcome = Field(
        default=SampleOutcome.PENDING,
        description="Whether this result passed or failed.",
    )


class QualitySample(ManufacturingModelBase):
    """A quality measurement event.

    A sample is taken from an entity (barrel, batch, lot) at a
    specific time and place. It may contain multiple results
    (different parameters measured on the same sample).
    """

    sample_type: str = Field(
        ...,
        description="Type/category of sample (e.g. 'proof_check', 'grain_analysis').",
    )
    entity_type: str = Field(
        ...,
        description="Type of entity sampled (e.g. 'manufacturing_unit', 'lot').",
    )
    entity_id: str = Field(
        ...,
        description="Source ID of the entity that was sampled.",
    )
    sampled_by: str | None = Field(
        default=None,
        description="User or operator who took the sample.",
    )
    sampled_at: datetime | None = Field(
        default=None,
        description="When the sample was taken.",
    )
    asset_id: str | None = Field(
        default=None,
        description="Reference to PhysicalAsset where sample was taken.",
    )
    results: list[SampleResult] = Field(
        default_factory=list,
        description="Individual measurement results for this sample.",
    )
    overall_outcome: SampleOutcome = Field(
        default=SampleOutcome.PENDING,
        description="Aggregate outcome across all results.",
    )
