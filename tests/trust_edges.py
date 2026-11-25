"""The edges of the two verifiers: malformed DER, odd encodings and other hashes (D-23 law 1).

Found by a differential probe on 2026-11-25 that ran these chains through the Python and the Go
verifier. Each case declares the answer both must give. A few certificates Go's own parser
refuses before its verifier runs (go_parses false); Python refuses them by name, and Go's
test holds that its parser refuses them. Three answers are leniencies both share, kept visible:
a key-usage bit beyond the nine RFC 5280 defines is ignored; a name attribute's string type is
not compared, only its value; a hub intermediate presented alone is accepted as itself (role
hub-intermediate), so a caller requires the role it expects.

Regenerate forge-core/src/go/trust/testdata/edges.json from the repository root with::

    uv run python -m tests.trust_edges
"""

from __future__ import annotations

import json
from datetime import timedelta

from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.x509.name import _ASN1Type
from cryptography.x509.oid import ExtendedKeyUsageOID, ExtensionOID, NameOID

from forge_core.trust.ids import SpiffeId
from tests.trust_world import DEPLOYMENT, HUB, MODULE, NOW, REPO, key, pem, world

EDGES = REPO / "forge-core/src/go/trust/testdata/edges.json"
#: name: (the code both verifiers give, or None when accepted; the position; whether Go's
#: certificate parser reads every certificate of the chain)
ANSWERS: dict[str, tuple[str | None, int | None, bool]] = {
    "BC cA false with a path length": ("profile/extensions", 0, True),
    "BC cA FALSE encoded (DEFAULT)": ("profile/extensions", 0, True),
    "BC with trailing data": ("profile/extensions", 0, True),
    "BC cA true, path 0, on a leaf": ("profile/basic-constraints", 0, True),
    "KU encipherOnly without keyAgreement": ("profile/extensions", 0, True),
    "KU bit 9 set beside digitalSignature": (None, None, True),
    "AKI serial without issuer": ("profile/extensions", 0, True),
    "AKI issuer and serial": ("profile/key-identifiers", 0, True),
    "AKI empty": ("profile/key-identifiers", 0, True),
    "SKI critical": ("profile/key-identifiers", 0, False),
    "AKI critical": ("profile/key-identifiers", 0, False),
    "SAN x400Address": ("profile/extensions", 0, True),
    "SAN empty": ("profile/subject-alt-name", 0, True),
    "SAN directoryName only": ("profile/subject-alt-name", 0, True),
    "SAN id with a trailing newline": ("profile/subject-alt-name", 0, False),
    "subject O as PrintableString": (None, None, True),
    "subject CN as BMPString": (None, None, True),
    "EKU duplicated": ("profile/extended-key-usage", 0, True),
    "EKU with code signing too": ("profile/extended-key-usage", 0, True),
    "extra InhibitAnyPolicy of -1": ("profile/extensions", 0, True),
    "issuer name not the intermediate's": ("signature", 0, True),
    "intermediate signed with SHA-224": ("profile/signature-algorithm", 1, True),
    "intermediate signed with sha512": ("profile/signature-algorithm", 1, True),
    "intermediate signed with sha3_224": ("profile/signature-algorithm", 1, True),
    "intermediate signed with sha3_256": ("profile/signature-algorithm", 1, True),
    "intermediate signed with sha3_384": ("profile/signature-algorithm", 1, True),
    "intermediate signed with sha3_512": ("profile/signature-algorithm", 1, True),
    "leaf signed with SHA-224": ("profile/signature-algorithm", 0, True),
    "root KU encipherOnly without keyAgreement": ("profile/extensions", 2, True),
    "only the intermediate presented": (None, None, True),
    "only the root presented": ("chain", 0, True),
}

H = {
    "sha224": hashes.SHA224,
    "sha256": hashes.SHA256,
    "sha384": hashes.SHA384,
    "sha512": hashes.SHA512,
    "sha3_224": hashes.SHA3_224,
    "sha3_256": hashes.SHA3_256,
    "sha3_384": hashes.SHA3_384,
    "sha3_512": hashes.SHA3_512,
}
EKU = {
    "server_auth": ExtendedKeyUsageOID.SERVER_AUTH,
    "client_auth": ExtendedKeyUsageOID.CLIENT_AUTH,
}
OIDS = {
    "bc": ExtensionOID.BASIC_CONSTRAINTS,
    "ku": ExtensionOID.KEY_USAGE,
    "san": ExtensionOID.SUBJECT_ALTERNATIVE_NAME,
    "ski": ExtensionOID.SUBJECT_KEY_IDENTIFIER,
    "aki": ExtensionOID.AUTHORITY_KEY_IDENTIFIER,
    "eku": ExtensionOID.EXTENDED_KEY_USAGE,
}
w = world()
P = w.profile
LEAF_ID = SpiffeId(DEPLOYMENT, hub=HUB, module=MODULE)


def name(o, ou, cn, types=(None, None, None)):
    attrs = []
    for oid, v, t in zip(
        (NameOID.ORGANIZATION_NAME, NameOID.ORGANIZATIONAL_UNIT_NAME, NameOID.COMMON_NAME),
        (o, ou, cn),
        types,
        strict=True,
    ):
        attrs.append(x509.NameAttribute(oid, v, t) if t else x509.NameAttribute(oid, v))
    return x509.Name(attrs)


def build(
    role_id,
    sid,
    public,
    issuer,
    signer,
    nb,
    na,
    *,
    hash_=None,
    over=None,
    extra=(),
    subject=None,
    issuer_name=None,
):
    role = P.roles[role_id]
    issuer_role = role if issuer is None else P.roles[role.issued_by]
    subject = subject or name(sid.deployment, role.id, sid.last)
    issuer_public = public if issuer is None else issuer.public_key()
    u = role.key_usage
    std = {
        "bc": (x509.BasicConstraints(ca=role.ca, path_length=role.path_length), True),
        "ku": (
            x509.KeyUsage(
                "digital_signature" in u,
                False,
                False,
                False,
                False,
                "key_cert_sign" in u,
                "crl_sign" in u,
                False,
                False,
            ),
            True,
        ),
        "san": (x509.SubjectAlternativeName([x509.UniformResourceIdentifier(str(sid))]), True),
        "ski": (x509.SubjectKeyIdentifier.from_public_key(public), False),
        "aki": (x509.AuthorityKeyIdentifier.from_issuer_public_key(issuer_public), False),
    }
    if role.extended_key_usage:
        std["eku"] = (
            x509.ExtendedKeyUsage([EKU[e] for e in sorted(role.extended_key_usage)]),
            False,
        )
    for k, (v, crit) in (over or {}).items():
        if isinstance(v, bytes):
            v = x509.UnrecognizedExtension(OIDS[k], v)
        std[k] = (v, crit)
    b = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer_name or (subject if issuer is None else issuer.subject))
        .public_key(public)
        .serial_number(x509.random_serial_number())
        .not_valid_before(nb)
        .not_valid_after(na)
    )
    for v, crit in std.values():
        b = b.add_extension(v, critical=crit)
    for v, crit in extra:
        b = b.add_extension(v, critical=crit)
    return b.sign(signer, H[hash_ or issuer_role.signs_with]())


def leaf(**kw):
    sid = kw.pop("sid", LEAF_ID)
    return build(
        "module-leaf",
        sid,
        w.leaf_key.public_key(),
        w.intermediate,
        w.intermediate_key,
        NOW - timedelta(hours=1),
        NOW + timedelta(hours=1),
        **kw,
    )


def ext(der_hex):
    return bytes.fromhex(der_hex.replace(" ", ""))


def edges() -> dict:
    """Every edge case, with its declared answer."""
    cases = []

    def case(label, chain, anchor=None):
        code, position, go_parses = ANSWERS[label]
        cases.append(
            {
                "name": label,
                "chain": [pem(c) for c in chain],
                "anchor": anchor or w.anchor,
                "go_parses": go_parses,
                "expect": {"ok": code is None, "code": code, "position": position},
            }
        )

    inter = w.intermediate
    kid = x509.SubjectKeyIdentifier.from_public_key(inter.public_key()).digest.hex()
    case(
        "BC cA false with a path length", [leaf(over={"bc": (ext("30 03 02 01 00"), True)}), inter]
    )
    case("BC cA FALSE encoded (DEFAULT)", [leaf(over={"bc": (ext("30 03 01 01 00"), True)}), inter])
    case("BC with trailing data", [leaf(over={"bc": (ext("30 00 05 00"), True)}), inter])
    case(
        "BC cA true, path 0, on a leaf",
        [leaf(over={"bc": (x509.BasicConstraints(True, 0), True)}), inter],
    )
    case(
        "KU encipherOnly without keyAgreement",
        [leaf(over={"ku": (ext("03 02 00 81"), True)}), inter],
    )
    case(
        "KU bit 9 set beside digitalSignature",
        [leaf(over={"ku": (ext("03 03 06 80 40"), True)}), inter],
    )
    case(
        "AKI serial without issuer",
        [leaf(over={"aki": (ext("30 19 80 14" + kid + "82 01 01"), False)}), inter],
    )
    case(
        "AKI issuer and serial",
        [leaf(over={"aki": (ext("30 1e 80 14" + kid + "a1 03 82 01 78 82 01 01"), False)}), inter],
    )
    case("AKI empty", [leaf(over={"aki": (ext("30 00"), False)}), inter])
    case(
        "SKI critical",
        [
            leaf(
                over={
                    "ski": (
                        x509.SubjectKeyIdentifier.from_public_key(w.leaf_key.public_key()),
                        True,
                    )
                }
            ),
            inter,
        ],
    )
    case(
        "AKI critical",
        [
            leaf(
                over={
                    "aki": (
                        x509.AuthorityKeyIdentifier.from_issuer_public_key(inter.public_key()),
                        True,
                    )
                }
            ),
            inter,
        ],
    )
    case("SAN x400Address", [leaf(over={"san": (ext("30 02 a3 00"), True)}), inter])
    case("SAN empty", [leaf(over={"san": (ext("30 00"), True)}), inter])
    case(
        "SAN directoryName only",
        [
            leaf(
                over={
                    "san": (
                        x509.SubjectAlternativeName([x509.DirectoryName(name("a", "b", "c"))]),
                        True,
                    )
                }
            ),
            inter,
        ],
    )
    case(
        "SAN id with a trailing newline",
        [
            leaf(
                over={
                    "san": (
                        x509.SubjectAlternativeName(
                            [x509.UniformResourceIdentifier(str(LEAF_ID) + "\n")]
                        ),
                        True,
                    )
                }
            ),
            inter,
        ],
    )
    case(
        "subject O as PrintableString",
        [
            leaf(
                subject=name(
                    DEPLOYMENT, "module-leaf", MODULE, (_ASN1Type.PrintableString, None, None)
                )
            ),
            inter,
        ],
    )
    case(
        "subject CN as BMPString",
        [
            leaf(
                subject=name(DEPLOYMENT, "module-leaf", MODULE, (None, None, _ASN1Type.BMPString))
            ),
            inter,
        ],
    )
    case(
        "EKU duplicated",
        [
            leaf(
                over={
                    "eku": (
                        x509.ExtendedKeyUsage(
                            [EKU["client_auth"], EKU["server_auth"], EKU["server_auth"]]
                        ),
                        False,
                    )
                }
            ),
            inter,
        ],
    )
    case(
        "EKU with code signing too",
        [
            leaf(
                over={
                    "eku": (
                        x509.ExtendedKeyUsage(
                            [
                                EKU["client_auth"],
                                EKU["server_auth"],
                                ExtendedKeyUsageOID.CODE_SIGNING,
                            ]
                        ),
                        False,
                    )
                }
            ),
            inter,
        ],
    )
    case(
        "extra InhibitAnyPolicy of -1",
        [
            leaf(
                extra=(
                    (
                        x509.UnrecognizedExtension(
                            ExtensionOID.INHIBIT_ANY_POLICY, ext("02 01 ff")
                        ),
                        False,
                    ),
                )
            ),
            inter,
        ],
    )
    case(
        "issuer name not the intermediate's",
        [leaf(issuer_name=name(DEPLOYMENT, "hub-intermediate", "area-9")), inter],
    )
    inter224 = build(
        "hub-intermediate",
        SpiffeId(DEPLOYMENT, hub=HUB),
        w.intermediate_key.public_key(),
        w.root,
        w.root_key,
        NOW - timedelta(days=30),
        NOW + timedelta(days=30),
        hash_="sha224",
    )
    case("intermediate signed with SHA-224", [leaf(), inter224], w.with_intermediate(inter224))
    leaf224 = build(
        "module-leaf",
        LEAF_ID,
        w.leaf_key.public_key(),
        inter,
        w.intermediate_key,
        NOW - timedelta(hours=1),
        NOW + timedelta(hours=1),
        hash_="sha224",
    )
    for h in ("sha512", "sha3_224", "sha3_256", "sha3_384", "sha3_512"):
        ih = build(
            "hub-intermediate",
            SpiffeId(DEPLOYMENT, hub=HUB),
            w.intermediate_key.public_key(),
            w.root,
            w.root_key,
            NOW - timedelta(days=30),
            NOW + timedelta(days=30),
            hash_=h,
        )
        case(f"intermediate signed with {h}", [leaf(), ih], w.with_intermediate(ih))
    case("leaf signed with SHA-224", [leaf224, inter])
    rk = key("secp384r1", 7001)
    bad_root = build(
        "certificate-root",
        SpiffeId(DEPLOYMENT),
        rk.public_key(),
        None,
        rk,
        NOW - timedelta(days=365),
        NOW + timedelta(days=3000),
        over={"ku": (ext("03 02 00 07"), True)},
    )
    inter_b = build(
        "hub-intermediate",
        SpiffeId(DEPLOYMENT, hub=HUB),
        w.intermediate_key.public_key(),
        bad_root,
        rk,
        NOW - timedelta(days=30),
        NOW + timedelta(days=30),
    )
    leaf_b = build(
        "module-leaf",
        LEAF_ID,
        w.leaf_key.public_key(),
        inter_b,
        w.intermediate_key,
        NOW - timedelta(hours=1),
        NOW + timedelta(hours=1),
    )
    anchor_b = {
        **w.anchor,
        "certificate_roots": [{**w.anchor["certificate_roots"][0], "certificate": pem(bad_root)}],
        "hub_intermediates": [{"hub": HUB, "certificate": pem(inter_b)}],
    }
    case("root KU encipherOnly without keyAgreement", [leaf_b, inter_b], anchor_b)
    case("only the intermediate presented", [inter])
    case("only the root presented", [w.root])

    assert [c["name"] for c in cases] == list(ANSWERS), "every declared answer has its case"
    return {
        "comment": "Generated by .",
        "now": NOW.isoformat().replace("+00:00", "Z"),
        "cases": cases,
    }


if __name__ == "__main__":
    EDGES.write_text(json.dumps(edges(), indent=1) + "\n", encoding="utf-8")
    print(f"{len(ANSWERS)} edge cases written to {EDGES.relative_to(REPO)}")
