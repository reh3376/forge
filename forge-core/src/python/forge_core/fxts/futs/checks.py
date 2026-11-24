"""Every check the FUTS runner gives, declared as data (D-19, AE-2).

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
    Check("futs:actions", ("/view/root",), FILE),
    Check("futs:bindings", ("/view/root",), FILE),
    Check("futs:events", ("/view/root",), FILE),
    Check(
        "futs:expressions",
        ("/view/root",),
        ARTIFACT,
        "the Go server compiles CEL; not built (FB-181)",
    ),
    Check("futs:identity-match", ("/identity/id",), SELF),
    Check("futs:lists", ("/view",), FILE),
    Check("futs:nodes", ("/view/root",), FILE),
    Check("futs:profiles", ("/view/root",), FILE),
    Check("futs:props", ("/view/root",), FILE),
    Check("futs:schema-valid", ("",), SELF),
    Check("futs:spec-load", ("",), SELF),
    Check("futs:view-spec", ("/view/fvts_spec",), FILE),
    Check("futs:widget-names", ("/widget",), SELF, "every name the widget declares is unique"),
    Check("futs:widget-properties", ("/widget/properties",), SELF),
    Check("futs:widget-shows", ("/widget/shows",), SELF),
    Check("futs:widgets", ("/view/root",), FILE),
)
