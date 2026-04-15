package manufacturing

// PhysicalAsset represents a location or piece of equipment in the
// ISA-95 manufacturing hierarchy.
type PhysicalAsset struct {
	ManufacturingModelBase
	AssetType        AssetType              `json:"asset_type"`
	Name             string                 `json:"name"`
	ParentID         string                 `json:"parent_id,omitempty"`
	LocationPath     string                 `json:"location_path,omitempty"`
	OperationalState *AssetOperationalState `json:"operational_state,omitempty"`
	Capacity         *float64               `json:"capacity,omitempty"`
	CapacityUnit     string                 `json:"capacity_unit,omitempty"`
}
