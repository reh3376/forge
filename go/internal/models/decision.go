package models

import (
	"time"

	"github.com/google/uuid"
)

// DecisionStatus represents the lifecycle status of a decision workflow.
type DecisionStatus string

const (
	DecisionStatusDraft       DecisionStatus = "DRAFT"
	DecisionStatusInReview    DecisionStatus = "IN_REVIEW"
	DecisionStatusChallenged  DecisionStatus = "CHALLENGED"
	DecisionStatusDecided     DecisionStatus = "DECIDED"
	DecisionStatusClosed      DecisionStatus = "CLOSED"
	DecisionStatusReassessing DecisionStatus = "REASSESSING"
)

// ConfidenceLevel rates confidence for assumptions and evidence.
type ConfidenceLevel string

const (
	ConfidenceHigh    ConfidenceLevel = "HIGH"
	ConfidenceMedium  ConfidenceLevel = "MEDIUM"
	ConfidenceLow     ConfidenceLevel = "LOW"
	ConfidenceUnknown ConfidenceLevel = "UNKNOWN"
)

// AssumptionStatus tracks the lifecycle of a tracked assumption.
type AssumptionStatus string

const (
	AssumptionStatusActive      AssumptionStatus = "ACTIVE"
	AssumptionStatusValidated   AssumptionStatus = "VALIDATED"
	AssumptionStatusInvalidated AssumptionStatus = "INVALIDATED"
	AssumptionStatusSuperseded  AssumptionStatus = "SUPERSEDED"
)

// EvidenceType classifies evidence in the decision frame.
type EvidenceType string

const (
	EvidenceTypeSupporting  EvidenceType = "SUPPORTING"
	EvidenceTypeChallenging EvidenceType = "CHALLENGING"
	EvidenceTypeNeutral     EvidenceType = "NEUTRAL"
)

// EvidenceLink connects a decision to supporting or challenging evidence.
type EvidenceLink struct {
	EvidenceID   uuid.UUID       `json:"evidence_id"`
	EvidenceType EvidenceType    `json:"evidence_type"`
	Description  string          `json:"description"`
	SourceRef    string          `json:"source_ref"`
	Confidence   ConfidenceLevel `json:"confidence"`
	AddedBy      string          `json:"added_by"`
	AddedAt      time.Time       `json:"added_at"`
}

// Assumption is a tracked assumption in a decision workflow.
type Assumption struct {
	AssumptionID       uuid.UUID        `json:"assumption_id"`
	Description        string           `json:"description"`
	Status             AssumptionStatus `json:"status"`
	Confidence         ConfidenceLevel  `json:"confidence"`
	EvidenceLinks      []EvidenceLink   `json:"evidence_links,omitempty"`
	Owner              string           `json:"owner"`
	ReassessmentDate   *time.Time       `json:"reassessment_date,omitempty"`
	LinkedDecisions    []uuid.UUID      `json:"linked_decisions,omitempty"`
	CreatedAt          time.Time        `json:"created_at"`
	InvalidatedAt      *time.Time       `json:"invalidated_at,omitempty"`
	InvalidationReason string           `json:"invalidation_reason,omitempty"`
}

// AlternativeHypothesis is an alternative explanation for the issue under review.
type AlternativeHypothesis struct {
	HypothesisID        uuid.UUID       `json:"hypothesis_id"`
	Description         string          `json:"description"`
	SupportingEvidence  []EvidenceLink  `json:"supporting_evidence,omitempty"`
	ChallengingEvidence []EvidenceLink  `json:"challenging_evidence,omitempty"`
	Likelihood          ConfidenceLevel `json:"likelihood"`
}

// ReassessmentTrigger defines a condition that forces re-evaluation.
type ReassessmentTrigger struct {
	TriggerType    string     `json:"trigger_type"`
	Description    string     `json:"description"`
	Condition      string     `json:"condition"`
	MetricRef      string     `json:"metric_ref,omitempty"`
	ThresholdValue *float64   `json:"threshold_value,omitempty"`
	TargetDate     *time.Time `json:"target_date,omitempty"`
	Triggered      bool       `json:"triggered"`
	TriggeredAt    *time.Time `json:"triggered_at,omitempty"`
}

// DecisionFrame implements the 13-point minimum decision frame from BBD Part 2.
type DecisionFrame struct {
	DecisionID uuid.UUID      `json:"decision_id"`
	Status     DecisionStatus `json:"status"`

	// I. Decision or issue under review
	Scope           string   `json:"scope"`
	WhyNow          string   `json:"why_now,omitempty"`
	AffectedParties []string `json:"affected_parties,omitempty"`

	// II. Current working hypothesis
	Hypothesis string `json:"hypothesis"`

	// III. Evidence supporting the hypothesis
	SupportingEvidence []EvidenceLink `json:"supporting_evidence,omitempty"`

	// IV. Evidence challenging the hypothesis
	ChallengingEvidence []EvidenceLink `json:"challenging_evidence,omitempty"`

	// V. Alternative hypotheses
	Alternatives []AlternativeHypothesis `json:"alternatives,omitempty"`

	// VI. Key assumptions
	Assumptions []Assumption `json:"assumptions,omitempty"`

	// VII. Missing information
	MissingInformation []string `json:"missing_information,omitempty"`

	// VIII. Risk if the current hypothesis is wrong
	RiskIfWrong    string           `json:"risk_if_wrong,omitempty"`
	RiskLikelihood *ConfidenceLevel `json:"risk_likelihood,omitempty"`
	RiskImpact     string           `json:"risk_impact,omitempty"`

	// IX. Opportunity if correct
	OpportunityIfRight string `json:"opportunity_if_right,omitempty"`

	// X. Existing controls
	ExistingControls []string `json:"existing_controls,omitempty"`

	// XI. Evidence of control effectiveness
	ControlEffectivenessEvidence []EvidenceLink `json:"control_effectiveness_evidence,omitempty"`

	// XII. Trigger for reassessment
	ReassessmentTriggers []ReassessmentTrigger `json:"reassessment_triggers,omitempty"`

	// XIII. Owner
	Owner string `json:"owner"`

	// Metadata
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	ClosedAt    *time.Time     `json:"closed_at,omitempty"`
	Disposition string         `json:"disposition,omitempty"`
	Tags        []string       `json:"tags,omitempty"`
	Metadata    map[string]any `json:"metadata,omitempty"`
}
