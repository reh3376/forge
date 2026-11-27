"""The anchors both verifiers are held to (FB-317): which documents can be built as an anchor.

An anchor names keys: its certificate roots', its hub intermediates', its distribution key and
its freshness keys. Each must be an admitted key in its one encoding, and none may be named
twice. Python's parser and Go's disagree on what else is a key, so the cases live in one file
that both test suites read, each with its declared answer:

* **every spelling of a key, in every key field**: what a device exports, the same key in other
  lines, other curves and other kinds of key, other encodings of the same point, loose
  base64, other labels, and things that are no key at all;
* **every kind of certificate, in both certificate fields**;
* **every pair of places a key can be named**, given one key;
* the number of freshness keys an anchor of each stage holds (FB-311);
* **every certificate of the edges and the vectors, as a hub intermediate**: the certificates
  the two parsers were found to disagree on (a key identifier marked critical, a name one of
  them cannot read). Reading an anchor reads a certificate's structure and its key and no
  more, so both build these; whether a certificate fits its role is the profile's check. These
  cases name their certificate in ``edges.json`` or ``vectors.json`` and do not repeat it.

The answers are declared here, apart from the code under test: a case says ``built`` or
``refused``, and a refusal by the key rules says which words it must carry.

Write the file both suites read (after a change here, to the world or to the rules)::

    uv run python -m tests.trust_anchors
"""

from __future__ import annotations

import base64
import json
import sys
import textwrap
from datetime import timedelta
from itertools import combinations
from pathlib import Path
from typing import Any

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, ed448, ed25519, rsa, x25519
from cryptography.x509.oid import NameOID

from forge_core.trust.ids import SpiffeId
from tests.trust_world import DEPLOYMENT, HUB, NOW, SIBLING, Spec, World, craft, key, pem, world

REPO = Path(__file__).resolve().parents[1]
TESTDATA = REPO / "forge-core/src/go/trust/testdata"
ANCHORS = TESTDATA / "anchors.json"
#: The files a borrowed case takes its certificate from, in the order they are read.
BORROWED_FROM = ("edges", "vectors")

BUILT, REFUSED = "built", "refused"
#: What a refusal by the key rules says: written here, never read from the code under test.
LABEL_KEY = "is not one PEM block labelled PUBLIC KEY"
LABEL_CERTIFICATE = "is not one PEM block labelled CERTIFICATE"
BASE64 = "is not base64 in its one spelling"
KEY = "is not an ECDSA key on secp256r1 or secp384r1 in its one encoding"
CERTIFICATE = "is not a certificate with an ECDSA key on secp256r1 or secp384r1 in its one encoding"
TWICE = "one key is listed twice"
#: Refused for its shape or by another rule of the form: no words are compared.
OTHER = None

DER, SPKI = serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
#: P-256's AlgorithmIdentifier with the curve written out in full (explicit parameters,
#: as ``openssl ec -param_enc explicit`` writes it) in place of its name.
EXPLICIT_P256 = bytes.fromhex(
    "3082010306072a8648ce3d02013081f7020101302c06072a8648ce3d0101022100ffffffff000000010000"
    "00000000000000000000ffffffffffffffffffffffff305b0420ffffffff00000001000000000000000000"
    "000000fffffffffffffffffffffffc04205ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce"
    "3c3e27d2604b031500c49d360886e704936a6678e1139d26b7819f7e900441046b17d1f2e12c4247f8bce6"
    "e563a440f277037d812deb33a0f4a13945d898c2964fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b31"
    "5ececbb6406837bf51f5022100ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc63"
    "2551020101"
)
OID_EC_PUBLIC_KEY = bytes.fromhex("06072a8648ce3d0201")
OID_ECDH = bytes.fromhex("06052b8104010c")
OID_P256 = bytes.fromhex("06082a8648ce3d030107")


def tlv(tag: int, content: bytes) -> bytes:
    n = len(content)
    if n < 0x80:
        return bytes([tag, n]) + content
    size = (n.bit_length() + 7) // 8
    return bytes([tag, 0x80 | size]) + n.to_bytes(size, "big") + content


def spki_of(algorithm: bytes, point: bytes) -> bytes:
    return tlv(0x30, algorithm + tlv(0x03, b"\x00" + point))


def block(der: bytes, label: str = "PUBLIC KEY", *, width: int = 64, end: str | None = None) -> str:
    body = "\n".join(textwrap.wrap(base64.b64encode(der).decode(), width))
    return f"-----BEGIN {label}-----\n{body}\n-----END {end or label}-----\n"


def spki(private: Any) -> bytes:
    return private.public_key().public_bytes(DER, SPKI)


def key_spellings() -> list[tuple[str, str, str, str | None]]:
    """Every spelling of a key: its name, the text, the answer, and what a refusal says."""
    p256, p384 = key("secp256r1", 7001), key("secp384r1", 7002)
    d256 = spki(p256)
    named = tlv(0x30, OID_EC_PUBLIC_KEY + OID_P256)
    point = p256.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    assert spki_of(named, point) == d256, "the hand-built encoding is the device's"
    x, y = point[1:33], point[33:]
    odd = y[-1] & 1
    text = base64.b64encode(d256).decode()
    assert text.endswith("=="), "a P-256 key's base64 ends in padding"
    loose = text[:-3] + chr(ord(text[-3]) + 1) + "=="
    assert base64.b64decode(loose) == d256, "the same bytes, with unused bits set"
    whole = block(d256)
    head, *body, foot, _ = whole.split("\n")
    rsa_key = rsa.RSAPublicNumbers(65537, (1 << 2047) | 0x10001).public_key()

    def text_of(content: str, label: str = "PUBLIC KEY") -> str:
        return f"-----BEGIN {label}-----\n{content}\n-----END {label}-----\n"

    return [
        ("P-256 as a device exports it", whole, BUILT, None),
        ("P-384 as a device exports it", block(spki(p384)), BUILT, None),
        ("P-256 in 32 columns", block(d256, width=32), BUILT, None),
        ("P-256 on one line", block(d256, width=400), BUILT, None),
        ("P-256 without its last line break", whole.removesuffix("\n"), BUILT, None),
        (
            "P-256 with an empty line in it",
            "\n".join([head, body[0], "", *body[1:], foot, ""]),
            BUILT,
            None,
        ),
        ("P-521", block(spki(ec.derive_private_key(7003, ec.SECP521R1()))), REFUSED, KEY),
        ("secp256k1", block(spki(ec.derive_private_key(7004, ec.SECP256K1()))), REFUSED, KEY),
        (
            "brainpoolP256r1",
            block(spki(ec.derive_private_key(7005, ec.BrainpoolP256R1()))),
            REFUSED,
            KEY,
        ),
        ("P-256 as a compressed point", block(spki_of(named, bytes([2 + odd]) + x)), REFUSED, KEY),
        ("P-256 as a hybrid point", block(spki_of(named, bytes([6 + odd]) + x + y)), REFUSED, KEY),
        ("P-256 with its curve written out", block(spki_of(EXPLICIT_P256, point)), REFUSED, KEY),
        (
            "P-256 with a point off the curve",
            block(spki_of(named, b"\x04" + x + bytes([y[0] ^ 1]) + y[1:])),
            REFUSED,
            KEY,
        ),
        ("P-256 with the point at infinity", block(spki_of(named, b"\x00")), REFUSED, KEY),
        (
            "P-256 for key agreement only",
            block(spki_of(tlv(0x30, OID_ECDH + OID_P256), point)),
            REFUSED,
            KEY,
        ),
        ("P-256 with a long-form length", block(b"\x30\x81" + d256[1:]), REFUSED, KEY),
        ("P-256 with a byte after it", block(d256 + b"\x00"), REFUSED, KEY),
        ("P-256 with unused bits set in its base64", text_of(loose), REFUSED, BASE64),
        ("P-256 without its base64 padding", text_of(text[:-2]), REFUSED, BASE64),
        ("P-256 with padding in the middle", text_of(text + "\n" + text), REFUSED, BASE64),
        ("P-256 labelled EC PUBLIC KEY", block(d256, "EC PUBLIC KEY"), REFUSED, LABEL_KEY),
        ("P-256 with another label at its end", block(d256, end="CERTIFICATE"), REFUSED, LABEL_KEY),
        (
            "P-256 with no line break before its end",
            whole.replace("\n-----END", "-----END"),
            REFUSED,
            LABEL_KEY,
        ),
        ("P-256 with Windows line ends", whole.replace("\n", "\r\n"), REFUSED, OTHER),
        (
            "Ed25519",
            block(spki(ed25519.Ed25519PrivateKey.from_private_bytes(bytes([7]) * 32))),
            REFUSED,
            KEY,
        ),
        (
            "Ed448",
            block(spki(ed448.Ed448PrivateKey.from_private_bytes(bytes([7]) * 57))),
            REFUSED,
            KEY,
        ),
        (
            "X25519",
            block(spki(x25519.X25519PrivateKey.from_private_bytes(bytes([7]) * 32))),
            REFUSED,
            KEY,
        ),
        ("RSA 2048", block(rsa_key.public_bytes(DER, SPKI)), REFUSED, KEY),
        (
            "RSA labelled RSA PUBLIC KEY",
            block(rsa_key.public_bytes(DER, serialization.PublicFormat.PKCS1), "RSA PUBLIC KEY"),
            REFUSED,
            LABEL_KEY,
        ),
        ("three bytes", block(b"ABC"), REFUSED, KEY),
        ("nothing", text_of(""), REFUSED, KEY),
    ]


def plain_certificate(public: Any, signer: ec.EllipticCurvePrivateKey) -> x509.Certificate:
    """A certificate carrying any kind of key; only its key matters to these cases."""
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "forge anchor case")])
    return (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(public)
        .serial_number(7)
        .not_valid_before(NOW - timedelta(days=1))
        .not_valid_after(NOW + timedelta(days=1))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(signer, hashes.SHA256())
    )


def certificates(w: World) -> list[tuple[str, str, str, str | None]]:
    """Every kind of certificate: its name, the text, the answer, and what a refusal says."""
    signer = key("secp256r1", 7010)
    # a signature's length varies, and loose base64 needs a certificate whose base64 ends in
    # padding: two lengths in three do
    for _ in range(64):
        good = craft(w.intermediate_spec(key=key("secp256r1", 7011)), w.profile)
        der = good.public_bytes(DER)
        if len(der) % 3:
            break
    point = good.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    assert der.count(point) == 1, "the certificate carries its key's point once"
    hybrid = der.replace(point, bytes([6 + (point[-1] & 1)]) + point[1:])
    text = base64.b64encode(der).decode()
    pad = len(text) - len(text.rstrip("="))
    assert pad, "no certificate in 64 had a length that leaves padding"
    loose = text[: -pad - 1] + chr(ord(text[-pad - 1]) + 1) + "=" * pad
    assert base64.b64decode(loose) == der, "the same bytes, with unused bits set"

    def of(public: Any) -> str:
        return pem(plain_certificate(public, signer))

    return [
        ("a P-256 certificate", pem(good), BUILT, None),
        ("a P-384 certificate", of(key("secp384r1", 7012).public_key()), BUILT, None),
        ("a certificate in 32 columns", block(der, "CERTIFICATE", width=32), BUILT, None),
        (
            "a certificate labelled TRUSTED CERTIFICATE",
            block(der, "TRUSTED CERTIFICATE"),
            REFUSED,
            LABEL_CERTIFICATE,
        ),
        # a label is capital letters and spaces: the digits are refused by the block's shape
        ("a certificate labelled X509 CERTIFICATE", block(der, "X509 CERTIFICATE"), REFUSED, OTHER),
        ("a certificate labelled PUBLIC KEY", block(der, "PUBLIC KEY"), REFUSED, LABEL_CERTIFICATE),
        (
            "a certificate with unused bits set in its base64",
            f"-----BEGIN CERTIFICATE-----\n{loose}\n-----END CERTIFICATE-----\n",
            REFUSED,
            BASE64,
        ),
        (
            "a public key labelled CERTIFICATE",
            block(spki(key("secp256r1", 7013)), "CERTIFICATE"),
            REFUSED,
            CERTIFICATE,
        ),
        ("three bytes labelled CERTIFICATE", block(b"ABC", "CERTIFICATE"), REFUSED, CERTIFICATE),
        (
            "a certificate with a byte after it",
            block(der + b"\x00", "CERTIFICATE"),
            REFUSED,
            CERTIFICATE,
        ),
        (
            "a certificate whose key is a hybrid point",
            block(hybrid, "CERTIFICATE"),
            REFUSED,
            CERTIFICATE,
        ),
        (
            "a P-521 certificate",
            of(ec.derive_private_key(7014, ec.SECP521R1()).public_key()),
            REFUSED,
            CERTIFICATE,
        ),
        (
            "a secp256k1 certificate",
            of(ec.derive_private_key(7015, ec.SECP256K1()).public_key()),
            REFUSED,
            CERTIFICATE,
        ),
        (
            "an Ed25519 certificate",
            of(ed25519.Ed25519PrivateKey.from_private_bytes(bytes([8]) * 32).public_key()),
            REFUSED,
            CERTIFICATE,
        ),
        (
            "an Ed448 certificate",
            of(ed448.Ed448PrivateKey.from_private_bytes(bytes([8]) * 57).public_key()),
            REFUSED,
            CERTIFICATE,
        ),
        (
            "an RSA certificate",
            of(rsa.RSAPublicNumbers(65537, (1 << 2047) | 0x10001).public_key()),
            REFUSED,
            CERTIFICATE,
        ),
    ]


# ---------------------------------------------------------------------------
# The places a key can be named
# ---------------------------------------------------------------------------

PLACES = (
    "certificate root root-b",
    "certificate root root-d",
    "the first hub intermediate",
    "the second hub intermediate",
    "the distribution key",
    "the first freshness key",
    "the second freshness key",
)


#: What a refusal calls each place, so a script that built the anchor knows where to look.
SAID = dict(
    zip(
        PLACES,
        (
            "certificate root root-b",
            "certificate root root-d",
            f"hub intermediate 1 ({HUB})",
            "hub intermediate 2 ({hub})",
            "the distribution key",
            "freshness key 1",
            "freshness key 2",
        ),
        strict=True,
    )
)


def own_keys(w: World) -> dict[str, ec.EllipticCurvePrivateKey]:
    """The key each place holds in the world; the second intermediate's is its own too."""
    return dict(
        zip(
            PLACES,
            (
                w.root_key,
                w.root2_key,
                w.intermediate_key,
                key("secp256r1", 2002),
                key("secp256r1", 5001),
                key("secp256r1", 5002),
                key("secp256r1", 5003),
            ),
            strict=True,
        )
    )


def public_text(private: ec.EllipticCurvePrivateKey) -> str:
    return private.public_key().public_bytes(serialization.Encoding.PEM, SPKI).decode()


def naming(
    w: World, held: dict[str, ec.EllipticCurvePrivateKey], second_hub: str = SIBLING
) -> dict[str, Any]:
    """The fields of an anchor whose places hold these keys: two certificate roots, two hub
    intermediates, the distribution key and two freshness keys."""
    own = own_keys(w)

    def root(place: str, kept: x509.Certificate) -> str:
        private = held[place]
        if private is own[place]:
            return pem(kept)
        spec = Spec(
            "certificate-root",
            SpiffeId(DEPLOYMENT),
            private,
            None,
            private,
            NOW - timedelta(days=365),
            NOW + timedelta(days=3000),
        )
        return pem(craft(spec, w.profile))

    def intermediate(place: str, hub: str) -> str:
        private = held[place]
        if private is own[place] and hub == HUB and place == PLACES[2]:
            return pem(w.intermediate)
        return pem(
            craft(
                w.intermediate_spec(key=private, subject=SpiffeId(DEPLOYMENT, hub=hub)), w.profile
            )
        )

    roots = w.anchor["certificate_roots"]
    return {
        "certificate_roots": [
            {**roots[0], "certificate": root(PLACES[0], w.root)},
            {**roots[1], "certificate": root(PLACES[1], w.root2)},
        ],
        "hub_intermediates": [
            {"hub": HUB, "certificate": intermediate(PLACES[2], HUB)},
            {"hub": second_hub, "certificate": intermediate(PLACES[3], second_hub)},
        ],
        "distribution_key": public_text(held[PLACES[4]]),
        "freshness_keys": [public_text(held[PLACES[5]]), public_text(held[PLACES[6]])],
    }


def borrowed(w: World) -> list[dict[str, Any]]:
    """Every certificate of the edges and the vectors, once, as the hub intermediate: built,
    unless it carries a key the anchor names elsewhere or a key that is not admitted."""
    own = own_keys(w)
    elsewhere = {
        own[place].public_key().public_numbers() for place in PLACES if "intermediate" not in place
    }
    seen: set[str] = set()
    cases = []
    for source in BORROWED_FROM:
        for case in json.loads((TESTDATA / f"{source}.json").read_text(encoding="utf-8"))["cases"]:
            for index, text in enumerate(case["chain"]):
                if text in seen:
                    continue
                seen.add(text)
                public = x509.load_pem_x509_certificate(text.encode()).public_key()
                if not isinstance(public, ec.EllipticCurvePublicKey) or public.curve.name not in (
                    "secp256r1",
                    "secp384r1",
                ):
                    expect, says = REFUSED, CERTIFICATE
                elif public.public_numbers() in elsewhere:
                    expect, says = REFUSED, TWICE
                else:
                    expect, says = BUILT, None
                cases.append(
                    {
                        "name": f"{source}: {case['name']}, certificate {index}",
                        "from": source,
                        "case": case["name"],
                        "certificate": index,
                        "expect": expect,
                        "says": says,
                    }
                )
    return cases


def anchors() -> dict[str, Any]:
    w = world()
    base = w.anchor
    fresh = base["freshness_keys"]
    cases: list[dict[str, Any]] = []

    def case(name: str, change: dict[str, Any], expect: str, says: str | None = None) -> None:
        assert expect == REFUSED or says is None, name
        cases.append({"name": name, "change": change, "expect": expect, "says": says})

    def at(place: str, says: str | None) -> str | None:
        """A refusal names the place before it says what is wrong there."""
        return says and f"{SAID[place]} {says}"

    def twice(first: str, second: str, hub: str = SIBLING) -> str:
        return f"{TWICE}: {SAID[first].format(hub=hub)} and {SAID[second].format(hub=hub)}"

    case("the world's anchor", {}, BUILT)

    for name, text, expect, says in key_spellings():
        case(
            f"{name}, as the distribution key",
            {"distribution_key": text},
            expect,
            at(PLACES[4], says),
        )
        case(
            f"{name}, as the first freshness key",
            {"freshness_keys": [text, fresh[1]]},
            expect,
            at(PLACES[5], says),
        )
        case(
            f"{name}, as the second freshness key",
            {"freshness_keys": [fresh[0], text]},
            expect,
            at(PLACES[6], says),
        )

    roots = base["certificate_roots"]
    for name, text, expect, says in certificates(w):
        case(
            f"{name}, as a certificate root",
            {"certificate_roots": [{**roots[0], "certificate": text}, roots[1]]},
            expect,
            at(PLACES[0], says),
        )
        case(
            f"{name}, as a hub intermediate",
            {"hub_intermediates": [{"hub": HUB, "certificate": text}]},
            expect,
            at(PLACES[2], says),
        )

    own = own_keys(w)
    case("every place with its own key, two hubs", naming(w, own), BUILT)
    case(
        "every place with its own key, one hub with two intermediates",
        naming(w, own, second_hub=HUB),
        BUILT,
    )
    for first, second in combinations(PLACES, 2):
        held = {**own, second: own[first]}
        case(f"one key as {first} and as {second}", naming(w, held), REFUSED, twice(first, second))
    case(
        "one key as both intermediates of one hub",
        naming(w, {**own, PLACES[3]: own[PLACES[2]]}, second_hub=HUB),
        REFUSED,
        twice(PLACES[2], PLACES[3], hub=HUB),
    )
    case(
        "one hub intermediate listed twice",
        {"hub_intermediates": base["hub_intermediates"] * 2},
        REFUSED,
        twice(PLACES[2], PLACES[3], hub=HUB),
    )
    case(
        "one certificate root under two ids",
        {"certificate_roots": [roots[0], {**roots[0], "id": "root-copy"}]},
        REFUSED,
        f"{TWICE}: certificate root root-b and certificate root root-copy",
    )
    rewrapped = block(spki(key("secp256r1", 5002)), width=32)
    assert rewrapped != fresh[0], "another spelling of the first freshness key"
    case(
        "one freshness key twice, the second in other lines",
        {"freshness_keys": [fresh[0], rewrapped]},
        REFUSED,
        twice(PLACES[5], PLACES[6]),
    )
    case(
        "the distribution key in other lines as a freshness key",
        {"freshness_keys": [fresh[0], block(spki(key("secp256r1", 5001)), width=32)]},
        REFUSED,
        twice(PLACES[4], PLACES[6]),
    )
    renewed = craft(w.intermediate_spec(not_after=NOW + timedelta(days=45)), w.profile)
    case(
        "a hub intermediate renewed on its key, in place of the first",
        {"hub_intermediates": [{"hub": HUB, "certificate": pem(renewed)}]},
        BUILT,
    )

    production = {"stage": "production", "test_attestation_roots": []}
    case("one freshness key under the test stage", {"freshness_keys": fresh[:1]}, BUILT)
    case(
        "one freshness key under the development stage",
        {"stage": "development", "freshness_keys": fresh[:1]},
        BUILT,
    )
    case("two freshness keys in production", production, BUILT)
    case(
        "one freshness key in production",
        {**production, "freshness_keys": fresh[:1]},
        REFUSED,
        OTHER,
    )
    case(
        "three freshness keys",
        {"freshness_keys": [*fresh, public_text(key("secp256r1", 5004))]},
        REFUSED,
        OTHER,
    )
    case("no freshness key", {"freshness_keys": []}, REFUSED, OTHER)
    case("a freshness key outside a list", {"freshness_keys": fresh[0]}, REFUSED, OTHER)

    names = [c["name"] for c in cases]
    assert len(set(names)) == len(names), "every case has its own name"
    return {
        "about": "Anchors both verifiers are held to (FB-317). Each case changes whole fields of "
        "the base anchor and says whether the result can be built, and what a refusal by "
        "the key rules must say. Written by tests/trust_anchors.py; do not edit by hand.",
        "base": base,
        "cases": cases,
        "borrowed_as": {"hub": HUB},
        "borrowed": borrowed(w),
    }


def main() -> int:
    data = anchors()
    ANCHORS.write_text(json.dumps(data, indent=1) + "\n", encoding="utf-8")
    every = [*data["cases"], *data["borrowed"]]
    built = sum(c["expect"] == BUILT for c in every)
    print(
        f"{len(data['cases'])} anchors and {len(data['borrowed'])} borrowed certificates "
        f"({built} built, {len(every) - built} refused) written to {ANCHORS.relative_to(REPO)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
