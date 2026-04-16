package manufacturing

import "time"

// OperationalEvent is an immutable record of something that happened
// in the manufacturing process. Events form the audit trail.
type OperationalEvent struct {
	ManufacturingModelBase
	EventType    string         `json:"event_type"`
	EventSubtype string         `json:"event_subtype,omitempty"`
	Category     *EventCategory `json:"category,omitempty"`
	Severity     EventSeverity  `json:"severity"`
	EntityType   string         `json:"entity_type"`
	EntityID     string         `json:"entity_id"`
	AssetID      string         `json:"asset_id,omitempty"`
	OperatorID   string         `json:"operator_id,omitempty"`
	EventTime    time.Time      `json:"event_time"`
	Result       string         `json:"result,omitempty"`
	WorkOrderID  string         `json:"work_order_id,omitempty"`
}
