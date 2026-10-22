package models

import "time"

// DataProductStatus represents the lifecycle status of a data product.
type DataProductStatus string

const (
	DataProductStatusDraft      DataProductStatus = "DRAFT"
	DataProductStatusPublished  DataProductStatus = "PUBLISHED"
	DataProductStatusDeprecated DataProductStatus = "DEPRECATED"
	DataProductStatusRetired    DataProductStatus = "RETIRED"
)

// QualitySLO is a quality service level objective for a data product.
type QualitySLO struct {
	Metric      string  `json:"metric"`
	Target      float64 `json:"target"`
	Measurement string  `json:"measurement"`
	Window      string  `json:"window"`
}

// DataProductSchema is a schema reference for a data product.
type DataProductSchema struct {
	SchemaRef         string `json:"schema_ref"`
	Version           string `json:"version"`
	CompatibilityMode string `json:"compatibility_mode"`
}

// DataProduct is a curated, decision-ready dataset with governance metadata.
// Data products are the primary output of the Forge curation layer.
// CurationSpec says how the curation engine builds a product's pipeline and
// whether the ingest path runs it (FB-009). Mirrors forge.core.models.data_product.CurationSpec.
type CurationSpec struct {
	Normalize  bool     `json:"normalize"`
	TimeWindow string   `json:"time_window"`
	GroupBy    []string `json:"group_by,omitempty"`
	Functions  []string `json:"functions,omitempty"`
	OnIngest   bool     `json:"on_ingest"`
}

type DataProduct struct {
	ProductID      string            `json:"product_id"`
	Name           string            `json:"name"`
	Description    string            `json:"description"`
	Owner          string            `json:"owner"`
	Status         DataProductStatus `json:"status"`
	Schema         DataProductSchema `json:"schema"`
	SourceAdapters []string          `json:"source_adapters,omitempty"`
	QualitySLOs    []QualitySLO      `json:"quality_slos,omitempty"`
	Tags           []string          `json:"tags,omitempty"`
	Curation       *CurationSpec     `json:"curation,omitempty"`
	CreatedAt      time.Time         `json:"created_at"`
	UpdatedAt      time.Time         `json:"updated_at"`
	Metadata       map[string]any    `json:"metadata,omitempty"`
}
