package manufacturing

// ManufacturingUnit is a discrete, trackable container of product
// (barrel, batch, tank). Adapters set UnitType to the source concept name.
type ManufacturingUnit struct {
	ManufacturingModelBase
	UnitType       string          `json:"unit_type"`
	SerialNumber   string          `json:"serial_number,omitempty"`
	LotID          string          `json:"lot_id,omitempty"`
	LocationID     string          `json:"location_id,omitempty"`
	OwnerID        string          `json:"owner_id,omitempty"`
	RecipeID       string          `json:"recipe_id,omitempty"`
	Status         UnitStatus      `json:"status"`
	LifecycleState *LifecycleState `json:"lifecycle_state,omitempty"`
	Quantity       *float64        `json:"quantity,omitempty"`
	UnitOfMeasure  string          `json:"unit_of_measure,omitempty"`
	ProductType    string          `json:"product_type,omitempty"`
}
