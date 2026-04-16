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
		SourceAdapters: []string{"whk-wms", "whk-mes"},
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
