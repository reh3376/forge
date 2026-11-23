package manufacturing

import "fmt"

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

// NewProcessStep returns a ProcessStep with the Python model's defaults: a new
// ForgeID and CapturedAt now.
func NewProcessStep(sourceSystem, sourceID string, stepNumber int, name string) ProcessStep {
	return ProcessStep{
		ManufacturingModelBase: NewBase(sourceSystem, sourceID),
		StepNumber:             stepNumber,
		Name:                   name,
	}
}

// Validate reports the required fields that are empty. The Python model
// requires step_number to be given; zero is a value there, so it is not
// checked here.
func (s ProcessStep) Validate() error {
	v := s.check("ProcessStep")
	v.required("name", s.Name)
	return v.err()
}

// ProcessDefinition is a recipe, protocol, or procedure for making something.
type ProcessDefinition struct {
	ManufacturingModelBase
	Name            string           `json:"name"`
	Version         string           `json:"version,omitempty"`
	ProductType     string           `json:"product_type,omitempty"`
	IsPublished     bool             `json:"is_published"`
	CustomerID      string           `json:"customer_id,omitempty"`
	Steps           []ProcessStep    `json:"steps,omitempty"`
	Parameters      map[string]any   `json:"parameters,omitempty"`
	BillOfMaterials []map[string]any `json:"bill_of_materials,omitempty"`
	Description     string           `json:"description,omitempty"`
}

// NewProcessDefinition returns a ProcessDefinition with the Python model's
// defaults: a new ForgeID, CapturedAt now and IsPublished false.
func NewProcessDefinition(sourceSystem, sourceID, name string) ProcessDefinition {
	return ProcessDefinition{
		ManufacturingModelBase: NewBase(sourceSystem, sourceID),
		Name:                   name,
	}
}

// Validate reports the required fields that are empty, on the definition and
// on each of its steps.
func (d ProcessDefinition) Validate() error {
	v := d.check("ProcessDefinition")
	v.required("name", d.Name)
	for i, step := range d.Steps {
		v.nested(fmt.Sprintf("steps[%d]", i), step.Validate())
	}
	return v.err()
}
