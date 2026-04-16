package models_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/reh3376/forge/internal/models"
)

func TestDecisionFrameConstruction(t *testing.T) {
	now := time.Now().UTC()
	df := models.DecisionFrame{
		DecisionID: uuid.New(),
		Status:     models.DecisionStatusDraft,
		Scope:      "Should we change mash protocol for bourbon line?",
		Hypothesis: "Current yield drop is caused by grain supply change",
		Owner:      "Roger Henley",
		Assumptions: []models.Assumption{
			{
				AssumptionID: uuid.New(),
				Description:  "Grain supplier changed corn variety in Q1",
				Status:       models.AssumptionStatusActive,
				Confidence:   models.ConfidenceMedium,
				Owner:        "QA Lead",
				CreatedAt:    now,
			},
		},
		SupportingEvidence: []models.EvidenceLink{
			{
				EvidenceID:   uuid.New(),
				EvidenceType: models.EvidenceTypeSupporting,
				Description:  "Yield dropped 3% since March",
				SourceRef:    "forge://data-products/yield-analysis/v1",
				Confidence:   models.ConfidenceHigh,
				AddedBy:      "analyst-001",
				AddedAt:      now,
			},
		},
		CreatedAt: now,
		UpdatedAt: now,
	}

	if df.DecisionID == uuid.Nil {
		t.Error("expected non-nil UUID")
	}
	if df.Status != models.DecisionStatusDraft {
		t.Errorf("status: %q", df.Status)
	}
	if len(df.Assumptions) != 1 {
		t.Fatalf("assumptions: %d", len(df.Assumptions))
	}
	if len(df.SupportingEvidence) != 1 {
		t.Fatalf("supporting_evidence: %d", len(df.SupportingEvidence))
	}
}

func TestDecisionFrameJSONRoundTrip(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Millisecond)
	df := models.DecisionFrame{
		DecisionID: uuid.New(),
		Status:     models.DecisionStatusChallenged,
		Scope:      "Test decision",
		Hypothesis: "Test hypothesis",
		Owner:      "Test Owner",
		CreatedAt:  now,
		UpdatedAt:  now,
		Tags:       []string{"test", "unit"},
	}

	data, err := json.Marshal(df)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var df2 models.DecisionFrame
	if err := json.Unmarshal(data, &df2); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if df2.DecisionID != df.DecisionID {
		t.Errorf("decision_id mismatch")
	}
	if df2.Status != models.DecisionStatusChallenged {
		t.Errorf("status: %q", df2.Status)
	}
	if len(df2.Tags) != 2 {
		t.Errorf("tags: %d", len(df2.Tags))
	}
}

func TestEvidenceTypeValues(t *testing.T) {
	types := []models.EvidenceType{
		models.EvidenceTypeSupporting,
		models.EvidenceTypeChallenging,
		models.EvidenceTypeNeutral,
	}
	for _, et := range types {
		if et == "" {
			t.Error("empty evidence type")
		}
	}
}

func TestConfidenceLevelValues(t *testing.T) {
	levels := []models.ConfidenceLevel{
		models.ConfidenceHigh,
		models.ConfidenceMedium,
		models.ConfidenceLow,
		models.ConfidenceUnknown,
	}
	for _, l := range levels {
		if l == "" {
			t.Error("empty confidence level")
		}
	}
}

func TestDecisionStatusValues(t *testing.T) {
	statuses := []models.DecisionStatus{
		models.DecisionStatusDraft,
		models.DecisionStatusInReview,
		models.DecisionStatusChallenged,
		models.DecisionStatusDecided,
		models.DecisionStatusClosed,
		models.DecisionStatusReassessing,
	}
	for _, s := range statuses {
		if s == "" {
			t.Error("empty decision status")
		}
	}
}

func TestReassessmentTriggerConstruction(t *testing.T) {
	threshold := 92.0
	trigger := models.ReassessmentTrigger{
		TriggerType:    "metric_threshold",
		Description:    "Yield drops below 92%",
		Condition:      "yield < 92% for 3 consecutive batches",
		MetricRef:      "forge://metrics/yield",
		ThresholdValue: &threshold,
		Triggered:      false,
	}
	if trigger.TriggerType != "metric_threshold" {
		t.Errorf("trigger_type: %q", trigger.TriggerType)
	}
	if *trigger.ThresholdValue != 92.0 {
		t.Errorf("threshold: %f", *trigger.ThresholdValue)
	}
}

func TestAlternativeHypothesisConstruction(t *testing.T) {
	ah := models.AlternativeHypothesis{
		HypothesisID: uuid.New(),
		Description:  "Temperature drift in fermenter",
		Likelihood:   models.ConfidenceLow,
	}
	if ah.HypothesisID == uuid.Nil {
		t.Error("expected non-nil UUID")
	}
	if ah.Likelihood != models.ConfidenceLow {
		t.Errorf("likelihood: %q", ah.Likelihood)
	}
}
