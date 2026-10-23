package manufacturing_test

// The Go models mirror the Python ones in src/forge/core/models/manufacturing.
// testdata/python_models.json is written from the Python models by
// tests/core/models/test_go_parity.py (python -m tests.core.models.test_go_parity)
// and holds every enum's members and, per model, its field list, the fields
// Python requires, the fields that default to None, a minimal instance (the
// required values only, so it shows the Python defaults) and a full one. The
// tests here read it; the Python suite holds it equal to the models (FB-016).
// Python emits empty containers ({} and []) where Go omits them, so documents
// are compared without them.

import (
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	mfg "github.com/reh3376/forge/internal/models/manufacturing"
)

type pythonModel struct {
	Fields   []string       `json:"fields"`
	Required []string       `json:"required"`
	Optional []string       `json:"optional"`
	Minimal  map[string]any `json:"minimal"`
	Full     map[string]any `json:"full"`
}

type pythonFixture struct {
	Enums  map[string][]string    `json:"enums"`
	Models map[string]pythonModel `json:"models"`
}

func loadFixture(t *testing.T) pythonFixture {
	t.Helper()
	data, err := os.ReadFile("testdata/python_models.json")
	if err != nil {
		t.Fatalf("fixture: %v", err)
	}
	var fixture pythonFixture
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatalf("fixture: %v", err)
	}
	return fixture
}

type validatable interface{ Validate() error }

// entity is the Go side of one Python model: a pointer to a zero value to
// unmarshal into, and the constructor called with the minimal document's
// required values.
type entity struct {
	zero      func() validatable
	construct func(t *testing.T, given map[string]any) validatable
}

func str(m map[string]any, key string) string {
	s, _ := m[key].(string)
	return s
}

func when(t *testing.T, m map[string]any, key string) time.Time {
	t.Helper()
	parsed, err := time.Parse(time.RFC3339, str(m, key))
	if err != nil {
		t.Fatalf("%s: %v", key, err)
	}
	return parsed
}

var entities = map[string]entity{
	"BusinessEntity": {
		zero: func() validatable { return &mfg.BusinessEntity{} },
		construct: func(t *testing.T, g map[string]any) validatable {
			return mfg.NewBusinessEntity(str(g, "source_system"), str(g, "source_id"), mfg.EntityType(str(g, "entity_type")), str(g, "name"))
		},
	},
	"Lot": {
		zero: func() validatable { return &mfg.Lot{} },
		construct: func(t *testing.T, g map[string]any) validatable {
			return mfg.NewLot(str(g, "source_system"), str(g, "source_id"), str(g, "lot_number"))
		},
	},
	"ManufacturingUnit": {
		zero: func() validatable { return &mfg.ManufacturingUnit{} },
		construct: func(t *testing.T, g map[string]any) validatable {
			return mfg.NewManufacturingUnit(str(g, "source_system"), str(g, "source_id"), str(g, "unit_type"))
		},
	},
	"MaterialItem": {
		zero: func() validatable { return &mfg.MaterialItem{} },
		construct: func(t *testing.T, g map[string]any) validatable {
			return mfg.NewMaterialItem(str(g, "source_system"), str(g, "source_id"), str(g, "item_number"), str(g, "name"))
		},
	},
	"OperationalEvent": {
		zero: func() validatable { return &mfg.OperationalEvent{} },
		construct: func(t *testing.T, g map[string]any) validatable {
			return mfg.NewOperationalEvent(str(g, "source_system"), str(g, "source_id"), str(g, "event_type"), str(g, "entity_type"), str(g, "entity_id"), when(t, g, "event_time"))
		},
	},
	"PhysicalAsset": {
		zero: func() validatable { return &mfg.PhysicalAsset{} },
		construct: func(t *testing.T, g map[string]any) validatable {
			return mfg.NewPhysicalAsset(str(g, "source_system"), str(g, "source_id"), mfg.AssetType(str(g, "asset_type")), str(g, "name"))
		},
	},
	"ProcessStep": {
		zero: func() validatable { return &mfg.ProcessStep{} },
		construct: func(t *testing.T, g map[string]any) validatable {
			number, _ := g["step_number"].(float64)
			return mfg.NewProcessStep(str(g, "source_system"), str(g, "source_id"), int(number), str(g, "name"))
		},
	},
	"ProcessDefinition": {
		zero: func() validatable { return &mfg.ProcessDefinition{} },
		construct: func(t *testing.T, g map[string]any) validatable {
			return mfg.NewProcessDefinition(str(g, "source_system"), str(g, "source_id"), str(g, "name"))
		},
	},
	"ProductionOrder": {
		zero: func() validatable { return &mfg.ProductionOrder{} },
		construct: func(t *testing.T, g map[string]any) validatable {
			return mfg.NewProductionOrder(str(g, "source_system"), str(g, "source_id"), str(g, "order_number"))
		},
	},
	"SampleResult": {
		zero: func() validatable { return &mfg.SampleResult{} },
		construct: func(t *testing.T, g map[string]any) validatable {
			return mfg.NewSampleResult(str(g, "source_system"), str(g, "source_id"), str(g, "parameter_name"))
		},
	},
	"QualitySample": {
		zero: func() validatable { return &mfg.QualitySample{} },
		construct: func(t *testing.T, g map[string]any) validatable {
			return mfg.NewQualitySample(str(g, "source_system"), str(g, "source_id"), str(g, "sample_type"), str(g, "entity_type"), str(g, "entity_id"))
		},
	},
	"WorkOrderDependency": {
		zero: func() validatable { return &mfg.WorkOrderDependency{} },
		construct: func(t *testing.T, g map[string]any) validatable {
			return mfg.NewWorkOrderDependency(str(g, "source_system"), str(g, "source_id"), str(g, "dependent_order_id"), str(g, "prerequisite_order_id"))
		},
	},
	"WorkOrder": {
		zero: func() validatable { return &mfg.WorkOrder{} },
		construct: func(t *testing.T, g map[string]any) validatable {
			return mfg.NewWorkOrder(str(g, "source_system"), str(g, "source_id"), str(g, "title"), str(g, "order_type"))
		},
	},
}

func values[E ~string](members []E) []string {
	out := make([]string, len(members))
	for i, m := range members {
		out[i] = string(m)
	}
	return out
}

func TestEnumsMatchPython(t *testing.T) {
	got := map[string][]string{
		"UnitStatus":            values(mfg.UnitStatusValues()),
		"LifecycleState":        values(mfg.LifecycleStateValues()),
		"AssetType":             values(mfg.AssetTypeValues()),
		"AssetOperationalState": values(mfg.AssetOperationalStateValues()),
		"EventSeverity":         values(mfg.EventSeverityValues()),
		"EventCategory":         values(mfg.EventCategoryValues()),
		"EntityType":            values(mfg.EntityTypeValues()),
		"WorkOrderStatus":       values(mfg.WorkOrderStatusValues()),
		"WorkOrderPriority":     values(mfg.WorkOrderPriorityValues()),
		"OrderStatus":           values(mfg.OrderStatusValues()),
		"SampleOutcome":         values(mfg.SampleOutcomeValues()),
	}
	want := loadFixture(t).Enums
	if !reflect.DeepEqual(got, want) {
		t.Errorf("enums differ from Python:\n got %v\nwant %v", got, want)
	}
	if !mfg.UnitStatusActive.Valid() || mfg.UnitStatus("BOGUS").Valid() || mfg.UnitStatus("").Valid() {
		t.Error("Valid must hold for members only")
	}
}

// jsonTags lists a struct's JSON names in field order, embedded structs inline.
func jsonTags(t reflect.Type) []string {
	var tags []string
	for i := 0; i < t.NumField(); i++ {
		field := t.Field(i)
		if field.Anonymous {
			tags = append(tags, jsonTags(field.Type)...)
			continue
		}
		tags = append(tags, strings.Split(field.Tag.Get("json"), ",")[0])
	}
	return tags
}

// fieldByTag finds the struct field carrying a JSON name, through embedded structs.
func fieldByTag(v reflect.Value, name string) (reflect.Value, bool) {
	t := v.Type()
	for i := 0; i < t.NumField(); i++ {
		field := t.Field(i)
		if field.Anonymous {
			if found, ok := fieldByTag(v.Field(i), name); ok {
				return found, true
			}
			continue
		}
		if strings.Split(field.Tag.Get("json"), ",")[0] == name {
			return v.Field(i), true
		}
	}
	return reflect.Value{}, false
}

func TestFieldsMatchPython(t *testing.T) {
	fixture := loadFixture(t)
	for name := range fixture.Models {
		if _, ok := entities[name]; !ok {
			t.Errorf("%s: Python model without a Go entity", name)
		}
	}
	for name, e := range entities {
		model, ok := fixture.Models[name]
		if !ok {
			t.Errorf("%s: Go entity without a Python model", name)
			continue
		}
		got := jsonTags(reflect.TypeOf(e.zero()).Elem())
		if !reflect.DeepEqual(got, model.Fields) {
			t.Errorf("%s fields differ from Python (order included):\n got %v\nwant %v", name, got, model.Fields)
		}
	}
}

func withoutEmpties(v any) any {
	switch x := v.(type) {
	case map[string]any:
		out := map[string]any{}
		for key, value := range x {
			value = withoutEmpties(value)
			if isEmpty(value) {
				continue
			}
			out[key] = value
		}
		return out
	case []any:
		out := make([]any, 0, len(x))
		for _, value := range x {
			out = append(out, withoutEmpties(value))
		}
		return out
	}
	return v
}

func isEmpty(v any) bool {
	switch x := v.(type) {
	case nil:
		return true
	case map[string]any:
		return len(x) == 0
	case []any:
		return len(x) == 0
	}
	return false
}

// assertSameJSON holds a Go value's JSON equal to a Python document, empty
// containers aside.
func assertSameJSON(t *testing.T, what string, got any, want map[string]any) {
	t.Helper()
	data, err := json.Marshal(got)
	if err != nil {
		t.Fatalf("%s: marshal: %v", what, err)
	}
	var gotDoc map[string]any
	if err := json.Unmarshal(data, &gotDoc); err != nil {
		t.Fatalf("%s: unmarshal: %v", what, err)
	}
	if !reflect.DeepEqual(withoutEmpties(gotDoc), withoutEmpties(want)) {
		wantData, _ := json.Marshal(withoutEmpties(want))
		t.Errorf("%s differs from Python:\n got %s\nwant %s", what, data, wantData)
	}
}

// unmarshalInto fills a zero entity from a fixture document.
func unmarshalInto(t *testing.T, doc map[string]any, into validatable) {
	t.Helper()
	data, _ := json.Marshal(doc)
	if err := json.Unmarshal(data, into); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
}

func TestConstructorsGiveThePythonDefaults(t *testing.T) {
	fixture := loadFixture(t)
	for name, e := range entities {
		model := fixture.Models[name]
		built := e.construct(t, model.Minimal)
		if err := built.Validate(); err != nil {
			t.Errorf("%s: constructed from the required values, Validate: %v", name, err)
		}
		// The constructor generates forge_id and captured_at; the fixture fixes them.
		ptr := reflect.New(reflect.TypeOf(built))
		ptr.Elem().Set(reflect.ValueOf(built))
		id, _ := fieldByTag(ptr.Elem(), "forge_id")
		id.Set(reflect.ValueOf(uuid.MustParse(str(model.Minimal, "forge_id"))))
		captured, _ := fieldByTag(ptr.Elem(), "captured_at")
		captured.Set(reflect.ValueOf(when(t, model.Minimal, "captured_at")))
		assertSameJSON(t, name+" from New"+name, ptr.Interface(), model.Minimal)
	}
}

func TestFullDocumentsRoundTripAndValidate(t *testing.T) {
	fixture := loadFixture(t)
	for name, e := range entities {
		model := fixture.Models[name]
		got := e.zero()
		unmarshalInto(t, model.Full, got)
		if err := got.Validate(); err != nil {
			t.Errorf("%s: full document, Validate: %v", name, err)
		}
		assertSameJSON(t, name+" full", got, model.Full)
	}
}

func TestValidateRequiresWhatPythonRequires(t *testing.T) {
	fixture := loadFixture(t)
	for name, e := range entities {
		model := fixture.Models[name]
		for _, field := range model.Required {
			got := e.zero()
			unmarshalInto(t, model.Full, got)
			value, ok := fieldByTag(reflect.ValueOf(got).Elem(), field)
			if !ok {
				t.Errorf("%s: no field tagged %s", name, field)
				continue
			}
			if value.Kind() == reflect.Int {
				// Python requires the key; zero is a value there, so Go cannot tell them apart.
				continue
			}
			value.Set(reflect.Zero(value.Type()))
			err := got.Validate()
			if err == nil || !strings.Contains(err.Error(), field) {
				t.Errorf("%s: %s cleared, Validate = %v; want an error naming it", name, field, err)
			}
		}
		for _, field := range model.Optional {
			got := e.zero()
			unmarshalInto(t, model.Full, got)
			value, ok := fieldByTag(reflect.ValueOf(got).Elem(), field)
			if !ok {
				t.Errorf("%s: no field tagged %s", name, field)
				continue
			}
			value.Set(reflect.Zero(value.Type()))
			if err := got.Validate(); err != nil {
				t.Errorf("%s: optional %s cleared, Validate = %v; want nil", name, field, err)
			}
		}
	}
	// A zero value is refused on every base field, as the Python model refuses a missing one.
	err := mfg.Lot{}.Validate()
	for _, field := range []string{"forge_id", "source_system", "source_id", "captured_at", "lot_number"} {
		if err == nil || !strings.Contains(err.Error(), "missing "+field) {
			t.Errorf("zero Lot: want %q in %v", "missing "+field, err)
		}
	}
	var verr *mfg.ValidationError
	if !errorsAs(err, &verr) || verr.Entity != "Lot" || len(verr.Problems) != 5 {
		t.Errorf("zero Lot: %#v", err)
	}
}

func errorsAs(err error, target **mfg.ValidationError) bool {
	v, ok := err.(*mfg.ValidationError)
	if ok {
		*target = v
	}
	return ok
}

func TestValidateRejectsValuesOutsideTheEnums(t *testing.T) {
	fixture := loadFixture(t)
	checked := 0
	for name, e := range entities {
		model := fixture.Models[name]
		probe := reflect.ValueOf(e.zero()).Elem()
		for _, tag := range jsonTags(probe.Type()) {
			field, _ := fieldByTag(probe, tag)
			kind := field.Type()
			pointer := kind.Kind() == reflect.Pointer
			if pointer {
				kind = kind.Elem()
			}
			if kind.Kind() != reflect.String || kind.PkgPath() == "" {
				continue // plain strings are the source's free text
			}
			got := e.zero()
			unmarshalInto(t, model.Full, got)
			value, _ := fieldByTag(reflect.ValueOf(got).Elem(), tag)
			bogus := reflect.New(kind).Elem()
			bogus.SetString("BOGUS")
			if pointer {
				value.Set(bogus.Addr())
			} else {
				value.Set(bogus)
			}
			err := got.Validate()
			want := tag + ` "BOGUS" is not a ` + kind.Name()
			if err == nil || !strings.Contains(err.Error(), want) {
				t.Errorf("%s: %s = BOGUS, Validate = %v; want %q", name, tag, err, want)
			}
			checked++
		}
	}
	if checked != 12 {
		t.Errorf("enum-typed fields checked: %d, want 12", checked)
	}
}

func TestValidateFoldsNestedEntitiesIn(t *testing.T) {
	definition := mfg.NewProcessDefinition("forge-mes", "R-001", "Mash")
	definition.Steps = []mfg.ProcessStep{
		mfg.NewProcessStep("forge-mes", "S-001", 1, "Milling"),
		mfg.NewProcessStep("forge-mes", "", 2, ""),
	}
	err := definition.Validate()
	if err == nil || err.Error() != "ProcessDefinition: steps[1]: missing source_id; steps[1]: missing name" {
		t.Errorf("definition: %v", err)
	}
	sample := mfg.NewQualitySample("whk-wms", "QS-001", "proof_check", "manufacturing_unit", "B-001")
	result := mfg.NewSampleResult("whk-wms", "SR-001", "proof")
	result.Outcome = "MAYBE"
	sample.Results = []mfg.SampleResult{result}
	err = sample.Validate()
	if err == nil || err.Error() != `QualitySample: results[0]: outcome "MAYBE" is not a SampleOutcome` {
		t.Errorf("sample: %v", err)
	}
}
