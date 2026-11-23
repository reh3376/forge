package manufacturing

import (
	"fmt"
	"time"
)

// SampleResult is an individual measurement within a quality sample.
type SampleResult struct {
	ManufacturingModelBase
	ParameterName string        `json:"parameter_name"`
	MeasuredValue *float64      `json:"measured_value,omitempty"`
	MeasuredText  string        `json:"measured_text,omitempty"`
	UnitOfMeasure string        `json:"unit_of_measure,omitempty"`
	LowerLimit    *float64      `json:"lower_limit,omitempty"`
	UpperLimit    *float64      `json:"upper_limit,omitempty"`
	Outcome       SampleOutcome `json:"outcome"`
}

// NewSampleResult returns a SampleResult with the Python model's defaults: a
// new ForgeID, CapturedAt now and Outcome SampleOutcomePending.
func NewSampleResult(sourceSystem, sourceID, parameterName string) SampleResult {
	return SampleResult{
		ManufacturingModelBase: NewBase(sourceSystem, sourceID),
		ParameterName:          parameterName,
		Outcome:                SampleOutcomePending,
	}
}

// Validate reports the required fields that are empty and an outcome outside
// the enumeration.
func (r SampleResult) Validate() error {
	v := r.check("SampleResult")
	v.required("parameter_name", r.ParameterName)
	v.enum("outcome", string(r.Outcome), r.Outcome.Valid(), "SampleOutcome")
	return v.err()
}

// QualitySample is a quality measurement event taken from an entity
// (barrel, batch, lot) at a specific time and place.
type QualitySample struct {
	ManufacturingModelBase
	SampleType     string         `json:"sample_type"`
	EntityType     string         `json:"entity_type"`
	EntityID       string         `json:"entity_id"`
	SampledBy      string         `json:"sampled_by,omitempty"`
	SampledAt      *time.Time     `json:"sampled_at,omitempty"`
	AssetID        string         `json:"asset_id,omitempty"`
	Results        []SampleResult `json:"results,omitempty"`
	OverallOutcome SampleOutcome  `json:"overall_outcome"`
}

// NewQualitySample returns a QualitySample with the Python model's defaults:
// a new ForgeID, CapturedAt now and OverallOutcome SampleOutcomePending.
func NewQualitySample(sourceSystem, sourceID, sampleType, entityType, entityID string) QualitySample {
	return QualitySample{
		ManufacturingModelBase: NewBase(sourceSystem, sourceID),
		SampleType:             sampleType,
		EntityType:             entityType,
		EntityID:               entityID,
		OverallOutcome:         SampleOutcomePending,
	}
}

// Validate reports the required fields that are empty and the outcomes
// outside the enumeration, on the sample and on each of its results.
func (q QualitySample) Validate() error {
	v := q.check("QualitySample")
	v.required("sample_type", q.SampleType)
	v.required("entity_type", q.EntityType)
	v.required("entity_id", q.EntityID)
	for i, result := range q.Results {
		v.nested(fmt.Sprintf("results[%d]", i), result.Validate())
	}
	v.enum("overall_outcome", string(q.OverallOutcome), q.OverallOutcome.Valid(), "SampleOutcome")
	return v.err()
}
