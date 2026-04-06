"""FxTS shared infrastructure — the spec-first governance engine.

FxTS (Forge x Test Specification) is NOT a testing framework.
Specs DEFINE what must exist. Runners ENFORCE conformance.
CI gates BLOCK deviation. This is spec-first governance.

The shared module provides:
  - FxTSRunner: base class for all framework-specific runners
  - FxTSReport: structured conformance report
  - FxTSVerdict: pass/fail/skip/error with evidence
  - Schema loading and validation utilities
"""

from forge.governance.shared.runner import (
    FxTSReport,
    FxTSRunner,
    FxTSVerdict,
    SpecViolation,
    VerdictStatus,
)

__all__ = [
    "FxTSReport",
    "FxTSRunner",
    "FxTSVerdict",
    "SpecViolation",
    "VerdictStatus",
]
