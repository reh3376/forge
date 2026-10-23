package manufacturing

// MaterialItem is a material, component, or finished good.
// Items are master data describing WHAT something is.
type MaterialItem struct {
	ManufacturingModelBase
	ItemNumber    string            `json:"item_number"`
	Name          string            `json:"name"`
	Description   string            `json:"description,omitempty"`
	Category      string            `json:"category,omitempty"`
	UnitOfMeasure string            `json:"unit_of_measure,omitempty"`
	VendorID      string            `json:"vendor_id,omitempty"`
	ExternalIDs   map[string]string `json:"external_ids,omitempty"`
	IsActive      bool              `json:"is_active"`
}

// NewMaterialItem returns a MaterialItem with the Python model's defaults: a
// new ForgeID, CapturedAt now and IsActive true.
func NewMaterialItem(sourceSystem, sourceID, itemNumber, name string) MaterialItem {
	return MaterialItem{
		ManufacturingModelBase: NewBase(sourceSystem, sourceID),
		ItemNumber:             itemNumber,
		Name:                   name,
		IsActive:               true,
	}
}

// Validate reports the required fields that are empty.
func (m MaterialItem) Validate() error {
	v := m.check("MaterialItem")
	v.required("item_number", m.ItemNumber)
	v.required("name", m.Name)
	return v.err()
}
