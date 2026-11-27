"""A deployment's trust anchor: its form, and which version counts (D-21 SF-21, D-23 T-1, T-7).

The anchor is D-20's authorities file (D-19: "the authorities file became the deployment's
anchor"): numbered, append-only, one form for the vendor and for every deployment. It holds
everything a later step needs, so no step has to start a new genesis to add one:

* the authorities: root keys (FIDO2, the owner's among them) with their threshold, and
  release keys for approval acts, the two roles kept apart (D-20 SG-1, SG-2);
* the certificate roots, X.509 keys on their own devices, each with its device's attestation;
* the hub intermediates that count: a certificate root alone can mint nothing that counts;
* the distribution-signing key and the freshness keys (D-21 SF-21, §14): two freshness keys,
  each on its own device, either counting, so forge-core can fail over (FR-2 as amended by
  D-24 Q-7); a development or test anchor on one machine may hold one;
* the policy: the profile's hash, each role's lifetime cap, the security-key type, how many
  intermediates a hub keeps, and whether separation of duties is met;
* the stage, and any test attestation roots (never in production).

Every key the anchor names (its certificate roots', its hub intermediates', the distribution
key, the freshness keys) is read when the anchor is decoded: an admitted key in its one
encoding (``keys``), named once, in one role (FB-317). The authorities' FIDO credentials and
the attestation chains are held to a shape here and read by step 1b.

Which version counts (law 3, D-23 §7 as amended 2026-11-25): from step 1a only the pinned
genesis, matched by its canonical hash; every other version is refused by name until step 1b
builds D-20's FIDO core, after which a version counts on the authorities' threshold. A hub
with no pin refuses every anchor: an anchor is never trusted on first use (SF-21).
"""

from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Any, Literal

from cryptography import x509
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictInt,
    ValidationError,
    model_validator,
)

from forge_core.fxts.shared.runner import sha256_hex_obj
from forge_core.trust.ids import NAME_PATTERN
from forge_core.trust.keys import KeyRefusedError, certificate_key_der, public_key_der
from forge_core.trust.stages import Stage, release_refusal

FORM = "forge-anchor/1"
# pydantic matches with its own regex engine, where $ is the end of the text.
_Name = Annotated[str, Field(pattern=rf"^{NAME_PATTERN}$")]
_Pem = Annotated[
    str, Field(pattern=r"^-----BEGIN [A-Z ]+-----\n[A-Za-z0-9+/=\n]+-----END [A-Z ]+-----\n?$")
]


#: What the refusal of a key named twice says, the same words in Go.
KEY_TWICE = "one key is listed twice"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class FidoCredential(_Strict):
    """An authority's FIDO2 credential (D-20 SG-1, SG-9)."""

    id: _Name
    public_key: Annotated[
        str,
        Field(pattern=r"^sk-(ssh-ed25519|ecdsa-sha2-nistp256)@openssh\.com [A-Za-z0-9+/=]+( .*)?$"),
    ]
    device: Annotated[str, Field(min_length=1)]


class CertificateRoot(_Strict):
    """A certificate root and its device's attestation chain, attestation certificate first."""

    id: _Name
    certificate: _Pem
    attestation: tuple[_Pem, ...] = Field(min_length=1)


class HubIntermediate(_Strict):
    hub: _Name
    certificate: _Pem


class SecurityKeyType(StrEnum):
    ED25519_SK = "ed25519-sk"
    ECDSA_SK = "ecdsa-sk"


class Policy(_Strict):
    profile: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    lifetimes: dict[_Name, Annotated[StrictInt, Field(gt=0)]]
    security_key_type: SecurityKeyType
    intermediates_per_hub: Annotated[StrictInt, Field(ge=1)]
    separation_of_duties: StrictBool


class Anchor(_Strict):
    form: Literal["forge-anchor/1"]
    deployment: _Name
    version: Annotated[StrictInt, Field(ge=1)]
    stage: Stage
    root_keys: tuple[FidoCredential, ...] = Field(min_length=1)
    root_threshold: Annotated[StrictInt, Field(ge=1)]
    release_keys: tuple[FidoCredential, ...]
    certificate_roots: tuple[CertificateRoot, ...] = Field(min_length=1)
    hub_intermediates: tuple[HubIntermediate, ...]
    distribution_key: _Pem
    freshness_keys: tuple[_Pem, ...] = Field(min_length=1, max_length=2)
    test_attestation_roots: tuple[_Pem, ...] = ()
    policy: Policy

    @model_validator(mode="after")
    def _consistent(self) -> Anchor:
        if self.root_threshold > len(self.root_keys):
            msg = f"a threshold of {self.root_threshold} from {len(self.root_keys)} root keys"
            raise ValueError(msg)
        for label, ids in (
            ("root key", [k.id for k in self.root_keys]),
            ("release key", [k.id for k in self.release_keys]),
            ("certificate root", [r.id for r in self.certificate_roots]),
        ):
            if len(set(ids)) != len(ids):
                msg = f"a {label} id is listed twice"
                raise ValueError(msg)
        roles = {k.public_key.split()[1] for k in self.root_keys}
        if roles & {k.public_key.split()[1] for k in self.release_keys}:
            msg = "a key is both a root key and a release key (D-20 SG-1 keeps them apart)"
            raise ValueError(msg)
        if self.stage is Stage.PRODUCTION and self.test_attestation_roots:
            msg = "a production anchor holds no test attestation root (D-21 SF-2)"
            raise ValueError(msg)
        if self.stage is Stage.PRODUCTION and len(self.freshness_keys) != 2:
            msg = "a production anchor holds two freshness keys, one per device (D-24 Q-7)"
            raise ValueError(msg)
        self._keys_once()
        return self

    def _keys_once(self) -> None:
        """Every key the anchor names is an admitted key in its one encoding, and no key is
        named twice, in one role or in two (FB-317): one device's key cannot stand for two
        certificate roots, two hubs' intermediates, or a freshness key and anything else
        (D-21 FR-2: the freshness key signs nothing else)."""
        slots = [
            *(
                (f"certificate root {r.id}", certificate_key_der, r.certificate)
                for r in self.certificate_roots
            ),
            *(
                (f"hub intermediate {n} ({h.hub})", certificate_key_der, h.certificate)
                for n, h in enumerate(self.hub_intermediates, 1)
            ),
            ("the distribution key", public_key_der, self.distribution_key),
            *(
                (f"freshness key {n}", public_key_der, k)
                for n, k in enumerate(self.freshness_keys, 1)
            ),
        ]
        named: dict[bytes, str] = {}
        for name, read, text in slots:
            try:
                key = read(text)
            except KeyRefusedError as exc:
                raise ValueError(f"{name} {exc}") from exc
            if key in named:
                raise ValueError(f"{KEY_TWICE}: {named[key]} and {name}")
            named[key] = name

    def root_certificates(self) -> list[x509.Certificate]:
        return [
            x509.load_pem_x509_certificate(r.certificate.encode()) for r in self.certificate_roots
        ]

    def intermediate_keys(self) -> dict[bytes, str]:
        """Each listed hub intermediate's key (DER SubjectPublicKeyInfo) and its hub."""
        from forge_core.trust.verify import spki

        return {
            spki(x509.load_pem_x509_certificate(h.certificate.encode())): h.hub
            for h in self.hub_intermediates
        }


class AnchorRefusedError(Exception):
    """An anchor that does not count, with its cause."""

    def __init__(self, cause: str, detail: str) -> None:
        self.cause, self.detail = cause, detail
        super().__init__(f"{cause}: {detail}")


def pin_of(document: dict[str, Any]) -> str:
    """The pin of an anchor: the hash of its canonical JSON (sha256-c14n-v1)."""
    return sha256_hex_obj(document)


def accept(document: dict[str, Any], *, pin: str | None, release: bool) -> Anchor:
    """The anchor when this document is the pinned genesis; otherwise
    :class:`AnchorRefusedError` with its cause."""
    if not pin:
        raise AnchorRefusedError(
            "unpinned", "no anchor is pinned: an anchor is never trusted on first use"
        )
    if pin_of(document) != pin:
        raise AnchorRefusedError(
            "not-pinned",
            "not the pinned genesis; a later version counts on the authorities' threshold "
            "from step 1b (D-23 §7)",
        )
    try:
        anchor = Anchor.model_validate(document)
    except ValidationError as exc:
        raise AnchorRefusedError("malformed", str(exc).splitlines()[0]) from exc
    refusal = release_refusal(anchor.stage, release=release)
    if refusal is not None:
        raise AnchorRefusedError("test-anchor-on-release", refusal)
    return anchor


def _issued(certificate: x509.Certificate, issuer: x509.Certificate) -> bool:
    from cryptography.exceptions import InvalidSignature

    try:
        certificate.verify_directly_issued_by(issuer)
    except (ValueError, TypeError, InvalidSignature):
        return False
    return True


def anchor_problems(anchor: Anchor, profile: Any) -> list[str]:
    """What is wrong with an anchor's own certificates and policy against the profile."""
    from forge_core.trust.ids import Identity, SpiffeId
    from forge_core.trust.verify import CertificateRefusedError, check_certificate, spiffe_id

    problems = []
    if anchor.policy.profile != profile.hash:
        problems.append("the policy pins another profile")
    missing = sorted(set(profile.roles) - set(anchor.policy.lifetimes))
    unknown = sorted(set(anchor.policy.lifetimes) - set(profile.roles))
    if missing or unknown:
        problems.append(f"lifetime caps: missing {missing}, unknown {unknown}")
    root_role = profile.root
    roots = anchor.root_certificates()
    for entry, cert in zip(anchor.certificate_roots, roots, strict=True):
        try:
            check_certificate(cert, root_role, root_role, cert, 0)
            if not _issued(cert, cert):
                raise ValueError("its self-signature does not verify")
        except (CertificateRefusedError, ValueError, TypeError) as exc:
            problems.append(f"certificate root {entry.id}: {exc}")
            continue
        if spiffe_id(cert) != SpiffeId(anchor.deployment):
            problems.append(f"certificate root {entry.id}: not {SpiffeId(anchor.deployment)}")
    intermediate_role = profile.issued_by(root_role, Identity.HUB)
    for entry in anchor.hub_intermediates:
        cert = x509.load_pem_x509_certificate(entry.certificate.encode())
        try:
            # Both roots carry the same subject (one deployment, one role): the issuer is
            # the root whose key verifies the intermediate, never the first name that matches.
            issuer = next((r for r in roots if _issued(cert, r)), None)
            if intermediate_role is None or issuer is None:
                raise ValueError("no certificate root of the anchor issued it")
            check_certificate(cert, intermediate_role, root_role, issuer, 1)
        except (CertificateRefusedError, ValueError, TypeError) as exc:
            problems.append(f"hub intermediate {entry.hub}: {exc}")
            continue
        if spiffe_id(cert) != SpiffeId(anchor.deployment, hub=entry.hub):
            problems.append(f"hub intermediate {entry.hub}: its id is not its hub's")
    return problems
