"""D-23 law 1, checked over every case in its bound (FB-293 step 1a).

No certificate counts unless its issuer's key is in the current anchor (or certified by a key
that is), its subject sits under its issuer's identity, and it fits the profile; and the
issuer refuses to sign outside it. The oracle is the catalog in ``tests/trust_world.py``: each
fault declares the code and position at which it is refused, written down apart from the
verifier. Covered here:

* every single fault of the catalog (leaf, intermediate, root and chain shape);
* every pair of leaf faults that touch different fields: refused, by one of the two codes;
* the issuer over its whole request space: it signs exactly the requests that fit, and every
  certificate it makes is accepted by the verifier;
* the committed vectors the Go verifier reads: the same names, expectations and answers.

Not covered, and why: a version-1 certificate or a serial of zero, negative or over 20 bytes
cannot be made with ``cryptography`` (its builder refuses them), so those two profile checks
are exercised by no case; see the verify skill ``verify-trust-certificates``.
"""

from __future__ import annotations

import itertools
import json
from datetime import timedelta

import pytest
from cryptography import x509
from tests.trust_world import (
    CAPS,
    DEPLOYMENT,
    HUB,
    LEAF_FAULTS,
    MODULE,
    MUTATIONS,
    NOW,
    OTHER_DEPLOYMENT,
    SIBLING,
    VECTORS,
    craft,
    key,
    world,
)

from forge_core.trust.anchor import Anchor
from forge_core.trust.ids import SpiffeId
from forge_core.trust.issuer import IssueRefusedError, Request, issue
from forge_core.trust.verify import CertificateRefusedError, check_certificate, verify

W = world()


def answer(chain: list[x509.Certificate], anchor_doc: dict) -> tuple[str | None, int | None]:
    try:
        verify(
            chain[0],
            chain[1:],
            anchor=Anchor.model_validate(anchor_doc),
            profile=W.profile,
            now=NOW,
        )
    except CertificateRefusedError as refused:
        return refused.code, refused.position
    return None, None


@pytest.mark.parametrize("mutation", MUTATIONS, ids=[m.name for m in MUTATIONS])
def test_every_single_fault_is_refused_where_the_catalog_says(mutation) -> None:
    chain, anchor_doc = mutation.build(W)
    assert answer(chain, anchor_doc) == (mutation.expect, mutation.position)


def test_every_pair_of_leaf_faults_is_refused_by_one_of_them() -> None:
    pairs = 0
    for (n1, c1, ch1, t1), (n2, c2, ch2, t2) in itertools.combinations(LEAF_FAULTS, 2):
        if t1 == t2 or set(ch1) & set(ch2):
            continue  # the same field twice, or changes that overwrite each other
        chain = [craft(W.leaf_spec(**{**ch1, **ch2}), W.profile), W.intermediate]
        code, position = answer(chain, W.anchor)
        assert code in (c1, c2) and position == 0, (n1, n2, code, position)
        pairs += 1
    assert pairs > 200  # the bound is real: most pairs are combined


# ---------------------------------------------------------------------------
# The issuer: it signs exactly what fits
# ---------------------------------------------------------------------------

SUBJECTS = {
    "deployment": SpiffeId(DEPLOYMENT),
    "own hub": SpiffeId(DEPLOYMENT, hub=HUB),
    "sibling hub": SpiffeId(DEPLOYMENT, hub=SIBLING),
    "own module": SpiffeId(DEPLOYMENT, hub=HUB, module=MODULE),
    "sibling's module": SpiffeId(DEPLOYMENT, hub=SIBLING, module=MODULE),
    "other deployment": SpiffeId(OTHER_DEPLOYMENT, hub=HUB),
}
ISSUERS = {
    "self": (None, None),
    "root": ("root", "root_key"),
    "intermediate": ("intermediate", "intermediate_key"),
    "leaf": ("leaf", "leaf_key"),
}


def _fits(
    role: str, issuer: str, subject: SpiffeId, curve: str, lifetime: int, signer_ok: bool
) -> bool:
    prof = W.profile
    if role not in prof.roles or not signer_ok:
        return False
    r = prof.roles[role]
    issuer_role = {
        "self": role,
        "root": "certificate-root",
        "intermediate": "hub-intermediate",
        "leaf": "module-leaf",
    }[issuer]
    if (issuer == "self") != r.self_signed or (issuer != "self" and r.issued_by != issuer_role):
        return False
    issuer_id = (
        subject
        if issuer == "self"
        else {"root": SpiffeId(DEPLOYMENT), "intermediate": SpiffeId(DEPLOYMENT, hub=HUB)}[issuer]
    )
    return (
        subject.kind is r.identity
        and subject.is_under(issuer_id)
        and curve == r.curve
        and 0 < lifetime <= CAPS[role]
    )


def test_the_issuer_signs_exactly_the_requests_that_fit() -> None:
    """Every role (and one that does not exist), every kind of issuer, every form of id, both
    curves, four lifetimes and the right or a wrong signing key. One start, half an hour
    before now, lies inside every issuer's validity, so the oracle is :func:`_fits` alone."""
    roles = [*W.profile.roles, "no-such-role"]
    anchor = Anchor.model_validate(W.anchor)
    start = NOW - timedelta(minutes=30)
    signed = refused = 0
    for role, issuer, (label, subject), curve, life, signer_ok in itertools.product(
        roles,
        ISSUERS,
        SUBJECTS.items(),
        ("secp256r1", "secp384r1"),
        ("zero", "an hour", "at the cap", "past the cap"),
        (True, False),
    ):
        cap = CAPS.get(role, 3600)
        seconds = {"zero": 0, "an hour": 3600, "at the cap": cap, "past the cap": cap + 1}[life]
        cert_attr, key_attr = ISSUERS[issuer]
        issuer_cert = getattr(W, cert_attr) if cert_attr else None
        subject_key = key(curve)
        right_key = subject_key if issuer == "self" else getattr(W, key_attr)
        signer = right_key if signer_ok else key(curve)
        request = Request(
            role, subject, subject_key.public_key(), start, timedelta(seconds=seconds)
        )
        expected = _fits(role, issuer, subject, curve, seconds, signer_ok)
        case = (role, issuer, label, curve, life, signer_ok)
        try:
            cert = issue(request, signer=signer, issuer=issuer_cert, profile=W.profile, caps=CAPS)
        except IssueRefusedError:
            assert not expected, case
            refused += 1
            continue
        assert expected, case
        signed += 1
        r = W.profile.roles[role]
        if r.ca:
            check_certificate(cert, r, W.profile.roles[r.issued_by], issuer_cert or cert, 0)
        else:
            got = verify(cert, [W.intermediate], anchor=anchor, profile=W.profile, now=NOW)
            assert (got.identity, got.role) == (subject, role), case
    # Exactly ten requests fit: the root signing itself, a hub intermediate for its own or a
    # sibling hub, a hub leaf and a module leaf, each for an hour or to the cap.
    assert (signed, signed + refused) == (10, 1920)


# ---------------------------------------------------------------------------
# The vectors the Go verifier reads
# ---------------------------------------------------------------------------


def test_the_go_vectors_hold_the_same_cases_and_answers() -> None:
    """The file's cases are the catalog's, and the Python verifier gives each its expectation
    on the very bytes the Go verifier reads (regenerate: uv run python -m tests.trust_world)."""
    vectors = json.loads(VECTORS.read_text(encoding="utf-8"))
    assert [c["name"] for c in vectors["cases"]] == [m.name for m in MUTATIONS]
    profile_entries = json.loads(
        (VECTORS.parents[5] / "forge-core/contract/lists/certificate-roles.list.json").read_text(
            encoding="utf-8"
        )
    )["entries"]
    assert vectors["profile"] == profile_entries
    for case, mutation in zip(vectors["cases"], MUTATIONS, strict=True):
        expect = case["expect"]
        assert (expect["code"], expect["position"], expect["ok"]) == (
            mutation.expect,
            mutation.position,
            mutation.expect is None,
        )
        chain = [x509.load_pem_x509_certificate(p.encode()) for p in case["chain"]]
        assert answer(chain, case["anchor"]) == (expect["code"], expect["position"]), case["name"]
