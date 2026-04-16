package manufacturing

import (
	"time"

	"github.com/google/uuid"
)

// ManufacturingModelBase provides four fields shared by every manufacturing
// domain entity: a Forge-internal UUID, source system identity, capture
// timestamp, and extensible metadata.
type ManufacturingModelBase struct {
	ForgeID      uuid.UUID      `json:"forge_id"`
	SourceSystem string         `json:"source_system"`
	SourceID     string         `json:"source_id"`
	CapturedAt   time.Time      `json:"captured_at"`
	Metadata     map[string]any `json:"metadata,omitempty"`
}

// NewBase creates a ManufacturingModelBase with a new UUID and CapturedAt set to now.
func NewBase(sourceSystem, sourceID string) ManufacturingModelBase {
	return ManufacturingModelBase{
		ForgeID:      uuid.New(),
		SourceSystem: sourceSystem,
		SourceID:     sourceID,
		CapturedAt:   time.Now().UTC(),
	}
}
