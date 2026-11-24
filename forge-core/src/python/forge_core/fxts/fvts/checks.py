"""Every check the FVTS runner gives, declared as data (D-19, AE-2).

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
    Check("fvts:action-profile-permitted", ("/actions/allowed_profiles",), SELF),
    Check("fvts:action-target", ("/actions/target_point",), FILE),
    Check("fvts:conformance-paths", ("/conformance_tests",), FILE),
    Check("fvts:cross-site-read-only", ("/scope/multi_site",), SELF),
    Check(
        "fvts:enum-parity",
        (),
        ARTIFACT,
        "the framework's enums against the Python models; covers no spec property",
    ),
    Check("fvts:golden-messages", ("/conformance_tests/golden_messages_path",), FILE),
    Check("fvts:identity-match", ("/view_identity/view_id",), SELF),
    Check("fvts:isa101-required", ("/design_system/isa101_high_performance",), SELF),
    Check(
        "fvts:metadata",
        ("/metadata",),
        NONE,
        "free text for people: read only to count its keys; decides nothing (D-19, AE-3)",
    ),
    Check("fvts:objects", ("/data_bindings/objects",), FILE),
    Check("fvts:owner-in-facts", ("/view_identity/owner_module",), FILE),
    Check("fvts:profile-action-filter", ("/surfaces/actions",), SELF),
    Check("fvts:profile-baseline", ("/render_profiles/overrides",), SELF),
    Check("fvts:profile-supported", ("/render_profiles/supported",), SELF),
    Check("fvts:range-sane", ("/data_bindings/points", "/live_updates"), SELF),
    Check("fvts:schema-valid", ("",), SELF),
    Check("fvts:spec-load", ("",), SELF),
    Check("fvts:surface-refs", ("/surfaces",), SELF),
    Check("fvts:unique-ids", ("",), SELF),
)
