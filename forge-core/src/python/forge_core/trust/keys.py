"""The keys the trust root admits, and the one way each is written (FB-317).

Every key the trust root names is an ECDSA key on one of ``CURVES``: the certificate profile
names a curve per role, a device key is generated on one, and the anchor's own keys (the
distribution key, the freshness keys, and the keys of the certificates it lists) are held to
the same set here. One set, so a curve is added in one place per language.

A key is admitted in one encoding only: one PEM block with its label, base64 in its one
spelling, and the SubjectPublicKeyInfo a device exports (the named curve, the uncompressed
point). The check is made by reading the key, writing it again and requiring the same bytes,
so two spellings of one key cannot both count, and Python and Go, whose parsers disagree on
what else is a key (a compressed point, a curve written out in full, another curve), give one
answer. Line breaks are free. Adding a key type is a new form of the anchor: an older
verifier must refuse what it cannot read, never half-read it.
"""

from __future__ import annotations

import base64
import binascii

from cryptography import x509
from cryptography.exceptions import UnsupportedAlgorithm
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

#: The curves a key of the trust root may be on.
CURVES = {"secp256r1": ec.SECP256R1, "secp384r1": ec.SECP384R1}

_ADMITTED = "an ECDSA key on " + " or ".join(CURVES)
#: What each refusal says, the same words in Go (``forge-core/src/go/trust/keys.go``).
NOT_LABELLED = "is not one PEM block labelled {label}"
NOT_BASE64 = "is not base64 in its one spelling"
NOT_A_KEY = f"is not {_ADMITTED} in its one encoding"
NOT_A_CERTIFICATE = f"is not a certificate with {_ADMITTED} in its one encoding"


class KeyRefusedError(ValueError):
    """What is not an admitted key, with what is wrong with it."""


def der_of(text: str, label: str) -> bytes:
    """The bytes of one PEM block labelled ``label``, written in base64's one spelling."""
    lines = text.removesuffix("\n").split("\n")
    if (
        len(lines) < 3
        or lines[0] != f"-----BEGIN {label}-----"
        or lines[-1] != f"-----END {label}-----"
    ):
        raise KeyRefusedError(NOT_LABELLED.format(label=label))
    content = "".join(lines[1:-1])
    try:
        der = base64.b64decode(content, validate=True)
    except binascii.Error as exc:
        raise KeyRefusedError(NOT_BASE64) from exc
    if base64.b64encode(der).decode() != content:
        raise KeyRefusedError(NOT_BASE64)
    return der


def _canonical(key: object) -> bytes | None:
    """An admitted key's one encoding; ``None`` for any other key."""
    if not isinstance(key, ec.EllipticCurvePublicKey) or key.curve.name not in CURVES:
        return None
    return key.public_bytes(
        serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
    )


def public_key_der(text: str) -> bytes:
    """The one encoding of the admitted public key ``text`` holds, or
    :class:`KeyRefusedError`."""
    der = der_of(text, "PUBLIC KEY")
    try:
        canonical = _canonical(serialization.load_der_public_key(der))
    except (ValueError, TypeError, UnsupportedAlgorithm) as exc:
        raise KeyRefusedError(NOT_A_KEY) from exc
    if canonical != der:
        raise KeyRefusedError(NOT_A_KEY)
    return canonical


def _element(der: bytes, at: int) -> tuple[int, int, int]:
    """One DER element starting at ``at``: its tag, where its content starts and where it
    ends."""
    tag, length, start = der[at], der[at + 1], at + 2
    if length & 0x80:
        size = length & 0x7F
        length, start = int.from_bytes(der[start : start + size], "big"), start + size
    return tag, start, start + length


def _carried_key(tbs: bytes) -> bytes:
    """The SubjectPublicKeyInfo as the certificate carries it, byte for byte: the seventh
    field of the part that is signed (after the version when there is one, the serial, the
    signature algorithm, the issuer, the validity and the subject). The loader has already
    read the structure; this only finds the field in it."""
    _, at, _ = _element(tbs, 0)
    tag, _, end = _element(tbs, at)
    if tag == 0xA0:  # the version, when it is written
        at = end
    for _ in range(5):
        _, _, at = _element(tbs, at)
    _, _, end = _element(tbs, at)
    return tbs[at:end]


def certificate_key_der(text: str) -> bytes:
    """The one encoding of the admitted key the certificate ``text`` carries, or
    :class:`KeyRefusedError`. The certificate must carry it in that encoding. Only the
    certificate's structure and its key are read here; whether it fits its role is the
    profile's check (``verify.check_certificate``)."""
    der = der_of(text, "CERTIFICATE")
    try:
        certificate = x509.load_der_x509_certificate(der)
        canonical = _canonical(certificate.public_key())
        carried = _carried_key(certificate.tbs_certificate_bytes)
    except (ValueError, TypeError, IndexError, UnsupportedAlgorithm) as exc:
        raise KeyRefusedError(NOT_A_CERTIFICATE) from exc
    if canonical is None or canonical != carried:
        raise KeyRefusedError(NOT_A_CERTIFICATE)
    return canonical
