"""OPC-UA security layer — TLS, certificates, and SecurityPolicy management.

Handles everything between TCP connect and session activation:
    1. SecurityPolicy selection (None, Basic256Sha256, Aes128Sha256RsaOaep)
    2. Client certificate + private key loading and validation
    3. Server certificate trust store management
    4. Secure channel establishment parameters

Design notes:
    - Allen-Bradley ControlLogix L82E/L83E with v36+ firmware supports
      SecurityPolicy#None and Basic256Sha256 on port 4840.
    - WHK's initial deployment uses SecurityPolicy#None on the OT VLAN
      (network-level isolation via FortiGate firewall rules).  The security
      infrastructure is built now so certificate-based auth can be enabled
      per-PLC without code changes.
    - Certificate paths are validated eagerly at construction time to
      fail fast on misconfiguration.
"""

from __future__ import annotations

import enum
import logging
from dataclasses import dataclass, field
from pathlib import Path

from forge.modules.ot.opcua_client.exceptions import (
    CertificateError,
    ConfigurationError,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Security policy enumeration
# ---------------------------------------------------------------------------


class SecurityPolicy(str, enum.Enum):
    """OPC-UA SecurityPolicy URIs mapped to short names.

    These map 1:1 to the SecurityPolicy URIs in the OPC-UA spec:
        http://opcfoundation.org/UA/SecurityPolicy#None
        http://opcfoundation.org/UA/SecurityPolicy#Basic256Sha256
        http://opcfoundation.org/UA/SecurityPolicy#Aes128_Sha256_RsaOaep

    Basic256 (SHA-1 based) is intentionally excluded — it's deprecated
    in OPC-UA 1.04 and should not be used for new deployments.
    """

    NONE = "None"
    BASIC256_SHA256 = "Basic256Sha256"
    AES128_SHA256_RSA_OAEP = "Aes128Sha256RsaOaep"

    @property
    def uri(self) -> str:
        """Full OPC-UA SecurityPolicy URI."""
        return f"http://opcfoundation.org/UA/SecurityPolicy#{self.value}"

    @property
    def requires_certificates(self) -> bool:
        """Whether this policy requires client certificates and keys."""
        return self != SecurityPolicy.NONE


class MessageSecurityMode(str, enum.Enum):
    """OPC-UA MessageSecurityMode — controls signing and encryption.

    When SecurityPolicy is not None, the mode determines whether
    messages are signed only or signed and encrypted.
    """

    NONE = "None"
    SIGN = "Sign"
    SIGN_AND_ENCRYPT = "SignAndEncrypt"


# ---------------------------------------------------------------------------
# Certificate store
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CertificateInfo:
    """Loaded and validated certificate metadata.

    We don't parse X.509 internals here — that's the job of the
    crypto library at connection time.  This dataclass confirms
    the files exist, are readable, and stores their resolved paths.
    """

    certificate_path: Path
    private_key_path: Path
    certificate_der: bytes = field(repr=False)
    private_key_der: bytes = field(repr=False)


def load_certificate_pair(
    certificate_path: str | Path,
    private_key_path: str | Path,
) -> CertificateInfo:
    """Load and validate a client certificate + private key pair.

    Both files must exist and be readable.  We read them into memory
    eagerly so connection-time failures surface as CertificateError
    at construction, not as opaque I/O errors mid-handshake.

    Args:
        certificate_path: Path to client X.509 certificate (PEM or DER).
        private_key_path: Path to client private key (PEM or DER).

    Returns:
        CertificateInfo with resolved paths and raw bytes.

    Raises:
        CertificateError: If either file is missing or unreadable.
    """
    cert_path = Path(certificate_path)
    key_path = Path(private_key_path)

    if not cert_path.exists():
        raise CertificateError(
            f"Client certificate not found: {cert_path}",
            certificate_path=str(cert_path),
        )
    if not key_path.exists():
        raise CertificateError(
            f"Private key not found: {key_path}",
            certificate_path=str(key_path),
        )

    try:
        cert_bytes = cert_path.read_bytes()
    except OSError as exc:
        raise CertificateError(
            f"Cannot read client certificate: {exc}",
            certificate_path=str(cert_path),
        ) from exc

    try:
        key_bytes = key_path.read_bytes()
    except OSError as exc:
        raise CertificateError(
            f"Cannot read private key: {exc}",
            certificate_path=str(key_path),
        ) from exc

    if len(cert_bytes) == 0:
        raise CertificateError(
            "Client certificate file is empty",
            certificate_path=str(cert_path),
        )
    if len(key_bytes) == 0:
        raise CertificateError(
            "Private key file is empty",
            certificate_path=str(key_path),
        )

    logger.info(
        "Loaded client certificate (%d bytes) and key (%d bytes)",
        len(cert_bytes),
        len(key_bytes),
    )
    return CertificateInfo(
        certificate_path=cert_path.resolve(),
        private_key_path=key_path.resolve(),
        certificate_der=cert_bytes,
        private_key_der=key_bytes,
    )


@dataclass(frozen=True)
class TrustStore:
    """Collection of trusted server certificates.

    In OPC-UA, the client must trust the server's certificate before
    establishing a secure channel.  This store holds the DER-encoded
    certificates of all trusted OPC-UA servers.

    For SecurityPolicy#None, the trust store is not consulted.
    """

    trusted_certificates: tuple[Path, ...] = ()

    @classmethod
    def from_directory(cls, trust_dir: str | Path) -> TrustStore:
        """Load all .pem and .der files from a trust directory.

        Args:
            trust_dir: Directory containing trusted server certificates.

        Returns:
            TrustStore with resolved paths to all discovered certificates.

        Raises:
            CertificateError: If the directory doesn't exist.
        """
        trust_path = Path(trust_dir)
        if not trust_path.is_dir():
            raise CertificateError(
                f"Trust store directory not found: {trust_path}",
                certificate_path=str(trust_path),
            )

        cert_files = sorted(
            p.resolve()
            for p in trust_path.iterdir()
            if p.suffix.lower() in (".pem", ".der", ".crt")
        )

        logger.info(
            "Loaded trust store: %d certificates from %s",
            len(cert_files),
            trust_path,
        )
        return cls(trusted_certificates=tuple(cert_files))

    @classmethod
    def empty(cls) -> TrustStore:
        """Create an empty trust store (for SecurityPolicy#None)."""
        return cls()

    def __len__(self) -> int:
        return len(self.trusted_certificates)


# ---------------------------------------------------------------------------
# Security configuration (assembled from the above pieces)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SecurityConfig:
    """Complete security configuration for an OPC-UA connection.

    This is the top-level object that the OpcUaClient consumes.
    It bundles the SecurityPolicy, message mode, client credentials,
    and server trust store into a single validated configuration.

    For SecurityPolicy#None (the WHK default), only the policy field
    is needed — everything else is optional.
    """

    policy: SecurityPolicy = SecurityPolicy.NONE
    mode: MessageSecurityMode = MessageSecurityMode.NONE
    client_certificate: CertificateInfo | None = None
    trust_store: TrustStore = field(default_factory=TrustStore.empty)
    server_certificate_path: Path | None = None

    def __post_init__(self) -> None:
        """Validate cross-field consistency."""
        if self.policy.requires_certificates:
            if self.client_certificate is None:
                raise ConfigurationError(
                    f"SecurityPolicy {self.policy.value} requires a client "
                    f"certificate and private key"
                )
            if self.mode == MessageSecurityMode.NONE:
                raise ConfigurationError(
                    f"SecurityPolicy {self.policy.value} requires "
                    f"MessageSecurityMode Sign or SignAndEncrypt, got None"
                )

        if self.policy == SecurityPolicy.NONE:
            if self.mode != MessageSecurityMode.NONE:
                raise ConfigurationError(
                    f"SecurityPolicy None requires MessageSecurityMode None, "
                    f"got {self.mode.value}"
                )

    @classmethod
    def no_security(cls) -> SecurityConfig:
        """Factory for SecurityPolicy#None (no encryption, no certificates).

        This is the default for Allen-Bradley PLCs on an isolated OT VLAN
        behind FortiGate firewall rules.
        """
        return cls(
            policy=SecurityPolicy.NONE,
            mode=MessageSecurityMode.NONE,
        )

    @classmethod
    def basic256_sha256(
        cls,
        certificate_path: str | Path,
        private_key_path: str | Path,
        trust_dir: str | Path | None = None,
        server_certificate_path: str | Path | None = None,
        mode: MessageSecurityMode = MessageSecurityMode.SIGN_AND_ENCRYPT,
    ) -> SecurityConfig:
        """Factory for Basic256Sha256 with certificate authentication.

        Args:
            certificate_path: Client X.509 certificate file.
            private_key_path: Client private key file.
            trust_dir: Optional directory of trusted server certificates.
            server_certificate_path: Optional specific server cert to trust.
            mode: Sign or SignAndEncrypt (default: SignAndEncrypt).

        Returns:
            Fully validated SecurityConfig.
        """
        client_cert = load_certificate_pair(certificate_path, private_key_path)
        trust = (
            TrustStore.from_directory(trust_dir)
            if trust_dir
            else TrustStore.empty()
        )
        server_cert = (
            Path(server_certificate_path).resolve()
            if server_certificate_path
            else None
        )

        return cls(
            policy=SecurityPolicy.BASIC256_SHA256,
            mode=mode,
            client_certificate=client_cert,
            trust_store=trust,
            server_certificate_path=server_cert,
        )
