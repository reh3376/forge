// Package manufacturing defines canonical manufacturing domain entities.
//
// These types are the Go equivalents of the Python models in
// src/forge/core/models/manufacturing/. Adapters map source-system-specific
// values to these canonical types during ingestion.
package manufacturing

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

// -- Operational Event --

// EventSeverity indicates event severity level.
type EventSeverity string

const (
	EventSeverityInfo     EventSeverity = "INFO"
	EventSeverityWarning  EventSeverity = "WARNING"
	EventSeverityError    EventSeverity = "ERROR"
	EventSeverityCritical EventSeverity = "CRITICAL"
)

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

// -- Business Entity --

// EntityType classifies business entities.
type EntityType string

const (
	EntityTypeCustomer EntityType = "CUSTOMER"
	EntityTypeVendor   EntityType = "VENDOR"
	EntityTypePartner  EntityType = "PARTNER"
	EntityTypeInternal EntityType = "INTERNAL"
)

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

// WorkOrderPriority indicates work order priority level.
type WorkOrderPriority string

const (
	WorkOrderPriorityLow    WorkOrderPriority = "LOW"
	WorkOrderPriorityNormal WorkOrderPriority = "NORMAL"
	WorkOrderPriorityHigh   WorkOrderPriority = "HIGH"
	WorkOrderPriorityUrgent WorkOrderPriority = "URGENT"
)

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

// -- Quality --

// SampleOutcome is the result of a quality sample evaluation.
type SampleOutcome string

const (
	SampleOutcomePass         SampleOutcome = "PASS"
	SampleOutcomeFail         SampleOutcome = "FAIL"
	SampleOutcomeInconclusive SampleOutcome = "INCONCLUSIVE"
	SampleOutcomePending      SampleOutcome = "PENDING"
)
