"""The verifier: is this certificate real? (D-23 law 1)

No certificate counts unless its issuer's key is in the current anchor (or certified by a
key that is), its subject sits under its issuer's identity, and it fits the profile. The
answer is either the leaf's identity and role, or a refusal with one cause from a closed set
and the position in the chain where it was found (0 is the leaf).

The checks run in one fixed order, so the Go verifier (``forge-core/src/go/trust``) gives the
same cause for the same chain; the shared vectors hold the two to it:

1. the chain's shape: 1 to 4 certificates presented, the anchor's root may be included;
2. the root: a certificate root of the anchor issued the last certificate presented;
3. the roles: each certificate's role follows from its issuer's role and its id's form;
4. the intermediates: each CA below the root is a hub intermediate the anchor lists;
5. the profile, root first, every field in :class:`Field` order;
6. the signatures, root first;
7. the identities: each in the anchor's deployment and under its issuer's;
8. time, root first: not yet valid, expired, validity inside the issuer's, lifetime cap.

Time is the hub's clock, passed in and timezone-aware (one clock); nothing here reads the
system clock.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum
from typing import TYPE_CHECKING

from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtendedKeyUsageOID, ExtensionOID, NameOID, SignatureAlgorithmOID

from forge_core.trust.ids import IdError, SpiffeId

if TYPE_CHECKING:
    from collections.abc import Sequence

    from forge_core.trust.anchor import Anchor
    from forge_core.trust.profile import Profile, Role

#: The longest chain presented: leaf, intermediate and the root itself, with one to spare.
MAX_PRESENTED = 4


class Cause(StrEnum):
    CHAIN = "chain"
    NOT_IN_ANCHOR = "not-in-anchor"
    PROFILE = "profile"
    SIGNATURE = "signature"
    IDENTITY = "identity"
    NOT_YET_VALID = "not-yet-valid"
    EXPIRED = "expired"
    NESTING = "validity-nesting"
    LIFETIME = "lifetime"


class Field(StrEnum):
    """The profile's fields, in the order they are checked."""

    VERSION = "version"
    SERIAL = "serial"
    SIGNATURE_ALGORITHM = "signature-algorithm"
    CURVE = "curve"
    EXTENSIONS = "extensions"
    BASIC_CONSTRAINTS = "basic-constraints"
    KEY_USAGE = "key-usage"
    EXTENDED_KEY_USAGE = "extended-key-usage"
    SUBJECT_ALT_NAME = "subject-alt-name"
    SUBJECT = "subject"
    KEY_IDENTIFIERS = "key-identifiers"


class CertificateRefusedError(Exception):
    """A certificate that does not count, with the cause, the position and a detail."""

    def __init__(
        self, cause: Cause, position: int, detail: str, field: Field | None = None
    ) -> None:
        self.cause, self.position, self.detail, self.field = cause, position, detail, field
        super().__init__(f"{self.code} at {position}: {detail}")

    @property
    def code(self) -> str:
        """The cause as both verifiers write it: ``profile/<field>`` or the cause alone."""
        return f"{self.cause}/{self.field}" if self.field else str(self.cause)


@dataclass(frozen=True)
class Verified:
    identity: SpiffeId
    role: str
    roles: tuple[str, ...]


_SIGNATURE_OIDS = {
    "sha256": SignatureAlgorithmOID.ECDSA_WITH_SHA256,
    "sha384": SignatureAlgorithmOID.ECDSA_WITH_SHA384,
}
_EKU = {
    "server_auth": ExtendedKeyUsageOID.SERVER_AUTH,
    "client_auth": ExtendedKeyUsageOID.CLIENT_AUTH,
}
_KU_BITS = (
    "digital_signature",
    "content_commitment",
    "key_encipherment",
    "data_encipherment",
    "key_agreement",
    "key_cert_sign",
    "crl_sign",
)
_BASE_EXTENSIONS = frozenset(
    {
        ExtensionOID.BASIC_CONSTRAINTS,
        ExtensionOID.KEY_USAGE,
        ExtensionOID.SUBJECT_ALTERNATIVE_NAME,
        ExtensionOID.SUBJECT_KEY_IDENTIFIER,
        ExtensionOID.AUTHORITY_KEY_IDENTIFIER,
    }
)


def spki(certificate: x509.Certificate) -> bytes:
    return certificate.public_key().public_bytes(
        serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
    )


#: What reading a certificate's extensions can raise: none of it may escape as a crash.
UNREADABLE = (ValueError, x509.DuplicateExtension, x509.UnsupportedGeneralNameType)


def readable_extensions(certificate: x509.Certificate) -> bool:
    try:
        list(certificate.extensions)
    except UNREADABLE:
        return False
    return True


def spiffe_id(certificate: x509.Certificate) -> SpiffeId | None:
    """The certificate's one URI name as an id, or ``None`` when it has no single one."""
    try:
        san = certificate.extensions.get_extension_for_oid(ExtensionOID.SUBJECT_ALTERNATIVE_NAME)
    except (x509.ExtensionNotFound, *UNREADABLE):
        return None
    names = list(san.value)
    if len(names) != 1 or not isinstance(names[0], x509.UniformResourceIdentifier):
        return None
    try:
        return SpiffeId.parse(names[0].value)
    except IdError:
        return None


def subject_for(role: Role, identity: SpiffeId) -> x509.Name:
    """The subject a certificate of this role and id carries: deployment, role, last name."""
    return x509.Name(
        [
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, identity.deployment),
            x509.NameAttribute(NameOID.ORGANIZATIONAL_UNIT_NAME, role.id),
            x509.NameAttribute(NameOID.COMMON_NAME, identity.last),
        ]
    )


def _key_usage(value: x509.KeyUsage) -> set[str]:
    bits = {bit for bit in _KU_BITS if getattr(value, bit)}
    if value.key_agreement:
        bits |= {bit for bit in ("encipher_only", "decipher_only") if getattr(value, bit)}
    return bits


def check_certificate(
    certificate: x509.Certificate,
    role: Role,
    issuer_role: Role,
    issuer: x509.Certificate,
    position: int,
) -> None:
    """Refuse a certificate that does not fit its role exactly, naming the first field."""

    def refuse(field: Field, detail: str) -> CertificateRefusedError:
        return CertificateRefusedError(Cause.PROFILE, position, f"{role.id}: {detail}", field)

    if certificate.version is not x509.Version.v3:
        raise refuse(Field.VERSION, "not an X.509 v3 certificate")
    serial = certificate.serial_number
    if serial <= 0 or serial.bit_length() > 159:
        raise refuse(Field.SERIAL, "the serial is not a positive number of at most 20 bytes")
    if certificate.signature_algorithm_oid != _SIGNATURE_OIDS.get(issuer_role.signs_with or ""):
        raise refuse(Field.SIGNATURE_ALGORITHM, f"not signed with ECDSA-{issuer_role.signs_with}")
    key = certificate.public_key()
    if not isinstance(key, ec.EllipticCurvePublicKey) or key.curve.name != role.curve:
        raise refuse(Field.CURVE, f"its key is not on {role.curve}")
    try:
        extensions = list(certificate.extensions)
    except UNREADABLE as exc:
        raise refuse(Field.EXTENSIONS, f"its extensions cannot be read: {exc}") from exc
    expected = _BASE_EXTENSIONS | (
        {ExtensionOID.EXTENDED_KEY_USAGE} if role.extended_key_usage else set()
    )
    present = [e.oid for e in extensions]
    if sorted(present, key=str) != sorted(expected, key=str):
        raise refuse(Field.EXTENSIONS, "its extensions are not exactly the role's")
    by_oid = {e.oid: e for e in extensions}

    bc = by_oid[ExtensionOID.BASIC_CONSTRAINTS]
    if not bc.critical or bc.value.ca is not role.ca or bc.value.path_length != role.path_length:
        raise refuse(Field.BASIC_CONSTRAINTS, "basic constraints are not the role's, critical")
    ku = by_oid[ExtensionOID.KEY_USAGE]
    if not ku.critical or _key_usage(ku.value) != set(role.key_usage):
        raise refuse(Field.KEY_USAGE, "key usage is not exactly the role's, critical")
    if role.extended_key_usage:
        eku = by_oid[ExtensionOID.EXTENDED_KEY_USAGE]
        wanted = {_EKU[name] for name in role.extended_key_usage}
        if eku.critical or set(eku.value) != wanted or len(list(eku.value)) != len(wanted):
            raise refuse(Field.EXTENDED_KEY_USAGE, "extended key usage is not exactly the role's")
    san = by_oid[ExtensionOID.SUBJECT_ALTERNATIVE_NAME]
    identity = spiffe_id(certificate)
    if not san.critical or identity is None or identity.kind is not role.identity:
        raise refuse(Field.SUBJECT_ALT_NAME, f"not one critical URI name of a {role.identity} id")
    if certificate.subject != subject_for(role, identity):
        raise refuse(Field.SUBJECT, "the subject is not the role's form")
    ski_ext = by_oid[ExtensionOID.SUBJECT_KEY_IDENTIFIER]
    aki_ext = by_oid[ExtensionOID.AUTHORITY_KEY_IDENTIFIER]
    ski, aki = ski_ext.value, aki_ext.value
    issuer_ski = x509.SubjectKeyIdentifier.from_public_key(issuer.public_key()).digest
    if (
        ski_ext.critical  # RFC 5280 4.2.1.1-2: never critical (found by the Go verifier's probe)
        or aki_ext.critical
        or ski.digest != x509.SubjectKeyIdentifier.from_public_key(key).digest
        or aki.key_identifier != issuer_ski
        or aki.authority_cert_issuer is not None
        or aki.authority_cert_serial_number is not None
    ):
        raise refuse(Field.KEY_IDENTIFIERS, "the key identifiers are not the keys' own")


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        msg = "the hub's time must be timezone-aware (one clock)"
        raise ValueError(msg)
    return value


def verify(
    leaf: x509.Certificate,
    intermediates: Sequence[x509.Certificate],
    *,
    anchor: Anchor,
    profile: Profile,
    now: datetime,
) -> Verified:
    """The leaf's identity and role; otherwise :class:`CertificateRefusedError`, naming
    the first cause found."""
    now = _utc(now)
    roots = anchor.root_certificates()
    presented = [leaf, *intermediates]
    if presented and len(presented) > 1 and any(presented[-1] == r for r in roots):
        presented = presented[:-1]  # the root itself may be sent along; it is the anchor's
    if not 1 <= len(presented) <= MAX_PRESENTED - 1:
        raise CertificateRefusedError(Cause.CHAIN, 0, f"{len(presented)} certificates presented")

    # 2. the root
    last = presented[-1]
    root = None
    for candidate in roots:
        if candidate.subject != last.issuer:
            continue
        try:
            last.verify_directly_issued_by(candidate)
        except (ValueError, TypeError, InvalidSignature):
            continue
        root = candidate
        break
    if root is None:
        raise CertificateRefusedError(
            Cause.NOT_IN_ANCHOR, len(presented), "no certificate root of the anchor issued it"
        )
    chain = [*presented, root]
    top = len(chain) - 1

    # 3. the roles
    roles: list[Role] = [profile.root] * len(chain)
    for i in range(top - 1, -1, -1):
        if not readable_extensions(chain[i]):
            # A refusal, never a raw exception from the parser (found by the Go verifier's probe).
            raise CertificateRefusedError(
                Cause.PROFILE, i, "its extensions cannot be read", Field.EXTENSIONS
            )
        identity = spiffe_id(chain[i])
        if identity is None:
            raise CertificateRefusedError(
                Cause.PROFILE, i, "not one URI name of a SPIFFE id", Field.SUBJECT_ALT_NAME
            )
        role = profile.issued_by(roles[i + 1], identity.kind)
        if role is None:
            raise CertificateRefusedError(
                Cause.CHAIN, i, f"{roles[i + 1].id} issues no role for a {identity.kind} id"
            )
        roles[i] = role

    # 4. the intermediates
    listed = anchor.intermediate_keys()
    for i in range(1, top):
        identity = spiffe_id(chain[i])
        hub = listed.get(spki(chain[i]))
        if identity is None or hub is None or hub != identity.hub:
            raise CertificateRefusedError(
                Cause.NOT_IN_ANCHOR, i, "the anchor does not list this intermediate's key"
            )

    # 5. the profile
    for i in range(top, -1, -1):
        issuer_index = min(i + 1, top)
        check_certificate(chain[i], roles[i], roles[issuer_index], chain[issuer_index], i)

    # 6. the signatures
    for i in range(top - 1, -1, -1):
        try:
            chain[i].verify_directly_issued_by(chain[i + 1])
        except (ValueError, TypeError, InvalidSignature) as exc:
            raise CertificateRefusedError(
                Cause.SIGNATURE, i, f"not signed by its issuer: {exc}"
            ) from exc

    # 7. the identities
    ids = [spiffe_id(c) for c in chain]
    for i in range(top, -1, -1):
        identity = ids[i]
        assert identity is not None  # the profile check above holds every id to its form
        if identity.deployment != anchor.deployment:
            raise CertificateRefusedError(
                Cause.IDENTITY, i, f"{identity} is not in {anchor.deployment}"
            )
        issuer_id = ids[min(i + 1, top)]
        assert issuer_id is not None
        if not identity.is_under(issuer_id):
            raise CertificateRefusedError(
                Cause.IDENTITY, i, f"{identity} is not under its issuer {issuer_id}"
            )

    # 8. time
    caps = anchor.policy.lifetimes
    for i in range(top, -1, -1):
        cert = chain[i]
        start, end = cert.not_valid_before_utc, cert.not_valid_after_utc
        if now < start:
            raise CertificateRefusedError(Cause.NOT_YET_VALID, i, f"valid from {start.isoformat()}")
        if now > end:
            raise CertificateRefusedError(Cause.EXPIRED, i, f"expired {end.isoformat()}")
        if i < top:
            issuer = chain[i + 1]
            if start < issuer.not_valid_before_utc or end > issuer.not_valid_after_utc:
                raise CertificateRefusedError(
                    Cause.NESTING, i, "its validity is not inside its issuer's"
                )
        cap = caps.get(roles[i].id)
        if cap is None or end - start > timedelta(seconds=cap):
            raise CertificateRefusedError(
                Cause.LIFETIME, i, f"lives longer than {roles[i].id}'s cap"
            )

    identity = ids[0]
    assert identity is not None
    return Verified(identity=identity, role=roles[0].id, roles=tuple(r.id for r in roles))
