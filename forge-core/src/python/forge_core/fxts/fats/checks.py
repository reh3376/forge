"""Every check the FATS runner gives, declared as data (D-19, AE-2).

Each entry names a check id (or a form with ``{name}`` placeholders for an id built at
run time), the JSON pointers into a spec that the check looks at, and the kind of evidence
it reaches when it runs: ``SELF`` (the spec against itself or its schema), ``FILE``
(another file), ``ARTIFACT`` (the real thing), ``NONE`` (nothing of the spec). The runner
base gives each verdict the kind of its declaration, and an undeclared id is an error.
The shared checks (``hash-verified``, ``hash-approved``, ``schema-current``,
``runner-error``, ``parity:...``) are declared once, in ``fxts/shared/runner.py``.
"""

from __future__ import annotations

from forge_core.fxts.shared.runner import Check, EvidenceKind

SELF, FILE, ARTIFACT, NONE = (
    EvidenceKind.SELF,
    EvidenceKind.FILE,
    EvidenceKind.ARTIFACT,
    EvidenceKind.NONE,
)

CHECKS: tuple[Check, ...] = (
    Check("fats:authentication", ("/authentication",), SELF),
    Check("fats:endpoint-format", ("/endpoint",), SELF),
    Check("fats:endpoint-match", ("/endpoint",), SELF),
    Check(
        "fats:live",
        ("/endpoint", "/method", "/response/success_status", "/response/max_latency_ms"),
        ARTIFACT,
        "not run unless the run is asked for live checks (FB-269)",
    ),
    Check("fats:live-connect", ("/endpoint", "/method"), ARTIFACT),
    Check("fats:live-latency", ("/response/max_latency_ms",), ARTIFACT),
    Check("fats:live-status", ("/response/success_status",), ARTIFACT),
    Check("fats:method", ("/method",), SELF),
    Check("fats:rate-limit", ("/rate_limit",), SELF),
    Check("fats:request", ("/request",), SELF),
    Check("fats:response", ("/response",), SELF),
    Check("fats:spec-load", ("",), SELF),
    Check("fats:spec-version", ("/spec_version",), SELF),
)
