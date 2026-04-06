"""Decision models — structured challenge framework.

Implements the 13-point minimum decision frame from
BBD Part 2 (Better Business Decisions Require Better Information).
This operationalizes the argument that better information alone
is not enough — human judgment needs structured challenge.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class DecisionStatus(StrEnum):
    """Lifecycle status of a decision workflow."""

    DRAFT = "DRAFT"
    IN_REVIEW = "IN_REVIEW"
    CHALLENGED = "CHALLENGED"  # Actively undergoing structured challenge
    DECIDED = "DECIDED"
    CLOSED = "CLOSED"
    REASSESSING = "REASSESSING"  # Triggered by reassessment condition


class ConfidenceLevel(StrEnum):
    """Confidence assessment for assumptions and evidence."""

    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    UNKNOWN = "UNKNOWN"


class AssumptionStatus(StrEnum):
    """Lifecycle status of a tracked assumption."""

    ACTIVE = "ACTIVE"
    VALIDATED = "VALIDATED"
    INVALIDATED = "INVALIDATED"
    SUPERSEDED = "SUPERSEDED"


class EvidenceType(StrEnum):
    """Classification of evidence in the decision frame."""

    SUPPORTING = "SUPPORTING"  # Step III: supports the hypothesis
    CHALLENGING = "CHALLENGING"  # Step IV: challenges the hypothesis
    NEUTRAL = "NEUTRAL"


class EvidenceLink(BaseModel):
    """A link between a decision and supporting/challenging evidence.

    Evidence can be a reference to a data product query, a document,
    a dashboard view, or any other addressable artifact.
    """

    evidence_id: UUID = Field(default_factory=uuid4)
    evidence_type: EvidenceType
    description: str
    source_ref: str  # URI to data product, query, document, dashboard
    confidence: ConfidenceLevel = ConfidenceLevel.MEDIUM
    added_by: str
    added_at: datetime = Field(default_factory=datetime.utcnow)


class Assumption(BaseModel):
    """A tracked assumption in a decision workflow.

    From BBD Part 2: "Every important decision should force its
    assumptions into the open. If the assumptions are not written down,
    challenged, and paired with evidence, they will quietly drive
    the decision anyway."
    """

    assumption_id: UUID = Field(default_factory=uuid4)
    description: str
    status: AssumptionStatus = AssumptionStatus.ACTIVE
    confidence: ConfidenceLevel = ConfidenceLevel.MEDIUM
    evidence_links: list[EvidenceLink] = Field(default_factory=list)
    owner: str  # Who is responsible for validating this assumption
    reassessment_date: datetime | None = None
    linked_decisions: list[UUID] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    invalidated_at: datetime | None = None
    invalidation_reason: str | None = None


class AlternativeHypothesis(BaseModel):
    """An alternative explanation for the issue under review.

    From BBD Part 2: "No important decision should proceed with only
    one causal story on the table when multiple are plausible."
    """

    hypothesis_id: UUID = Field(default_factory=uuid4)
    description: str
    supporting_evidence: list[EvidenceLink] = Field(default_factory=list)
    challenging_evidence: list[EvidenceLink] = Field(default_factory=list)
    likelihood: ConfidenceLevel = ConfidenceLevel.MEDIUM


class ReassessmentTrigger(BaseModel):
    """A condition that forces re-evaluation of the decision.

    From BBD Part 2 Step XII: "Define what event, metric, threshold,
    or date would force re-evaluation."
    """

    trigger_type: str  # "metric_threshold", "date", "event"
    description: str
    condition: str  # e.g., "yield < 92% for 3 consecutive batches"
    metric_ref: str | None = None  # URI to monitored metric
    threshold_value: float | None = None
    target_date: datetime | None = None
    triggered: bool = False
    triggered_at: datetime | None = None


class DecisionFrame(BaseModel):
    """The 13-point minimum decision frame from BBD Part 2.

    This structure operationalizes the structured challenge framework.
    For significant decisions, the system will not allow progression
    past Step IV without at least one challenging evidence entry.
    """

    decision_id: UUID = Field(default_factory=uuid4)
    status: DecisionStatus = DecisionStatus.DRAFT

    # I. Decision or issue under review
    scope: str
    why_now: str | None = None
    affected_parties: list[str] = Field(default_factory=list)

    # II. Current working hypothesis
    hypothesis: str

    # III. Evidence supporting the hypothesis
    supporting_evidence: list[EvidenceLink] = Field(default_factory=list)

    # IV. Evidence challenging the hypothesis (REQUIRED — system enforces this)
    challenging_evidence: list[EvidenceLink] = Field(default_factory=list)

    # V. Alternative hypotheses (minimum 2 for material decisions)
    alternatives: list[AlternativeHypothesis] = Field(default_factory=list)

    # VI. Key assumptions
    assumptions: list[Assumption] = Field(default_factory=list)

    # VII. Missing information
    missing_information: list[str] = Field(default_factory=list)

    # VIII. Risk if the current hypothesis is wrong
    risk_if_wrong: str | None = None
    risk_likelihood: ConfidenceLevel | None = None
    risk_impact: str | None = None

    # IX. Opportunity if the current hypothesis is right
    opportunity_if_right: str | None = None

    # X. Existing controls
    existing_controls: list[str] = Field(default_factory=list)

    # XI. Evidence of control effectiveness (REQUIRED — "exists" is not evidence)
    control_effectiveness_evidence: list[EvidenceLink] = Field(default_factory=list)

    # XII. Trigger for reassessment
    reassessment_triggers: list[ReassessmentTrigger] = Field(default_factory=list)

    # XIII. Owner
    owner: str  # Named individual, not a department

    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    closed_at: datetime | None = None
    disposition: str | None = None
    tags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
