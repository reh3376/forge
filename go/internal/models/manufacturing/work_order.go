package manufacturing

import "time"

// WorkOrderDependency represents a dependency between two work orders.
type WorkOrderDependency struct {
	ManufacturingModelBase
	DependentOrderID     string `json:"dependent_order_id"`
	PrerequisiteOrderID  string `json:"prerequisite_order_id"`
	DependencyType       string `json:"dependency_type"`
}

// WorkOrder is an assignable unit of work with priority and scheduling.
type WorkOrder struct {
	ManufacturingModelBase
	Title               string          `json:"title"`
	OrderType           string          `json:"order_type"`
	Status              WorkOrderStatus `json:"status"`
	Priority            WorkOrderPriority `json:"priority"`
	ParentID            string          `json:"parent_id,omitempty"`
	AssignedAssetID     string          `json:"assigned_asset_id,omitempty"`
	AssignedOperatorID  string          `json:"assigned_operator_id,omitempty"`
	PlannedStart        *time.Time      `json:"planned_start,omitempty"`
	PlannedEnd          *time.Time      `json:"planned_end,omitempty"`
	ActualStart         *time.Time      `json:"actual_start,omitempty"`
	ActualEnd           *time.Time      `json:"actual_end,omitempty"`
	ProductionOrderID   string          `json:"production_order_id,omitempty"`
	LotID               string          `json:"lot_id,omitempty"`
}
