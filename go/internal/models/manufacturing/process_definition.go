package manufacturing

// ProcessStep is a single step within a process definition.
// Steps may be nested via ParentStepID to represent ISA-88 procedural hierarchies.
type ProcessStep struct {
	ManufacturingModelBase
	StepNumber      int            `json:"step_number"`
	Name            string         `json:"name"`
	StepType        string         `json:"step_type,omitempty"`
	ParentStepID    string         `json:"parent_step_id,omitempty"`
	DurationMinutes *float64       `json:"duration_minutes,omitempty"`
	Parameters      map[string]any `json:"parameters,omitempty"`
	Description     string         `json:"description,omitempty"`
}

// ProcessDefinition is a recipe, protocol, or procedure for making something.
type ProcessDefinition struct {
	ManufacturingModelBase
	Name             string                   `json:"name"`
	Version          string                   `json:"version,omitempty"`
	ProductType      string                   `json:"product_type,omitempty"`
	IsPublished      bool                     `json:"is_published"`
	CustomerID       string                   `json:"customer_id,omitempty"`
	Steps            []ProcessStep            `json:"steps,omitempty"`
	Parameters       map[string]any           `json:"parameters,omitempty"`
	BillOfMaterials  []map[string]any         `json:"bill_of_materials,omitempty"`
	Description      string                   `json:"description,omitempty"`
}
