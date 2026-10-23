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

// NewPhysicalAsset returns a PhysicalAsset with the Python model's defaults:
// a new ForgeID and CapturedAt now.
func NewPhysicalAsset(sourceSystem, sourceID string, assetType AssetType, name string) PhysicalAsset {
	return PhysicalAsset{
		ManufacturingModelBase: NewBase(sourceSystem, sourceID),
		AssetType:              assetType,
		Name:                   name,
	}
}

// Validate reports the required fields that are empty and the asset type or
// operational state outside its enumeration.
func (a PhysicalAsset) Validate() error {
	v := a.check("PhysicalAsset")
	v.enum("asset_type", string(a.AssetType), a.AssetType.Valid(), "AssetType")
	v.required("name", a.Name)
	if a.OperationalState != nil {
		v.enum("operational_state", string(*a.OperationalState), a.OperationalState.Valid(), "AssetOperationalState")
	}
	return v.err()
}
