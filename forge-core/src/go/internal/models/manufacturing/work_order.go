package manufacturing

import "time"

// DefaultDependencyType is the relationship of a dependency whose source named
// none, as the Python model defaults it. Dependency type is free text (the
// source's vocabulary: BLOCKS, RELATED, ...), not an enumeration.
const DefaultDependencyType = "BLOCKS"

// WorkOrderDependency represents a dependency between two work orders.
type WorkOrderDependency struct {
	ManufacturingModelBase
	DependentOrderID    string `json:"dependent_order_id"`
	PrerequisiteOrderID string `json:"prerequisite_order_id"`
	DependencyType      string `json:"dependency_type"`
}

// NewWorkOrderDependency returns a WorkOrderDependency with the Python model's
// defaults: a new ForgeID, CapturedAt now and DependencyType
// DefaultDependencyType.
func NewWorkOrderDependency(sourceSystem, sourceID, dependentOrderID, prerequisiteOrderID string) WorkOrderDependency {
	return WorkOrderDependency{
		ManufacturingModelBase: NewBase(sourceSystem, sourceID),
		DependentOrderID:       dependentOrderID,
		PrerequisiteOrderID:    prerequisiteOrderID,
		DependencyType:         DefaultDependencyType,
	}
}

// Validate reports the required fields that are empty.
func (d WorkOrderDependency) Validate() error {
	v := d.check("WorkOrderDependency")
	v.required("dependent_order_id", d.DependentOrderID)
	v.required("prerequisite_order_id", d.PrerequisiteOrderID)
	return v.err()
}

// WorkOrder is an assignable unit of work with priority and scheduling.
type WorkOrder struct {
	ManufacturingModelBase
	Title              string            `json:"title"`
	OrderType          string            `json:"order_type"`
	Status             WorkOrderStatus   `json:"status"`
	Priority           WorkOrderPriority `json:"priority"`
	ParentID           string            `json:"parent_id,omitempty"`
	AssignedAssetID    string            `json:"assigned_asset_id,omitempty"`
	AssignedOperatorID string            `json:"assigned_operator_id,omitempty"`
	PlannedStart       *time.Time        `json:"planned_start,omitempty"`
	PlannedEnd         *time.Time        `json:"planned_end,omitempty"`
	ActualStart        *time.Time        `json:"actual_start,omitempty"`
	ActualEnd          *time.Time        `json:"actual_end,omitempty"`
	ProductionOrderID  string            `json:"production_order_id,omitempty"`
	LotID              string            `json:"lot_id,omitempty"`
}

// NewWorkOrder returns a WorkOrder with the Python model's defaults: a new
// ForgeID, CapturedAt now, Status WorkOrderStatusPending and Priority
// WorkOrderPriorityNormal.
func NewWorkOrder(sourceSystem, sourceID, title, orderType string) WorkOrder {
	return WorkOrder{
		ManufacturingModelBase: NewBase(sourceSystem, sourceID),
		Title:                  title,
		OrderType:              orderType,
		Status:                 WorkOrderStatusPending,
		Priority:               WorkOrderPriorityNormal,
	}
}

// Validate reports the required fields that are empty and the status or
// priority outside its enumeration.
func (w WorkOrder) Validate() error {
	v := w.check("WorkOrder")
	v.required("title", w.Title)
	v.required("order_type", w.OrderType)
	v.enum("status", string(w.Status), w.Status.Valid(), "WorkOrderStatus")
	v.enum("priority", string(w.Priority), w.Priority.Valid(), "WorkOrderPriority")
	return v.err()
}
