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
