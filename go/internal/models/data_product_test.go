package models_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/reh3376/forge/internal/models"
)

func TestDataProductConstruction(t *testing.T) {
	now := time.Now().UTC()
	dp := models.DataProduct{
		ProductID:   "prod-001",
		Name:        "Production Context",
		Description: "Real-time production context for fermentation",
		Owner:       "Roger Henley",
		Status:      models.DataProductStatusPublished,
		Schema: models.DataProductSchema{
			SchemaRef:         "forge://schemas/production-context/v2",
			Version:           "2.0.0",
			CompatibilityMode: "BACKWARD",
		},
		SourceAdapters: []string{"whk-wms", "forge-mes"},
		QualitySLOs: []models.QualitySLO{
			{Metric: "completeness", Target: 99.5, Measurement: "non-null required fields", Window: "1h"},
		},
		Tags:      []string{"fermentation", "real-time"},
		CreatedAt: now,
		UpdatedAt: now,
	}

	if dp.Status != models.DataProductStatusPublished {
		t.Errorf("status: %q", dp.Status)
	}
	if len(dp.QualitySLOs) != 1 {
		t.Fatalf("quality_slos: %d", len(dp.QualitySLOs))
	}
	if dp.QualitySLOs[0].Target != 99.5 {
		t.Errorf("target: %f", dp.QualitySLOs[0].Target)
	}
}

func TestDataProductJSONRoundTrip(t *testing.T) {
	dp := models.DataProduct{
		ProductID:   "p1",
		Name:        "Test",
		Description: "desc",
		Owner:       "owner",
		Status:      models.DataProductStatusDraft,
		Schema:      models.DataProductSchema{SchemaRef: "ref", Version: "1.0"},
		CreatedAt:   time.Now().UTC().Truncate(time.Millisecond),
		UpdatedAt:   time.Now().UTC().Truncate(time.Millisecond),
	}

	data, err := json.Marshal(dp)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var dp2 models.DataProduct
	if err := json.Unmarshal(data, &dp2); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if dp2.ProductID != dp.ProductID {
		t.Errorf("product_id: %q != %q", dp2.ProductID, dp.ProductID)
	}
	if dp2.Status != models.DataProductStatusDraft {
		t.Errorf("status: %q", dp2.Status)
	}
}

func TestDataProductStatusValues(t *testing.T) {
	statuses := []models.DataProductStatus{
		models.DataProductStatusDraft,
		models.DataProductStatusPublished,
		models.DataProductStatusDeprecated,
		models.DataProductStatusRetired,
	}
	for _, s := range statuses {
		if s == "" {
			t.Error("empty status")
		}
	}
}

// The curation spec (FB-009) round-trips and is omitted when absent, like the Python model.
func TestDataProductCurationRoundTrip(t *testing.T) {
	dp := models.DataProduct{
		ProductID: "p1",
		Name:      "Test",
		Owner:     "owner",
		Status:    models.DataProductStatusDraft,
		Schema:    models.DataProductSchema{SchemaRef: "forge://schemas/t/v1", Version: "1.0"},
		Curation:  &models.CurationSpec{Normalize: true, TimeWindow: "1hr", GroupBy: []string{"equipment_id"}, Functions: []string{"MAX"}, OnIngest: false},
	}
	data, err := json.Marshal(dp)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var dp2 models.DataProduct
	if err := json.Unmarshal(data, &dp2); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if dp2.Curation == nil || dp2.Curation.TimeWindow != "1hr" || dp2.Curation.Functions[0] != "MAX" || dp2.Curation.OnIngest {
		t.Errorf("curation: %+v", dp2.Curation)
	}
	bare, _ := json.Marshal(models.DataProduct{ProductID: "p2"})
	if string(bare) != "" && contains(string(bare), "curation") {
		t.Errorf("curation should be omitted when nil: %s", bare)
	}
}

func contains(s, sub string) bool {
	return len(sub) == 0 || (len(s) >= len(sub) && (s == sub || indexOf(s, sub) >= 0))
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
