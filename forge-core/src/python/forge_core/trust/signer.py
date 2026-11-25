"""A key held on a device, signing through PKCS#11 as ``cryptography`` signs (D-23 T-5).

One interface reaches every device the trust root uses: a YubiKey through ``ykcs11``, a
YubiHSM 2 through Yubico's module, a TPM through ``tpm2-pkcs11``, and SoftHSM under the
``test`` stage. :class:`DeviceKey` is a ``cryptography`` private key whose ``sign`` asks the
device to sign a digest; the private key never leaves it, and every other private-key
operation is refused. ``cryptography``'s ``CertificateBuilder.sign`` calls it like any key
(proved on cryptography 50.0.2, 2026-11-25).

The module path, the token and the PIN are given by the caller, who reads them from its
environment; nothing here holds a default.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import TYPE_CHECKING, Any, NoReturn

import pkcs11
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from pkcs11 import Attribute, KeyType, Mechanism, MechanismFlag, ObjectClass
from pkcs11.util.ec import encode_ec_public_key, encode_named_curve_parameters

if TYPE_CHECKING:
    from collections.abc import Iterator

CURVES = {"secp256r1": ec.SECP256R1, "secp384r1": ec.SECP384R1}


class DeviceKeyError(Exception):
    """A device key that cannot be used as asked, naming why."""


class DeviceKey(ec.EllipticCurvePrivateKey):
    """An EC private key on a device. Only ``sign`` and ``public_key`` work."""

    def __init__(self, private: Any, public: ec.EllipticCurvePublicKey) -> None:
        self._private, self._public = private, public

    @property
    def curve(self) -> ec.EllipticCurve:
        return self._public.curve

    @property
    def key_size(self) -> int:
        return self._public.key_size

    def public_key(self) -> ec.EllipticCurvePublicKey:
        return self._public

    def sign(self, data: bytes, signature_algorithm: ec.EllipticCurveSignatureAlgorithm) -> bytes:
        if not isinstance(signature_algorithm, ec.ECDSA) or not isinstance(
            signature_algorithm.algorithm, hashes.HashAlgorithm
        ):
            raise DeviceKeyError("a device key signs ECDSA over a named hash only")
        digest = hashes.Hash(signature_algorithm.algorithm)
        digest.update(data)
        raw = self._private.sign(digest.finalize(), mechanism=Mechanism.ECDSA)
        half = len(raw) // 2
        return encode_dss_signature(int.from_bytes(raw[:half]), int.from_bytes(raw[half:]))

    def _refuse(self, *_: object) -> NoReturn:
        raise DeviceKeyError("the private key stays on its device")

    exchange = _refuse
    private_numbers = _refuse
    private_bytes = _refuse
    private_bytes_raw = _refuse

    def __copy__(self) -> DeviceKey:
        return self

    def __deepcopy__(self, memo: dict[int, object]) -> DeviceKey:
        return self


def _public_of(public_object: Any) -> ec.EllipticCurvePublicKey:
    key = serialization.load_der_public_key(encode_ec_public_key(public_object))
    if not isinstance(key, ec.EllipticCurvePublicKey):
        raise DeviceKeyError("the device key is not an EC key")
    return key


def _usable(private: Any, label: str) -> None:
    if private[Attribute.EXTRACTABLE] or not private[Attribute.SENSITIVE]:
        msg = f"{label}: the private key could leave the device; it is refused"
        raise DeviceKeyError(msg)


@contextmanager
def session(module: str, *, token_label: str, pin: str) -> Iterator[Any]:
    """A logged-in read-write session on one token of a PKCS#11 module."""
    lib = pkcs11.lib(module)
    token = lib.get_token(token_label=token_label)
    with token.open(user_pin=pin, rw=True) as opened:
        yield opened


def find_key(opened: Any, *, label: str) -> DeviceKey:
    """The EC key pair stored under ``label``, refused unless its private key cannot leave."""
    try:
        private = opened.get_key(
            object_class=ObjectClass.PRIVATE_KEY, key_type=KeyType.EC, label=label
        )
        public = opened.get_key(
            object_class=ObjectClass.PUBLIC_KEY, key_type=KeyType.EC, label=label
        )
    except (pkcs11.NoSuchKey, pkcs11.MultipleObjectsReturned) as exc:
        msg = f"{label}: not exactly one EC key pair on the token ({type(exc).__name__})"
        raise DeviceKeyError(msg) from exc
    _usable(private, label)
    return DeviceKey(private, _public_of(public))


def generate_key(opened: Any, *, curve: str, label: str) -> DeviceKey:
    """A new EC key pair generated on the device, its private key sensitive and fixed there.

    For a device that attests its keys (YubiKey PIV, YubiHSM 2, TPM) the ceremony generates
    with the device's own tool and keeps the attestation (D-23 T-3); this is the path for
    SoftHSM under the ``test`` stage, which has no attestation.
    """
    if curve not in CURVES:
        msg = f"{curve!r} is not a curve of the profile"
        raise DeviceKeyError(msg)
    parameters = opened.create_domain_parameters(
        KeyType.EC, {Attribute.EC_PARAMS: encode_named_curve_parameters(curve)}, local=True
    )
    public, private = parameters.generate_keypair(
        store=True,
        label=label,
        capabilities=MechanismFlag.SIGN | MechanismFlag.VERIFY,
        private_template={Attribute.EXTRACTABLE: False, Attribute.SENSITIVE: True},
    )
    _usable(private, label)
    return DeviceKey(private, _public_of(public))
