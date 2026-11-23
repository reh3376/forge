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

// NewOperationalEvent returns an OperationalEvent with the Python model's
// defaults: a new ForgeID, CapturedAt now and Severity EventSeverityInfo.
func NewOperationalEvent(sourceSystem, sourceID, eventType, entityType, entityID string, eventTime time.Time) OperationalEvent {
	return OperationalEvent{
		ManufacturingModelBase: NewBase(sourceSystem, sourceID),
		EventType:              eventType,
		Severity:               EventSeverityInfo,
		EntityType:             entityType,
		EntityID:               entityID,
		EventTime:              eventTime,
	}
}

// Validate reports the required fields that are empty and the severity or
// category outside its enumeration.
func (e OperationalEvent) Validate() error {
	v := e.check("OperationalEvent")
	v.required("event_type", e.EventType)
	if e.Category != nil {
		v.enum("category", string(*e.Category), e.Category.Valid(), "EventCategory")
	}
	v.enum("severity", string(e.Severity), e.Severity.Valid(), "EventSeverity")
	v.required("entity_type", e.EntityType)
	v.required("entity_id", e.EntityID)
	v.requiredTime("event_time", e.EventTime)
	return v.err()
}
