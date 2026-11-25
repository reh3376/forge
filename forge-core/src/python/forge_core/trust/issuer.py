"""The issuer: one way to make a certificate, and it refuses anything outside the profile.

The manager certifies hubs' intermediates and every hub issues its own leaves, all through
this code (D-23 T-5), so there is one issuer. A request names a role, an id, a public key,
a start and a lifetime. The issuer refuses it, naming why, unless the role exists and is
issued by the issuer's role, the id has the role's form and sits under the issuer's id, the
key is on the role's curve, the lifetime is within the anchor policy's cap for the role, and
the validity lies inside the issuer's. Every other field comes from the profile, never from
the request. Before returning a certificate the issuer runs the verifier's own profile check
and signature check on it, so it cannot hand out a certificate the verifiers would refuse.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import TYPE_CHECKING

from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

from forge_core.trust.verify import (
    CertificateRefusedError,
    check_certificate,
    spiffe_id,
    subject_for,
)

if TYPE_CHECKING:
    from collections.abc import Mapping

    from forge_core.trust.ids import SpiffeId
    from forge_core.trust.profile import Profile, Role

_HASHES: dict[str, type[hashes.HashAlgorithm]] = {"sha256": hashes.SHA256, "sha384": hashes.SHA384}
_EKU = {
    "server_auth": ExtendedKeyUsageOID.SERVER_AUTH,
    "client_auth": ExtendedKeyUsageOID.CLIENT_AUTH,
}


class IssueRefusedError(ValueError):
    """A request the issuer will not sign, with its cause."""

    def __init__(self, cause: str, detail: str) -> None:
        self.cause, self.detail = cause, detail
        super().__init__(f"{cause}: {detail}")


@dataclass(frozen=True)
class Request:
    role: str
    subject: SpiffeId
    public_key: ec.EllipticCurvePublicKey
    not_before: datetime
    lifetime: timedelta


def _issuer_role(profile: Profile, issuer: x509.Certificate) -> Role | None:
    unit = issuer.subject.get_attributes_for_oid(NameOID.ORGANIZATIONAL_UNIT_NAME)
    return profile.roles.get(str(unit[0].value)) if len(unit) == 1 else None


def issue(
    request: Request,
    *,
    signer: ec.EllipticCurvePrivateKey,
    issuer: x509.Certificate | None,
    profile: Profile,
    caps: Mapping[str, int],
) -> x509.Certificate:
    """Sign the request with ``signer`` as ``issuer`` (``None`` for a self-signed root)."""
    role = profile.roles.get(request.role)
    if role is None:
        raise IssueRefusedError("role", f"the profile has no role {request.role!r}")
    if request.not_before.tzinfo is None or request.not_before.utcoffset() is None:
        raise IssueRefusedError("time", "the start must be timezone-aware (one clock)")
    signer_public = signer.public_key()

    if issuer is None:
        if not role.self_signed:
            raise IssueRefusedError(
                "issuer", f"{role.id} is issued by {role.issued_by}, not by itself"
            )
        if signer_public != request.public_key:
            raise IssueRefusedError("issuer", "a certificate root is signed by its own key")
        issuer_role, issuer_id = role, request.subject
    else:
        if role.self_signed:
            # Found by the exhaustive check: a root's key would otherwise cross-certify a
            # second "root", a CA the profile has no place for.
            raise IssueRefusedError(
                "issuer", f"{role.id} signs itself; no other certificate issues it"
            )
        found = _issuer_role(profile, issuer)
        issuer_id = spiffe_id(issuer)
        if found is None or issuer_id is None or found.id != role.issued_by:
            raise IssueRefusedError("issuer", f"{role.id} is issued by {role.issued_by}")
        if signer_public != issuer.public_key():
            raise IssueRefusedError("issuer", "the signing key is not the issuer certificate's key")
        issuer_role = found

    if request.subject.kind is not role.identity:
        raise IssueRefusedError(
            "identity", f"{role.id} is for a {role.identity} id, not {request.subject}"
        )
    if not request.subject.is_under(issuer_id):
        raise IssueRefusedError(
            "identity", f"{request.subject} is not under its issuer {issuer_id}"
        )
    key = request.public_key
    if not isinstance(key, ec.EllipticCurvePublicKey) or key.curve.name != role.curve:
        raise IssueRefusedError("curve", f"{role.id} keys are on {role.curve}")
    cap = caps.get(role.id)
    if cap is None or request.lifetime <= timedelta(0) or request.lifetime > timedelta(seconds=cap):
        raise IssueRefusedError(
            "lifetime", f"{role.id} lives at most {cap} s by the anchor's policy"
        )
    not_after = request.not_before + request.lifetime
    if issuer is not None and (
        request.not_before < issuer.not_valid_before_utc or not_after > issuer.not_valid_after_utc
    ):
        raise IssueRefusedError("validity-nesting", "the validity is not inside the issuer's")

    issuer_public = key if issuer is None else issuer.public_key()
    usage = role.key_usage
    builder = (
        x509.CertificateBuilder()
        .subject_name(subject_for(role, request.subject))
        .issuer_name(subject_for(role, request.subject) if issuer is None else issuer.subject)
        .public_key(key)
        .serial_number(x509.random_serial_number())
        .not_valid_before(request.not_before)
        .not_valid_after(not_after)
        .add_extension(
            x509.BasicConstraints(ca=role.ca, path_length=role.path_length), critical=True
        )
        .add_extension(
            x509.KeyUsage(
                digital_signature="digital_signature" in usage,
                content_commitment=False,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign="key_cert_sign" in usage,
                crl_sign="crl_sign" in usage,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .add_extension(
            x509.SubjectAlternativeName([x509.UniformResourceIdentifier(str(request.subject))]),
            critical=True,
        )
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(key), critical=False)
        .add_extension(
            x509.AuthorityKeyIdentifier.from_issuer_public_key(issuer_public), critical=False
        )
    )
    if role.extended_key_usage:
        builder = builder.add_extension(
            x509.ExtendedKeyUsage([_EKU[name] for name in sorted(role.extended_key_usage)]),
            critical=False,
        )
    assert issuer_role.signs_with is not None  # a CA role names it (role_problems)
    certificate = builder.sign(signer, _HASHES[issuer_role.signs_with]())

    issuer_certificate = certificate if issuer is None else issuer
    try:
        check_certificate(certificate, role, issuer_role, issuer_certificate, 0)
        certificate.verify_directly_issued_by(issuer_certificate)
    except (CertificateRefusedError, ValueError, TypeError, InvalidSignature) as exc:
        raise IssueRefusedError(
            "self-check", f"the certificate made does not verify: {exc}"
        ) from exc
    return certificate
