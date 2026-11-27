"""Which documents can be built as an anchor: the keys it names (FB-317).

Two laws, each checked over every case in its bound:

* **A key the anchor names is always a key, and is never named twice.** The certificate
  roots' keys, the hub intermediates', the distribution key and the freshness keys are each
  an ECDSA key on an admitted curve in its one encoding, and no two places hold one key.
* **Python and Go always give one answer on an anchor.** Their parsers disagree on what else
  is a key and on which certificates can be read, so both suites read one file,
  ``testdata/anchors.json`` (Go: ``TestAnchors``), and each must give its declared answer,
  and a refusal by the key rules must name the place and say the same words.

The answers are declared in ``tests/trust_anchors.py``, apart from the code under test.
"""

from __future__ import annotations

import itertools
import json

import pytest
from pydantic import ValidationError
from tests import trust_anchors as cases
from tests.trust_world import key, public_pem

from forge_core.trust import keys
from forge_core.trust.anchor import KEY_TWICE, Anchor

FILE = json.loads(cases.ANCHORS.read_text(encoding="utf-8"))
BASE = FILE["base"]
CHAINS = {
    source: {
        case["name"]: case["chain"]
        for case in json.loads((cases.TESTDATA / f"{source}.json").read_text(encoding="utf-8"))[
            "cases"
        ]
    }
    for source in cases.BORROWED_FROM
}
KEY_FIELDS = ("the distribution key", "the first freshness key", "the second freshness key")


def held(case: dict, document: dict) -> None:
    """The document gets the case's declared answer, and a refusal says its words."""
    try:
        Anchor.model_validate(document)
    except ValidationError as exc:
        assert case["expect"] == cases.REFUSED, f"refused, declared built: {exc}"
        if case["says"] is not None:
            assert case["says"] in str(exc)
    else:
        assert case["expect"] == cases.BUILT, "built, declared refused"


@pytest.mark.parametrize("case", FILE["cases"], ids=lambda case: case["name"])
def test_an_anchor_is_built_only_with_admitted_keys_each_named_once(case: dict) -> None:
    held(case, {**BASE, **case["change"]})


@pytest.mark.parametrize("case", FILE["borrowed"], ids=lambda case: case["name"])
def test_a_certificate_of_the_edges_or_the_vectors_as_the_hub_intermediate(case: dict) -> None:
    """Reading an anchor reads a certificate's structure and its key, no more: the
    certificates Go's own parser refuses (a key identifier marked critical, a name it cannot
    read) are built here as they are in Go; the profile's check refuses them later."""
    text = CHAINS[case["from"]][case["case"]][case["certificate"]]
    listed = [{"hub": FILE["borrowed_as"]["hub"], "certificate": text}]
    held(case, {**BASE, "hub_intermediates": listed})


def test_the_file_both_suites_read_is_the_generators() -> None:
    """Regenerate with ``uv run python -m tests.trust_anchors`` (the certificates are signed
    anew each time, so the names, answers and words are what is compared)."""
    fresh = cases.anchors()

    def declared(cases: list[dict]) -> list[tuple]:
        return [(case["name"], case["expect"], case["says"]) for case in cases]

    assert declared(FILE["cases"]) == declared(fresh["cases"])
    assert FILE["borrowed"] == fresh["borrowed"]
    assert FILE["borrowed_as"] == fresh["borrowed_as"]


def test_every_spelling_is_tried_in_every_key_field_and_every_pair_of_places() -> None:
    names = {case["name"] for case in FILE["cases"]}
    spellings = [name for name, _, _, _ in cases.key_spellings()]
    assert len(spellings) >= 30
    for name in spellings:
        for field in KEY_FIELDS:
            assert f"{name}, as {field}" in names
    pairs = list(itertools.combinations(cases.PLACES, 2))
    assert len(pairs) == 21
    for first, second in pairs:
        assert f"one key as {first} and as {second}" in names
    certificates = [name for name, _, _, _ in cases.certificates(cases.world())]
    for name in certificates:
        assert f"{name}, as a certificate root" in names
        assert f"{name}, as a hub intermediate" in names


def test_the_cases_hold_both_answers_and_every_kind_of_refusal() -> None:
    every = [*FILE["cases"], *FILE["borrowed"]]
    assert sum(case["expect"] == cases.BUILT for case in every) >= 100
    said = " ".join(case["says"] or "" for case in every)
    for words in (
        cases.LABEL_KEY,
        cases.LABEL_CERTIFICATE,
        cases.BASE64,
        cases.KEY,
        cases.CERTIFICATE,
        cases.TWICE,
    ):
        assert words in said
    borrowed_built = [case for case in FILE["borrowed"] if case["expect"] == cases.BUILT]
    assert {"SKI critical", "AKI critical"} <= {case["case"] for case in borrowed_built}


def test_the_declared_words_are_the_codes() -> None:
    """The generator writes a refusal's words itself; they are the words the code says."""
    assert keys.NOT_LABELLED.format(label="PUBLIC KEY") == cases.LABEL_KEY
    assert keys.NOT_LABELLED.format(label="CERTIFICATE") == cases.LABEL_CERTIFICATE
    assert (keys.NOT_BASE64, keys.NOT_A_KEY, keys.NOT_A_CERTIFICATE, KEY_TWICE) == (
        cases.BASE64,
        cases.KEY,
        cases.CERTIFICATE,
        cases.TWICE,
    )
    assert set(keys.CURVES) == {"secp256r1", "secp384r1"}


@pytest.mark.parametrize("curve", sorted(keys.CURVES))
def test_a_key_as_the_issuer_and_the_signer_export_it_is_admitted(curve: str) -> None:
    """Every key in an anchor comes out of a device through ``public_key().public_bytes``;
    that encoding is the one admitted, so nothing a ceremony exports is refused."""
    exported = public_pem(key(curve, 7100))
    assert keys.public_key_der(exported) == keys.der_of(exported, "PUBLIC KEY")
