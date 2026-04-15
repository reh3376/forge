// Package models defines the core domain types for the Forge platform.
//
// These types are the Go equivalents of the Python Pydantic models in
// src/forge/core/models/. They are plain Go structs with JSON tags for
// serialization and are separate from the protobuf-generated types in gen/.
package models

import (
	"time"

	"github.com/google/uuid"
)

// QualityCode represents OPC UA-inspired data quality codes.
type QualityCode string

const (
	QualityGood         QualityCode = "GOOD"
	QualityUncertain    QualityCode = "UNCERTAIN"
	QualityBad          QualityCode = "BAD"
	QualityNotAvailable QualityCode = "NOT_AVAILABLE"
)

// RecordTimestamp provides triple-timestamp temporal context.
//
//	source_time:    when the value was generated at the source system
//	server_time:    when the source system's server processed it
//	ingestion_time: when Forge received it
type RecordTimestamp struct {
	SourceTime    time.Time  `json:"source_time"`
	ServerTime    *time.Time `json:"server_time,omitempty"`
	IngestionTime time.Time  `json:"ingestion_time"`
}

// RecordValue holds the actual value with its engineering context.
type RecordValue struct {
	Raw              any         `json:"raw"`
	EngineeringUnits string      `json:"engineering_units,omitempty"`
	Quality          QualityCode `json:"quality"`
	DataType         string      `json:"data_type"`
}

// RecordContext carries the operational context that travels with every record.
type RecordContext struct {
	EquipmentID   string         `json:"equipment_id,omitempty"`
	Area          string         `json:"area,omitempty"`
	Site          string         `json:"site,omitempty"`
	BatchID       string         `json:"batch_id,omitempty"`
	LotID         string         `json:"lot_id,omitempty"`
	RecipeID      string         `json:"recipe_id,omitempty"`
	OperatingMode string         `json:"operating_mode,omitempty"`
	Shift         string         `json:"shift,omitempty"`
	OperatorID    string         `json:"operator_id,omitempty"`
	Extra         map[string]any `json:"extra,omitempty"`
}

// RecordLineage captures provenance — where this record came from.
type RecordLineage struct {
	SchemaRef           string   `json:"schema_ref"`
	AdapterID           string   `json:"adapter_id"`
	AdapterVersion      string   `json:"adapter_version"`
	TransformationChain []string `json:"transformation_chain,omitempty"`
}

// RecordSource identifies which adapter and system produced this record.
type RecordSource struct {
	AdapterID    string `json:"adapter_id"`
	System       string `json:"system"`
	TagPath      string `json:"tag_path,omitempty"`
	ConnectionID string `json:"connection_id,omitempty"`
}

// ContextualRecord is the fundamental data unit in Forge.
//
// Every piece of data that enters the platform is wrapped in a
// ContextualRecord that preserves its operational context, source,
// timestamps, and lineage.
type ContextualRecord struct {
	RecordID  uuid.UUID       `json:"record_id"`
	Source    RecordSource    `json:"source"`
	Timestamp RecordTimestamp `json:"timestamp"`
	Value     RecordValue    `json:"value"`
	Context   RecordContext  `json:"context"`
	Lineage   RecordLineage  `json:"lineage"`
}

// NewContextualRecord creates a ContextualRecord with a new UUID and
// the ingestion timestamp set to now.
func NewContextualRecord(source RecordSource, ts RecordTimestamp, value RecordValue, lineage RecordLineage) ContextualRecord {
	if ts.IngestionTime.IsZero() {
		ts.IngestionTime = time.Now().UTC()
	}
	return ContextualRecord{
		RecordID:  uuid.New(),
		Source:    source,
		Timestamp: ts,
		Value:     value,
		Context:   RecordContext{},
		Lineage:   lineage,
	}
}
