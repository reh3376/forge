"""Edges the Go verifier's probe found in the Python side (2026-11-25), held closed.

The probe ran 32 chains beyond the vectors through both verifiers with Python's answer as
the expectation; four differed because the Python side was wrong:

* an id with a trailing newline passed, because ``$`` in Python's ``re`` also matches before
  a final newline (an identity hole);
* a subject or authority key identifier marked critical passed;
* an x400 address in the name escaped as a raw ``UnsupportedGeneralNameType``, a crash
  where a refusal belongs;
* a malformed extension the parser could not read was reported as the name's fault.

And the anchor read its numbers and flags loosely: ``"86400"`` or ``true`` for a number,
``"yes"`` for a flag. Each case below is refused, by name. Certificates that one library cannot
parse at all are not in the Go vectors (Go refuses them before its verifier runs); both sides
refuse them, and the verify skill says so.
"""

from __future__ import annotations

import copy

import pytest
from cryptography import x509
from cryptography.x509.oid import ExtensionOID
from pydantic import ValidationError
from tests.trust_world import DEPLOYMENT, HUB, MODULE, NOW, craft, world

from forge_core.trust.anchor import Anchor
from forge_core.trust.ids import IdError, SpiffeId
from forge_core.trust.verify import CertificateRefusedError, verify

W = world()
ANCHOR = Anchor.model_validate(W.anchor)
LEAF_URI = f"spiffe://{DEPLOYMENT}/hub/{HUB}/module/{MODULE}"


def answer(leaf: x509.Certificate) -> tuple[str | None, int | None]:
    try:
        verify(leaf, [W.intermediate], anchor=ANCHOR, profile=W.profile, now=NOW)
    except CertificateRefusedError as refused:
        return refused.code, refused.position
    return None, None


@pytest.mark.parametrize("suffix", ["\n", "\r\n", " ", "\t"])
def test_an_id_with_trailing_whitespace_is_not_an_id(suffix: str) -> None:
    with pytest.raises(IdError):
        SpiffeId.parse(LEAF_URI + suffix)
    leaf = craft(W.leaf_spec(san=(x509.UniformResourceIdentifier(LEAF_URI + suffix),)), W.profile)
    assert answer(leaf) == ("profile/subject-alt-name", 0)


def test_a_name_in_the_anchor_is_matched_whole() -> None:
    with pytest.raises(ValidationError):
        Anchor.model_validate({**W.anchor, "deployment": DEPLOYMENT + "\n"})


@pytest.mark.parametrize("which", ["ski_critical", "aki_critical"])
def test_a_key_identifier_marked_critical_is_refused(which: str) -> None:
    leaf = craft(W.leaf_spec(**{which: True}), W.profile)
    assert answer(leaf) == ("profile/key-identifiers", 0)


def test_a_name_the_parser_cannot_read_is_a_refusal_not_a_crash() -> None:
    x400 = x509.UnrecognizedExtension(
        ExtensionOID.SUBJECT_ALTERNATIVE_NAME, bytes.fromhex("3002a300")
    )
    leaf = craft(W.leaf_spec(omit=frozenset({"san"}), raw=((x400, True),)), W.profile)
    assert answer(leaf) == ("profile/extensions", 0)


def test_a_malformed_extension_is_the_extensions_fault() -> None:
    bad = x509.UnrecognizedExtension(ExtensionOID.INHIBIT_ANY_POLICY, bytes.fromhex("0201ff"))
    leaf = craft(W.leaf_spec(raw=((bad, False),)), W.profile)
    assert answer(leaf) == ("profile/extensions", 0)


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("version",), True),
        (("version",), "1"),
        (("version",), 1.0),
        (("root_threshold",), "2"),
        (("policy", "lifetimes", "module-leaf"), "86400"),
        (("policy", "lifetimes", "module-leaf"), 86400.0),
        (("policy", "intermediates_per_hub"), True),
        (("policy", "separation_of_duties"), "yes"),
        (("policy", "separation_of_duties"), 0),
    ],
    ids=lambda v: repr(v) if not isinstance(v, tuple) else "/".join(v),
)
def test_the_anchor_takes_each_value_as_its_type_or_refuses_it(
    path: tuple[str, ...], value
) -> None:
    """The value checked is the value acted on (CLAUDE.md): no number from a string, no flag
    from a word or a number."""
    document = copy.deepcopy(W.anchor)
    target = document
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    with pytest.raises(ValidationError):
        Anchor.model_validate(document)


def test_the_edges_both_verifiers_are_held_to() -> None:
    """Every case of ``testdata/edges.json`` (the Go test reads the same file): Python gives
    the declared answer on the very bytes Go reads; regenerate with
    ``uv run python -m tests.trust_edges``."""
    import json

    from tests.trust_edges import ANSWERS, EDGES

    edges = json.loads(EDGES.read_text(encoding="utf-8"))
    assert [c["name"] for c in edges["cases"]] == list(ANSWERS)
    for case in edges["cases"]:
        code, position, go_parses = ANSWERS[case["name"]]
        assert (case["expect"]["code"], case["expect"]["position"], case["go_parses"]) == (
            code,
            position,
            go_parses,
        )
        chain = [x509.load_pem_x509_certificate(p.encode()) for p in case["chain"]]
        try:
            verify(
                chain[0],
                chain[1:],
                anchor=Anchor.model_validate(case["anchor"]),
                profile=W.profile,
                now=NOW,
            )
            got = (None, None)
        except CertificateRefusedError as refused:
            got = (refused.code, refused.position)
        assert got == (code, position), case["name"]
