package manufacturing

import "time"

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
