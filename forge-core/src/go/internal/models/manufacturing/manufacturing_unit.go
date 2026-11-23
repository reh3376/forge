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

// NewManufacturingUnit returns a ManufacturingUnit with the Python model's
// defaults: a new ForgeID, CapturedAt now and Status UnitStatusPending.
func NewManufacturingUnit(sourceSystem, sourceID, unitType string) ManufacturingUnit {
	return ManufacturingUnit{
		ManufacturingModelBase: NewBase(sourceSystem, sourceID),
		UnitType:               unitType,
		Status:                 UnitStatusPending,
	}
}

// Validate reports the required fields that are empty and the status or
// lifecycle state outside its enumeration.
func (u ManufacturingUnit) Validate() error {
	v := u.check("ManufacturingUnit")
	v.required("unit_type", u.UnitType)
	v.enum("status", string(u.Status), u.Status.Valid(), "UnitStatus")
	if u.LifecycleState != nil {
		v.enum("lifecycle_state", string(*u.LifecycleState), u.LifecycleState.Valid(), "LifecycleState")
	}
	return v.err()
}
