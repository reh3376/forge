"""Every check the FMTS runner gives, declared as data (D-19, AE-2).

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
    Check(
        "fmts:enum-parity",
        (),
        FILE,
        "the FACTS schema's enums against the framework's own constants; covers no spec property",
    ),
    Check("fmts:function", ("/module_identity/function",), FILE),
    Check("fmts:identity-match", ("/module_identity/module_id",), SELF),
    Check("fmts:integration", ("/integration",), FILE),
    Check("fmts:lists", ("/module_identity/function", "/integration", "/transport"), FILE),
    Check(
        "fmts:m1",
        ("/baseline/M-1",),
        FILE,
        "a text search of the module's source files, not a run of the module",
    ),
    Check("fmts:m10", ("/baseline/M-10",), FILE),
    Check("fmts:m11", ("/baseline/M-11",), FILE, "the scaffold's files exist"),
    Check(
        "fmts:m12",
        ("/baseline/M-12",),
        NONE,
        "the transport contract is not built (FB-164); artifact once built",
    ),
    Check(
        "fmts:m13",
        ("/baseline/M-13",),
        NONE,
        "the transport contract is not built (FB-164); artifact once built",
    ),
    Check(
        "fmts:m14",
        ("/baseline/M-14",),
        NONE,
        "the transport contract is not built (FB-164); artifact once built",
    ),
    Check(
        "fmts:m15",
        ("/baseline/M-15",),
        SELF,
        "a claim of not applicable is held to the spec's own transport section",
    ),
    Check(
        "fmts:m16",
        ("/baseline/M-16",),
        SELF,
        "a claim of not applicable is held to the spec's own transport section",
    ),
    Check("fmts:m2", ("/baseline/M-2",), FILE),
    Check("fmts:m3", ("/baseline/M-3",), FILE),
    Check("fmts:m4", ("/baseline/M-4",), ARTIFACT),
    Check("fmts:m5", ("/baseline/M-5",), ARTIFACT),
    Check("fmts:m6", ("/baseline/M-6",), ARTIFACT),
    Check("fmts:m7", ("/baseline/M-7",), ARTIFACT),
    Check("fmts:m8", ("/baseline/M-8",), SELF),
    Check(
        "fmts:m9",
        ("/baseline/M-9",),
        FILE,
        "file suffixes in the module's source paths, not a run of the module",
    ),
    Check(
        "fmts:metadata",
        ("/metadata",),
        NONE,
        "free text for people: read only to count its keys; decides nothing (D-19, AE-3)",
    ),
    Check("fmts:requirements", ("/baseline",), SELF),
    Check("fmts:schema-valid", ("",), SELF),
    Check("fmts:source-paths", ("/module_identity/source_paths",), FILE),
    Check("fmts:spec-load", ("",), SELF),
    Check("fmts:transport", ("/transport",), FILE),
    Check("fmts:waivers", ("/waivers",), FILE),
)
