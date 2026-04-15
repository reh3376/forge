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
