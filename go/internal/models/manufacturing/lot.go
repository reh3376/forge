package manufacturing

// Lot groups manufacturing units that share a common production origin.
// Lots are the primary unit of traceability in manufacturing.
type Lot struct {
	ManufacturingModelBase
	LotNumber         string   `json:"lot_number"`
	ProductType       string   `json:"product_type,omitempty"`
	ItemID            string   `json:"item_id,omitempty"` // the MaterialItem the lot is a quantity of, by source_id (FB-010)
	RecipeID          string   `json:"recipe_id,omitempty"`
	ProductionOrderID string   `json:"production_order_id,omitempty"`
	CustomerID        string   `json:"customer_id,omitempty"`
	Status            string   `json:"status"`
	Quantity          *float64 `json:"quantity,omitempty"`
	UnitOfMeasure     string   `json:"unit_of_measure,omitempty"`
	ParentLotID       string   `json:"parent_lot_id,omitempty"`
	UnitCount         *int     `json:"unit_count,omitempty"`
}
