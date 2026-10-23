package manufacturing

// DefaultLotStatus is the status of a lot whose source reported none, as the
// Python model defaults it. Lot status is free text (the source's vocabulary),
// not an enumeration.
const DefaultLotStatus = "CREATED"

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

// NewLot returns a Lot with the Python model's defaults: a new ForgeID,
// CapturedAt now and Status DefaultLotStatus.
func NewLot(sourceSystem, sourceID, lotNumber string) Lot {
	return Lot{
		ManufacturingModelBase: NewBase(sourceSystem, sourceID),
		LotNumber:              lotNumber,
		Status:                 DefaultLotStatus,
	}
}

// Validate reports the required fields that are empty.
func (l Lot) Validate() error {
	v := l.check("Lot")
	v.required("lot_number", l.LotNumber)
	return v.err()
}
