package manufacturing

import "time"

// ProductionOrder authorizes the manufacturing of a specific product.
type ProductionOrder struct {
	ManufacturingModelBase
	OrderNumber     string      `json:"order_number"`
	RecipeID        string      `json:"recipe_id,omitempty"`
	CustomerID      string      `json:"customer_id,omitempty"`
	Status          OrderStatus `json:"status"`
	ProductType     string      `json:"product_type,omitempty"`
	PlannedQuantity *float64    `json:"planned_quantity,omitempty"`
	ActualQuantity  *float64    `json:"actual_quantity,omitempty"`
	UnitOfMeasure   string      `json:"unit_of_measure,omitempty"`
	PlannedStart    *time.Time  `json:"planned_start,omitempty"`
	PlannedEnd      *time.Time  `json:"planned_end,omitempty"`
	ActualStart     *time.Time  `json:"actual_start,omitempty"`
	ActualEnd       *time.Time  `json:"actual_end,omitempty"`
	LotIDs          []string    `json:"lot_ids,omitempty"`
	Priority        *int        `json:"priority,omitempty"`
}
