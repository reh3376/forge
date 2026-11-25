"""A trust root to test against, and the ways a certificate can be wrong (D-23 law 1).

:func:`world` builds a ``test``-staged deployment: two certificate roots (P-384), a hub
intermediate the anchor lists, a module leaf and a hub leaf, all from the real issuer, with
the anchor that holds them. :func:`craft` is a second, independent way to make a certificate,
which can get any field wrong; it never goes through the issuer. :data:`MUTATIONS` is the
catalog of single faults, each declaring the cause and the chain position at which both
verifiers must refuse it. That declaration is the oracle: neither verifier is checked against
itself.

The Go verifier reads the same cases from ``forge-core/src/go/trust/testdata/vectors.json``.
Regenerate it from the repository root with::

    uv run python -m tests.trust_world

Certificates are signed afresh each time (ECDSA), so the file's bytes change but its cases,
names and expectations do not; ``forge-core/tests/trust/test_vectors.py`` holds both.
"""

from __future__ import annotations

import json
import sys
from collections.abc import Callable
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

from forge_core.fxts.shared import lists
from forge_core.trust.anchor import FORM
from forge_core.trust.ids import SpiffeId
from forge_core.trust.issuer import Request, issue
from forge_core.trust.profile import Profile

REPO = Path(__file__).resolve().parents[1]
VECTORS = REPO / "forge-core/src/go/trust/testdata/vectors.json"
NOW = datetime(2026, 11, 25, 12, 0, tzinfo=UTC)
DEPLOYMENT, OTHER_DEPLOYMENT = "plant-a", "plant-b"
HUB, SIBLING, MODULE = "area-1", "area-2", "forge-ot"
DAY, YEAR = 86400, 365 * 86400
CAPS = {
    "certificate-root": 10 * YEAR,
    "hub-intermediate": YEAR,
    "hub-leaf": DAY,
    "module-leaf": DAY,
}
CURVES = {"secp256r1": ec.SECP256R1, "secp384r1": ec.SECP384R1}
HASHES = {"sha256": hashes.SHA256, "sha384": hashes.SHA384}
EKU = {
    "server_auth": ExtendedKeyUsageOID.SERVER_AUTH,
    "client_auth": ExtendedKeyUsageOID.CLIENT_AUTH,
}


def profile() -> Profile:
    document = json.loads(lists.list_path(lists.CERTIFICATE_ROLES).read_text(encoding="utf-8"))
    return Profile.from_entries(document["entries"], hash_=document["integrity"]["spec_hash"])


def key(curve: str = "secp256r1", seed: int | None = None) -> ec.EllipticCurvePrivateKey:
    if seed is None:
        return ec.generate_private_key(CURVES[curve]())
    return ec.derive_private_key(seed, CURVES[curve]())


def pem(certificate: x509.Certificate) -> str:
    return certificate.public_bytes(serialization.Encoding.PEM).decode()


def public_pem(private: ec.EllipticCurvePrivateKey) -> str:
    return (
        private.public_key()
        .public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
        .decode()
    )


# ---------------------------------------------------------------------------
# An independent crafter: any field can be wrong
# ---------------------------------------------------------------------------

KEEP: Any = object()


@dataclass(frozen=True)
class Spec:
    role: str
    subject: SpiffeId
    key: ec.EllipticCurvePrivateKey
    issuer: x509.Certificate | None
    issuer_key: ec.EllipticCurvePrivateKey
    not_before: datetime
    not_after: datetime
    hash: str | None = None
    ca: Any = KEEP
    path_length: Any = KEEP
    bc_critical: bool = True
    key_usage: frozenset[str] | None = None
    ku_critical: bool = True
    eku: tuple[str, ...] | None = None
    eku_critical: bool = False
    san: tuple[x509.GeneralName, ...] | None = None
    san_critical: bool = True
    subject_name: x509.Name | None = None
    ski: bytes | None = None
    aki: bytes | None = None
    omit: frozenset[str] = frozenset()
    extra: tuple[x509.ExtensionType, ...] = ()
    #: extensions added as they are, with their criticality (raw DER through UnrecognizedExtension)
    raw: tuple[tuple[x509.ExtensionType, bool], ...] = ()
    ski_critical: bool = False
    aki_critical: bool = False


def craft(spec: Spec, prof: Profile) -> x509.Certificate:
    role = prof.roles[spec.role]
    issuer_role = role if spec.issuer is None else prof.roles[role.issued_by]
    subject = spec.subject_name or x509.Name(
        [
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, spec.subject.deployment),
            x509.NameAttribute(NameOID.ORGANIZATIONAL_UNIT_NAME, role.id),
            x509.NameAttribute(NameOID.COMMON_NAME, spec.subject.last),
        ]
    )
    public = spec.key.public_key()
    issuer_public = public if spec.issuer is None else spec.issuer.public_key()
    usage = spec.key_usage if spec.key_usage is not None else role.key_usage
    eku = spec.eku if spec.eku is not None else tuple(sorted(role.extended_key_usage))
    builder = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(subject if spec.issuer is None else spec.issuer.subject)
        .public_key(public)
        .serial_number(x509.random_serial_number())
        .not_valid_before(spec.not_before)
        .not_valid_after(spec.not_after)
    )
    extensions: list[tuple[str, x509.ExtensionType, bool]] = [
        (
            "basic_constraints",
            x509.BasicConstraints(
                ca=role.ca if spec.ca is KEEP else spec.ca,
                path_length=role.path_length if spec.path_length is KEEP else spec.path_length,
            ),
            spec.bc_critical,
        ),
        (
            "key_usage",
            x509.KeyUsage(
                digital_signature="digital_signature" in usage,
                content_commitment=False,
                key_encipherment="key_encipherment" in usage,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign="key_cert_sign" in usage,
                crl_sign="crl_sign" in usage,
                encipher_only=False,
                decipher_only=False,
            ),
            spec.ku_critical,
        ),
        (
            "san",
            x509.SubjectAlternativeName(
                list(spec.san)
                if spec.san is not None
                else [x509.UniformResourceIdentifier(str(spec.subject))]
            ),
            spec.san_critical,
        ),
        (
            "ski",
            x509.SubjectKeyIdentifier(spec.ski)
            if spec.ski is not None
            else x509.SubjectKeyIdentifier.from_public_key(public),
            spec.ski_critical,
        ),
        (
            "aki",
            x509.AuthorityKeyIdentifier(spec.aki, None, None)
            if spec.aki is not None
            else x509.AuthorityKeyIdentifier.from_issuer_public_key(issuer_public),
            spec.aki_critical,
        ),
    ]
    if eku:
        extensions.append(("eku", x509.ExtendedKeyUsage([EKU[e] for e in eku]), spec.eku_critical))
    for name, value, critical in extensions:
        if name not in spec.omit:
            builder = builder.add_extension(value, critical=critical)
    for value in spec.extra:
        builder = builder.add_extension(value, critical=False)
    for value, critical in spec.raw:
        builder = builder.add_extension(value, critical=critical)
    algorithm = HASHES[spec.hash or str(issuer_role.signs_with)]()
    return builder.sign(spec.issuer_key, algorithm)


# ---------------------------------------------------------------------------
# The world: a test-staged deployment made by the real issuer
# ---------------------------------------------------------------------------


@dataclass
class World:
    profile: Profile
    root_key: ec.EllipticCurvePrivateKey
    root: x509.Certificate
    root2_key: ec.EllipticCurvePrivateKey
    root2: x509.Certificate
    intermediate_key: ec.EllipticCurvePrivateKey
    intermediate: x509.Certificate
    leaf_key: ec.EllipticCurvePrivateKey
    leaf: x509.Certificate
    hub_leaf: x509.Certificate
    anchor: dict[str, Any] = field(default_factory=dict)

    def leaf_spec(self, **changes: Any) -> Spec:
        base = Spec(
            role="module-leaf",
            subject=SpiffeId(DEPLOYMENT, hub=HUB, module=MODULE),
            key=self.leaf_key,
            issuer=self.intermediate,
            issuer_key=self.intermediate_key,
            not_before=NOW - timedelta(hours=1),
            not_after=NOW + timedelta(hours=1),
        )
        return replace(base, **changes)

    def intermediate_spec(self, **changes: Any) -> Spec:
        base = Spec(
            role="hub-intermediate",
            subject=SpiffeId(DEPLOYMENT, hub=HUB),
            key=self.intermediate_key,
            issuer=self.root,
            issuer_key=self.root_key,
            not_before=NOW - timedelta(days=30),
            not_after=NOW + timedelta(days=30),
        )
        return replace(base, **changes)

    def with_intermediate(self, certificate: x509.Certificate, hub: str = HUB) -> dict[str, Any]:
        """The anchor, listing ``certificate`` as the hub intermediate in place of the world's."""
        return {**self.anchor, "hub_intermediates": [{"hub": hub, "certificate": pem(certificate)}]}


def _fido(n: int) -> dict[str, str]:
    blob = (b"forge-test-key-%d" % n).hex()
    return {
        "id": f"key-{n}",
        "public_key": f"sk-ssh-ed25519@openssh.com AAAA{blob} test key {n}",
        "device": f"test-device-{n}",
    }


def world(stage: str = "test") -> World:
    prof = profile()
    root_key, root2_key = key("secp384r1", 1001), key("secp384r1", 1002)
    root_id = SpiffeId(DEPLOYMENT)
    start = NOW - timedelta(days=365)

    def root_of(private: ec.EllipticCurvePrivateKey) -> x509.Certificate:
        return issue(
            Request("certificate-root", root_id, private.public_key(), start, timedelta(days=3000)),
            signer=private,
            issuer=None,
            profile=prof,
            caps=CAPS,
        )

    root, root2 = root_of(root_key), root_of(root2_key)
    intermediate_key = key("secp256r1", 2001)
    intermediate = issue(
        Request(
            "hub-intermediate",
            SpiffeId(DEPLOYMENT, hub=HUB),
            intermediate_key.public_key(),
            NOW - timedelta(days=30),
            timedelta(days=60),
        ),
        signer=root_key,
        issuer=root,
        profile=prof,
        caps=CAPS,
    )
    leaf_key = key("secp256r1", 3001)

    def leaf_of(
        subject: SpiffeId, role: str, private: ec.EllipticCurvePrivateKey
    ) -> x509.Certificate:
        return issue(
            Request(
                role, subject, private.public_key(), NOW - timedelta(hours=1), timedelta(hours=2)
            ),
            signer=intermediate_key,
            issuer=intermediate,
            profile=prof,
            caps=CAPS,
        )

    leaf = leaf_of(SpiffeId(DEPLOYMENT, hub=HUB, module=MODULE), "module-leaf", leaf_key)
    hub_leaf = leaf_of(SpiffeId(DEPLOYMENT, hub=HUB), "hub-leaf", key("secp256r1", 3002))
    attestation_root_key = key("secp256r1", 4001)
    attestation_root = _self_signed_ca(attestation_root_key)
    anchor = {
        "form": FORM,
        "deployment": DEPLOYMENT,
        "version": 1,
        "stage": stage,
        "root_keys": [_fido(1), _fido(2), _fido(3)],
        "root_threshold": 2,
        "release_keys": [_fido(4), _fido(5)],
        "certificate_roots": [
            {"id": "root-b", "certificate": pem(root), "attestation": [pem(attestation_root)]},
            {"id": "root-d", "certificate": pem(root2), "attestation": [pem(attestation_root)]},
        ],
        "hub_intermediates": [{"hub": HUB, "certificate": pem(intermediate)}],
        "distribution_key": public_pem(key("secp256r1", 5001)),
        "freshness_key": public_pem(key("secp256r1", 5002)),
        "test_attestation_roots": [] if stage == "production" else [pem(attestation_root)],
        "policy": {
            "profile": prof.hash,
            "lifetimes": dict(CAPS),
            "security_key_type": "ed25519-sk",
            "intermediates_per_hub": 2,
            "separation_of_duties": stage == "production",
        },
    }
    return World(
        prof,
        root_key,
        root,
        root2_key,
        root2,
        intermediate_key,
        intermediate,
        leaf_key,
        leaf,
        hub_leaf,
        anchor,
    )


def _self_signed_ca(private: ec.EllipticCurvePrivateKey) -> x509.Certificate:
    """A stand-in for a maker's attestation root under the test stage (not a trust-root role)."""
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "forge test attestation root")])
    return (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(private.public_key())
        .serial_number(1)
        .not_valid_before(NOW - timedelta(days=365))
        .not_valid_after(NOW + timedelta(days=3650))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(private, hashes.SHA256())
    )


# ---------------------------------------------------------------------------
# The catalog of single faults
# ---------------------------------------------------------------------------

Build = Callable[[World], tuple[list[x509.Certificate], dict[str, Any]]]


@dataclass(frozen=True)
class Mutation:
    name: str
    expect: str | None  # the code both verifiers give; None means accepted
    position: int | None
    build: Build
    #: the profile field or cause it exercises, for the pairs (see test_certificates_law.py)
    touches: str = ""


def _leaf(**changes: Any) -> Build:
    def build(w: World) -> tuple[list[x509.Certificate], dict[str, Any]]:
        return [craft(w.leaf_spec(**changes), w.profile), w.intermediate], w.anchor

    return build


def _intermediate(**changes: Any) -> Build:
    """A changed intermediate (same key, so the anchor still lists it) and a leaf under it."""

    def build(w: World) -> tuple[list[x509.Certificate], dict[str, Any]]:
        inter = craft(w.intermediate_spec(**changes), w.profile)
        leaf = craft(w.leaf_spec(issuer=inter), w.profile)
        return [leaf, inter], w.with_intermediate(inter)

    return build


def _other_key() -> ec.EllipticCurvePrivateKey:
    return key("secp256r1", 9001)


def _unlisted_intermediate(w: World) -> tuple[list[x509.Certificate], dict[str, Any]]:
    other = key("secp256r1", 9002)
    inter = craft(w.intermediate_spec(key=other), w.profile)
    leaf = craft(w.leaf_spec(issuer=inter, issuer_key=other), w.profile)
    return [leaf, inter], w.anchor


def _listed_for_another_hub(w: World) -> tuple[list[x509.Certificate], dict[str, Any]]:
    return [w.leaf, w.intermediate], w.with_intermediate(w.intermediate, hub=SIBLING)


def _foreign_root(w: World) -> tuple[list[x509.Certificate], dict[str, Any]]:
    foreign_key = key("secp384r1", 9003)
    foreign = craft(
        Spec(
            "certificate-root",
            SpiffeId(DEPLOYMENT),
            foreign_key,
            None,
            foreign_key,
            NOW - timedelta(days=365),
            NOW + timedelta(days=3000),
        ),
        w.profile,
    )
    inter = craft(w.intermediate_spec(issuer=foreign, issuer_key=foreign_key), w.profile)
    leaf = craft(w.leaf_spec(issuer=inter), w.profile)
    return [leaf, inter], w.with_intermediate(inter)


def _second_root(w: World) -> tuple[list[x509.Certificate], dict[str, Any]]:
    inter = craft(w.intermediate_spec(issuer=w.root2, issuer_key=w.root2_key), w.profile)
    leaf = craft(w.leaf_spec(issuer=inter), w.profile)
    return [leaf, inter], w.with_intermediate(inter)


def _expired_intermediate(w: World) -> tuple[list[x509.Certificate], dict[str, Any]]:
    inter = craft(
        w.intermediate_spec(
            not_before=NOW - timedelta(days=30), not_after=NOW - timedelta(hours=2)
        ),
        w.profile,
    )
    leaf = craft(
        w.leaf_spec(
            issuer=inter, not_before=NOW - timedelta(hours=4), not_after=NOW - timedelta(hours=3)
        ),
        w.profile,
    )
    return [leaf, inter], w.with_intermediate(inter)


def _presented(chain: Callable[[World], list[x509.Certificate]]) -> Build:
    return lambda w: (chain(w), w.anchor)


_URI = x509.UniformResourceIdentifier
_OTHER = SpiffeId(OTHER_DEPLOYMENT, hub=HUB, module=MODULE)
_SIBLING = SpiffeId(DEPLOYMENT, hub=SIBLING, module=MODULE)
_NAME_CONSTRAINTS = x509.NameConstraints(
    permitted_subtrees=[_URI(f"spiffe://{DEPLOYMENT}")], excluded_subtrees=None
)
_POLICY = x509.CertificatePolicies(
    [x509.PolicyInformation(x509.ObjectIdentifier("2.5.29.32.0"), None)]
)


def _subject(o: str, ou: str, cn: str) -> x509.Name:
    return x509.Name(
        [
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, o),
            x509.NameAttribute(NameOID.ORGANIZATIONAL_UNIT_NAME, ou),
            x509.NameAttribute(NameOID.COMMON_NAME, cn),
        ]
    )


#: The leaf's single faults: name, the code both verifiers give at position 0, the change to
#: an issued module leaf, and the field or cause it touches (faults that touch different ones
#: are combined in pairs by forge-core/tests/trust/test_certificates_law.py).
LEAF_FAULTS: tuple[tuple[str, str, dict[str, Any], str], ...] = (
    (
        "leaf signed with SHA-384",
        "profile/signature-algorithm",
        {"hash": "sha384"},
        "signature-algorithm",
    ),
    ("leaf key on P-384", "profile/curve", {"key": key("secp384r1", 9010)}, "curve"),
    ("leaf with a certificate policy", "profile/extensions", {"extra": (_POLICY,)}, "extensions"),
    (
        "leaf without a subject key identifier",
        "profile/extensions",
        {"omit": frozenset({"ski"})},
        "extensions",
    ),
    (
        "leaf without extended key usage",
        "profile/extensions",
        {"omit": frozenset({"eku"})},
        "extensions",
    ),
    (
        "leaf basic constraints not critical",
        "profile/basic-constraints",
        {"bc_critical": False},
        "basic-constraints",
    ),
    ("leaf claims to be a CA", "profile/basic-constraints", {"ca": True}, "basic-constraints"),
    (
        "leaf may encipher keys",
        "profile/key-usage",
        {"key_usage": frozenset({"digital_signature", "key_encipherment"})},
        "key-usage",
    ),
    ("leaf key usage not critical", "profile/key-usage", {"ku_critical": False}, "key-usage"),
    (
        "leaf may only serve",
        "profile/extended-key-usage",
        {"eku": ("server_auth",)},
        "extended-key-usage",
    ),
    (
        "leaf extended key usage critical",
        "profile/extended-key-usage",
        {"eku_critical": True},
        "extended-key-usage",
    ),
    (
        "leaf name not critical",
        "profile/subject-alt-name",
        {"san_critical": False},
        "subject-alt-name",
    ),
    (
        "leaf with two URI names",
        "profile/subject-alt-name",
        {
            "san": (
                _URI(f"spiffe://{DEPLOYMENT}/hub/{HUB}/module/{MODULE}"),
                _URI(f"spiffe://{DEPLOYMENT}/hub/{HUB}/module/x"),
            )
        },
        "subject-alt-name",
    ),
    (
        "leaf named by DNS",
        "profile/subject-alt-name",
        {"san": (x509.DNSName("forge-ot.local"),)},
        "subject-alt-name",
    ),
    (
        "leaf with a spiffe id of no form",
        "profile/subject-alt-name",
        {"san": (_URI(f"spiffe://{DEPLOYMENT}/module/{MODULE}"),)},
        "subject-alt-name",
    ),
    (
        "leaf subject names another role",
        "profile/subject",
        {"subject_name": _subject(DEPLOYMENT, "hub-leaf", MODULE)},
        "subject",
    ),
    (
        "leaf with someone else's key identifier",
        "profile/key-identifiers",
        {"ski": b"\x01" * 20},
        "key-identifiers",
    ),
    (
        "leaf naming another authority key",
        "profile/key-identifiers",
        {"aki": b"\x02" * 20},
        "key-identifiers",
    ),
    ("leaf signed by another key", "signature", {"issuer_key": _other_key()}, "signature"),
    ("leaf in another deployment", "identity", {"subject": _OTHER}, "identity"),
    ("leaf for a sibling hub's module", "identity", {"subject": _SIBLING}, "identity"),
    (
        "leaf not yet valid",
        "not-yet-valid",
        {"not_before": NOW + timedelta(minutes=5), "not_after": NOW + timedelta(hours=2)},
        "time",
    ),
    (
        "leaf expired",
        "expired",
        {"not_before": NOW - timedelta(hours=3), "not_after": NOW - timedelta(minutes=5)},
        "time",
    ),
    (
        "leaf outlives its issuer",
        "validity-nesting",
        {"not_after": NOW + timedelta(days=31)},
        "nesting",
    ),
    (
        "leaf over its lifetime cap",
        "lifetime",
        {"not_before": NOW - timedelta(hours=30), "not_after": NOW + timedelta(hours=1)},
        "lifetime",
    ),
)


MUTATIONS: tuple[Mutation, ...] = (
    Mutation("module leaf, as issued", None, None, lambda w: ([w.leaf, w.intermediate], w.anchor)),
    Mutation("hub leaf, as issued", None, None, lambda w: ([w.hub_leaf, w.intermediate], w.anchor)),
    Mutation(
        "module leaf, root sent along",
        None,
        None,
        lambda w: ([w.leaf, w.intermediate, w.root], w.anchor),
    ),
    Mutation("intermediate from the second root", None, None, _second_root),
    *(
        Mutation(name, code, 0, _leaf(**changes), touches)
        for name, code, changes, touches in LEAF_FAULTS
    ),
    # the intermediate
    Mutation("intermediate the anchor does not list", "not-in-anchor", 1, _unlisted_intermediate),
    Mutation("intermediate listed for another hub", "not-in-anchor", 1, _listed_for_another_hub),
    Mutation("intermediate from a root outside the anchor", "not-in-anchor", 2, _foreign_root),
    Mutation(
        "intermediate with path length 1",
        "profile/basic-constraints",
        1,
        _intermediate(path_length=1),
    ),
    Mutation(
        "intermediate cannot sign revocations",
        "profile/key-usage",
        1,
        _intermediate(key_usage=frozenset({"key_cert_sign"})),
    ),
    Mutation(
        "intermediate with name constraints",
        "profile/extensions",
        1,
        _intermediate(extra=(_NAME_CONSTRAINTS,)),
    ),
    Mutation(
        "intermediate with extended key usage",
        "profile/extensions",
        1,
        _intermediate(eku=("server_auth",)),
    ),
    Mutation(
        "intermediate key on P-384", "profile/curve", 1, _intermediate(key=key("secp384r1", 9011))
    ),
    Mutation("intermediate expired", "expired", 1, _expired_intermediate),
    # the chain's shape
    Mutation("leaf without its intermediate", "not-in-anchor", 1, _presented(lambda w: [w.leaf])),
    Mutation(
        "chain in the wrong order",
        "not-in-anchor",
        2,
        _presented(lambda w: [w.intermediate, w.leaf]),
    ),
    Mutation(
        "chain too long",
        "chain",
        0,
        _presented(lambda w: [w.leaf, w.intermediate, w.intermediate, w.intermediate]),
    ),
)


def vectors() -> dict[str, Any]:
    """The cases for the Go verifier: one world, every mutation, the expected answer."""
    w = world()
    cases = []
    for m in MUTATIONS:
        chain, anchor = m.build(w)
        cases.append(
            {
                "name": m.name,
                "chain": [pem(c) for c in chain],
                "anchor": anchor,
                "expect": {"ok": m.expect is None, "code": m.expect, "position": m.position},
            }
        )
    return {
        "comment": "Generated by `uv run python -m tests.trust_world`; see tests/trust_world.py.",
        "now": NOW.isoformat().replace("+00:00", "Z"),
        "profile": json.loads(lists.list_path(lists.CERTIFICATE_ROLES).read_text(encoding="utf-8"))[
            "entries"
        ],
        "cases": cases,
    }


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else VECTORS
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(vectors(), indent=1) + "\n", encoding="utf-8")
    print(f"{len(MUTATIONS)} cases written to {target.relative_to(REPO)}")
