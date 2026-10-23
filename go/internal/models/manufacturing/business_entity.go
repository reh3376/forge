package manufacturing

// BusinessEntity represents an external party: customer, vendor, or partner.
type BusinessEntity struct {
	ManufacturingModelBase
	EntityType  EntityType        `json:"entity_type"`
	Name        string            `json:"name"`
	ParentID    string            `json:"parent_id,omitempty"`
	ExternalIDs map[string]string `json:"external_ids,omitempty"`
	ContactInfo map[string]string `json:"contact_info,omitempty"`
	Location    string            `json:"location,omitempty"`
	IsActive    bool              `json:"is_active"`
}

// NewBusinessEntity returns a BusinessEntity with the Python model's defaults:
// a new ForgeID, CapturedAt now and IsActive true.
func NewBusinessEntity(sourceSystem, sourceID string, entityType EntityType, name string) BusinessEntity {
	return BusinessEntity{
		ManufacturingModelBase: NewBase(sourceSystem, sourceID),
		EntityType:             entityType,
		Name:                   name,
		IsActive:               true,
	}
}

// Validate reports the required fields that are empty and an entity type
// outside the enumeration.
func (e BusinessEntity) Validate() error {
	v := e.check("BusinessEntity")
	v.enum("entity_type", string(e.EntityType), e.EntityType.Valid(), "EntityType")
	v.required("name", e.Name)
	return v.err()
}
