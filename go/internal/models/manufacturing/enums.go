// Package manufacturing defines canonical manufacturing domain entities.
//
// These types are the Go equivalents of the Python models in
// src/forge/core/models/manufacturing/. Adapters map source-system-specific
// values to these canonical types during ingestion.
//
// Every enumeration lists its members through a Values function, in the
// Python enum's order, and reports membership through Valid; the parity test
// holds the members equal to the Python enum's (FB-016).
package manufacturing

import "slices"

// -- Manufacturing Unit --

// UnitStatus is the lifecycle status of a manufacturing unit.
type UnitStatus string

const (
	UnitStatusPending     UnitStatus = "PENDING"
	UnitStatusActive      UnitStatus = "ACTIVE"
	UnitStatusComplete    UnitStatus = "COMPLETE"
	UnitStatusHeld        UnitStatus = "HELD"
	UnitStatusScrapped    UnitStatus = "SCRAPPED"
	UnitStatusTransferred UnitStatus = "TRANSFERRED"
)

// UnitStatusValues lists the enumeration's members in the Python enum's order.
func UnitStatusValues() []UnitStatus {
	return []UnitStatus{
		UnitStatusPending,
		UnitStatusActive,
		UnitStatusComplete,
		UnitStatusHeld,
		UnitStatusScrapped,
		UnitStatusTransferred,
	}
}

// Valid reports whether the value is a member of the enumeration.
func (v UnitStatus) Valid() bool { return slices.Contains(UnitStatusValues(), v) }

// LifecycleState is a granular lifecycle phase within a manufacturing unit's journey.
type LifecycleState string

const (
	LifecycleCreated   LifecycleState = "CREATED"
	LifecycleFilling   LifecycleState = "FILLING"
	LifecycleInProcess LifecycleState = "IN_PROCESS"
	LifecycleAging     LifecycleState = "AGING"
	LifecycleInStorage LifecycleState = "IN_STORAGE"
	LifecycleInTransit LifecycleState = "IN_TRANSIT"
	LifecycleSampling  LifecycleState = "SAMPLING"
	LifecycleWithdrawn LifecycleState = "WITHDRAWN"
	LifecycleDumped    LifecycleState = "DUMPED"
	LifecycleComplete  LifecycleState = "COMPLETE"
)

// LifecycleStateValues lists the enumeration's members in the Python enum's order.
func LifecycleStateValues() []LifecycleState {
	return []LifecycleState{
		LifecycleCreated,
		LifecycleFilling,
		LifecycleInProcess,
		LifecycleAging,
		LifecycleInStorage,
		LifecycleInTransit,
		LifecycleSampling,
		LifecycleWithdrawn,
		LifecycleDumped,
		LifecycleComplete,
	}
}

// Valid reports whether the value is a member of the enumeration.
func (v LifecycleState) Valid() bool { return slices.Contains(LifecycleStateValues(), v) }

// -- Physical Asset --

// AssetType classifies physical assets in the ISA-95 hierarchy.
type AssetType string

const (
	AssetTypeEnterprise      AssetType = "ENTERPRISE"
	AssetTypeSite            AssetType = "SITE"
	AssetTypeArea            AssetType = "AREA"
	AssetTypeWorkCenter      AssetType = "WORK_CENTER"
	AssetTypeWorkUnit        AssetType = "WORK_UNIT"
	AssetTypeStorageZone     AssetType = "STORAGE_ZONE"
	AssetTypeStoragePosition AssetType = "STORAGE_POSITION"
	AssetTypeEquipment       AssetType = "EQUIPMENT"
	AssetTypeStagingArea     AssetType = "STAGING_AREA"
)

// AssetTypeValues lists the enumeration's members in the Python enum's order.
func AssetTypeValues() []AssetType {
	return []AssetType{
		AssetTypeEnterprise,
		AssetTypeSite,
		AssetTypeArea,
		AssetTypeWorkCenter,
		AssetTypeWorkUnit,
		AssetTypeStorageZone,
		AssetTypeStoragePosition,
		AssetTypeEquipment,
		AssetTypeStagingArea,
	}
}

// Valid reports whether the value is a member of the enumeration.
func (v AssetType) Valid() bool { return slices.Contains(AssetTypeValues(), v) }

// AssetOperationalState is the current operational state of an asset.
type AssetOperationalState string

const (
	AssetStateIdle        AssetOperationalState = "IDLE"
	AssetStateRunning     AssetOperationalState = "RUNNING"
	AssetStateMaintenance AssetOperationalState = "MAINTENANCE"
	AssetStateChangeover  AssetOperationalState = "CHANGEOVER"
	AssetStateOffline     AssetOperationalState = "OFFLINE"
	AssetStateFaulted     AssetOperationalState = "FAULTED"
)

// AssetOperationalStateValues lists the enumeration's members in the Python enum's order.
func AssetOperationalStateValues() []AssetOperationalState {
	return []AssetOperationalState{
		AssetStateIdle,
		AssetStateRunning,
		AssetStateMaintenance,
		AssetStateChangeover,
		AssetStateOffline,
		AssetStateFaulted,
	}
}

// Valid reports whether the value is a member of the enumeration.
func (v AssetOperationalState) Valid() bool { return slices.Contains(AssetOperationalStateValues(), v) }

// -- Operational Event --

// EventSeverity indicates event severity level.
type EventSeverity string

const (
	EventSeverityInfo     EventSeverity = "INFO"
	EventSeverityWarning  EventSeverity = "WARNING"
	EventSeverityError    EventSeverity = "ERROR"
	EventSeverityCritical EventSeverity = "CRITICAL"
)

// EventSeverityValues lists the enumeration's members in the Python enum's order.
func EventSeverityValues() []EventSeverity {
	return []EventSeverity{
		EventSeverityInfo,
		EventSeverityWarning,
		EventSeverityError,
		EventSeverityCritical,
	}
}

// Valid reports whether the value is a member of the enumeration.
func (v EventSeverity) Valid() bool { return slices.Contains(EventSeverityValues(), v) }

// EventCategory classifies operational events at a high level.
type EventCategory string

const (
	EventCategoryProduction  EventCategory = "PRODUCTION"
	EventCategoryQuality     EventCategory = "QUALITY"
	EventCategoryLogistics   EventCategory = "LOGISTICS"
	EventCategoryMaintenance EventCategory = "MAINTENANCE"
	EventCategorySafety      EventCategory = "SAFETY"
	EventCategoryCompliance  EventCategory = "COMPLIANCE"
)

// EventCategoryValues lists the enumeration's members in the Python enum's order.
func EventCategoryValues() []EventCategory {
	return []EventCategory{
		EventCategoryProduction,
		EventCategoryQuality,
		EventCategoryLogistics,
		EventCategoryMaintenance,
		EventCategorySafety,
		EventCategoryCompliance,
	}
}

// Valid reports whether the value is a member of the enumeration.
func (v EventCategory) Valid() bool { return slices.Contains(EventCategoryValues(), v) }

// -- Business Entity --

// EntityType classifies business entities.
type EntityType string

const (
	EntityTypeCustomer EntityType = "CUSTOMER"
	EntityTypeVendor   EntityType = "VENDOR"
	EntityTypePartner  EntityType = "PARTNER"
	EntityTypeInternal EntityType = "INTERNAL"
)

// EntityTypeValues lists the enumeration's members in the Python enum's order.
func EntityTypeValues() []EntityType {
	return []EntityType{
		EntityTypeCustomer,
		EntityTypeVendor,
		EntityTypePartner,
		EntityTypeInternal,
	}
}

// Valid reports whether the value is a member of the enumeration.
func (v EntityType) Valid() bool { return slices.Contains(EntityTypeValues(), v) }

// -- Work Order --

// WorkOrderStatus tracks work order lifecycle.
type WorkOrderStatus string

const (
	WorkOrderStatusDraft      WorkOrderStatus = "DRAFT"
	WorkOrderStatusPending    WorkOrderStatus = "PENDING"
	WorkOrderStatusScheduled  WorkOrderStatus = "SCHEDULED"
	WorkOrderStatusInProgress WorkOrderStatus = "IN_PROGRESS"
	WorkOrderStatusPaused     WorkOrderStatus = "PAUSED"
	WorkOrderStatusComplete   WorkOrderStatus = "COMPLETE"
	WorkOrderStatusCancelled  WorkOrderStatus = "CANCELLED"
)

// WorkOrderStatusValues lists the enumeration's members in the Python enum's order.
func WorkOrderStatusValues() []WorkOrderStatus {
	return []WorkOrderStatus{
		WorkOrderStatusDraft,
		WorkOrderStatusPending,
		WorkOrderStatusScheduled,
		WorkOrderStatusInProgress,
		WorkOrderStatusPaused,
		WorkOrderStatusComplete,
		WorkOrderStatusCancelled,
	}
}

// Valid reports whether the value is a member of the enumeration.
func (v WorkOrderStatus) Valid() bool { return slices.Contains(WorkOrderStatusValues(), v) }

// WorkOrderPriority indicates work order priority level.
type WorkOrderPriority string

const (
	WorkOrderPriorityLow    WorkOrderPriority = "LOW"
	WorkOrderPriorityNormal WorkOrderPriority = "NORMAL"
	WorkOrderPriorityHigh   WorkOrderPriority = "HIGH"
	WorkOrderPriorityUrgent WorkOrderPriority = "URGENT"
)

// WorkOrderPriorityValues lists the enumeration's members in the Python enum's order.
func WorkOrderPriorityValues() []WorkOrderPriority {
	return []WorkOrderPriority{
		WorkOrderPriorityLow,
		WorkOrderPriorityNormal,
		WorkOrderPriorityHigh,
		WorkOrderPriorityUrgent,
	}
}

// Valid reports whether the value is a member of the enumeration.
func (v WorkOrderPriority) Valid() bool { return slices.Contains(WorkOrderPriorityValues(), v) }

// -- Production Order --

// OrderStatus tracks production order lifecycle.
type OrderStatus string

const (
	OrderStatusDraft      OrderStatus = "DRAFT"
	OrderStatusPlanned    OrderStatus = "PLANNED"
	OrderStatusReleased   OrderStatus = "RELEASED"
	OrderStatusInProgress OrderStatus = "IN_PROGRESS"
	OrderStatusPaused     OrderStatus = "PAUSED"
	OrderStatusComplete   OrderStatus = "COMPLETE"
	OrderStatusClosed     OrderStatus = "CLOSED"
	OrderStatusCancelled  OrderStatus = "CANCELLED"
)

// OrderStatusValues lists the enumeration's members in the Python enum's order.
func OrderStatusValues() []OrderStatus {
	return []OrderStatus{
		OrderStatusDraft,
		OrderStatusPlanned,
		OrderStatusReleased,
		OrderStatusInProgress,
		OrderStatusPaused,
		OrderStatusComplete,
		OrderStatusClosed,
		OrderStatusCancelled,
	}
}

// Valid reports whether the value is a member of the enumeration.
func (v OrderStatus) Valid() bool { return slices.Contains(OrderStatusValues(), v) }

// -- Quality --

// SampleOutcome is the result of a quality sample evaluation.
type SampleOutcome string

const (
	SampleOutcomePass         SampleOutcome = "PASS"
	SampleOutcomeFail         SampleOutcome = "FAIL"
	SampleOutcomeInconclusive SampleOutcome = "INCONCLUSIVE"
	SampleOutcomePending      SampleOutcome = "PENDING"
)

// SampleOutcomeValues lists the enumeration's members in the Python enum's order.
func SampleOutcomeValues() []SampleOutcome {
	return []SampleOutcome{
		SampleOutcomePass,
		SampleOutcomeFail,
		SampleOutcomeInconclusive,
		SampleOutcomePending,
	}
}

// Valid reports whether the value is a member of the enumeration.
func (v SampleOutcome) Valid() bool { return slices.Contains(SampleOutcomeValues(), v) }
