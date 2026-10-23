package manufacturing

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ManufacturingModelBase provides four fields shared by every manufacturing
// domain entity: a Forge-internal UUID, source system identity, capture
// timestamp, and extensible metadata.
type ManufacturingModelBase struct {
	ForgeID      uuid.UUID      `json:"forge_id"`
	SourceSystem string         `json:"source_system"`
	SourceID     string         `json:"source_id"`
	CapturedAt   time.Time      `json:"captured_at"`
	Metadata     map[string]any `json:"metadata,omitempty"`
}

// NewBase creates a ManufacturingModelBase with a new UUID and CapturedAt set to now.
func NewBase(sourceSystem, sourceID string) ManufacturingModelBase {
	return ManufacturingModelBase{
		ForgeID:      uuid.New(),
		SourceSystem: sourceSystem,
		SourceID:     sourceID,
		CapturedAt:   time.Now().UTC(),
	}
}

// ValidationError lists everything that keeps an entity from being valid: the
// required fields that are empty, the enum fields holding a value outside their
// enumeration, and the same for nested entities (steps, results). It reports
// what the Python model refuses at construction, so a Go producer can refuse
// the same record before it reaches the hub (FB-016).
type ValidationError struct {
	Entity   string
	Problems []string
}

func (e *ValidationError) Error() string {
	return e.Entity + ": " + strings.Join(e.Problems, "; ")
}

// validator collects the problems of one entity.
type validator struct {
	entity   string
	problems []string
}

// check starts validating an entity with the fields every entity carries: the
// Python model generates forge_id and captured_at and requires source_system
// and source_id, so none of them may be empty.
func (b ManufacturingModelBase) check(entity string) *validator {
	v := &validator{entity: entity}
	if b.ForgeID == uuid.Nil {
		v.problems = append(v.problems, "missing forge_id")
	}
	v.required("source_system", b.SourceSystem)
	v.required("source_id", b.SourceID)
	v.requiredTime("captured_at", b.CapturedAt)
	return v
}

func (v *validator) required(name, value string) {
	if value == "" {
		v.problems = append(v.problems, "missing "+name)
	}
}

func (v *validator) requiredTime(name string, value time.Time) {
	if value.IsZero() {
		v.problems = append(v.problems, "missing "+name)
	}
}

// enum records value when it is not a member of enumeration.
func (v *validator) enum(name, value string, valid bool, enumeration string) {
	if !valid {
		v.problems = append(v.problems, fmt.Sprintf("%s %q is not a %s", name, value, enumeration))
	}
}

// nested folds a child entity's problems in under a prefix such as steps[0].
func (v *validator) nested(prefix string, err error) {
	if err == nil {
		return
	}
	var child *ValidationError
	if errors.As(err, &child) {
		for _, problem := range child.Problems {
			v.problems = append(v.problems, prefix+": "+problem)
		}
		return
	}
	v.problems = append(v.problems, prefix+": "+err.Error())
}

func (v *validator) err() error {
	if len(v.problems) == 0 {
		return nil
	}
	return &ValidationError{Entity: v.entity, Problems: v.problems}
}
