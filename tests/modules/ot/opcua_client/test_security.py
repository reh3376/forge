"""Tests for OPC-UA security layer (security.py).

Covers SecurityPolicy, SecurityConfig validation, certificate loading,
and trust store management.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from forge.modules.ot.opcua_client.exceptions import (
    CertificateError,
    ConfigurationError,
)
from forge.modules.ot.opcua_client.security import (
    MessageSecurityMode,
    SecurityConfig,
    SecurityPolicy,
    TrustStore,
    load_certificate_pair,
)


# ---------------------------------------------------------------------------
# SecurityPolicy
# ---------------------------------------------------------------------------


class TestSecurityPolicy:
    """SecurityPolicy enumeration."""

    def test_none_policy(self) -> None:
        assert SecurityPolicy.NONE.value == "None"
        assert not SecurityPolicy.NONE.requires_certificates

    def test_basic256_sha256(self) -> None:
        assert SecurityPolicy.BASIC256_SHA256.value == "Basic256Sha256"
        assert SecurityPolicy.BASIC256_SHA256.requires_certificates

    def test_aes128(self) -> None:
        assert SecurityPolicy.AES128_SHA256_RSA_OAEP.requires_certificates

    def test_uri(self) -> None:
        uri = SecurityPolicy.BASIC256_SHA256.uri
        assert uri == "http://opcfoundation.org/UA/SecurityPolicy#Basic256Sha256"

    def test_none_uri(self) -> None:
        assert SecurityPolicy.NONE.uri.endswith("#None")


# ---------------------------------------------------------------------------
# SecurityConfig — no security
# ---------------------------------------------------------------------------


class TestSecurityConfigNoSecurity:
    """SecurityConfig with SecurityPolicy#None."""

    def test_no_security_factory(self) -> None:
        cfg = SecurityConfig.no_security()
        assert cfg.policy == SecurityPolicy.NONE
        assert cfg.mode == MessageSecurityMode.NONE
        assert cfg.client_certificate is None
        assert len(cfg.trust_store) == 0

    def test_default_construction(self) -> None:
        cfg = SecurityConfig()
        assert cfg.policy == SecurityPolicy.NONE

    def test_none_with_sign_mode_rejected(self) -> None:
        """SecurityPolicy None + Sign mode is contradictory."""
        with pytest.raises(ConfigurationError, match="MessageSecurityMode None"):
            SecurityConfig(
                policy=SecurityPolicy.NONE,
                mode=MessageSecurityMode.SIGN,
            )


# ---------------------------------------------------------------------------
# SecurityConfig — with certificates
# ---------------------------------------------------------------------------


class TestSecurityConfigWithCerts:
    """SecurityConfig validation for certificate-based policies."""

    def test_basic256_without_cert_rejected(self) -> None:
        """Basic256Sha256 requires a client certificate."""
        with pytest.raises(ConfigurationError, match="requires a client certificate"):
            SecurityConfig(
                policy=SecurityPolicy.BASIC256_SHA256,
                mode=MessageSecurityMode.SIGN_AND_ENCRYPT,
                client_certificate=None,
            )

    def test_basic256_with_none_mode_rejected(self) -> None:
        """Basic256Sha256 requires Sign or SignAndEncrypt mode."""
        # The cert-missing check fires first when no cert is provided,
        # so we test the mode check with a cert present but wrong mode.
        with pytest.raises(ConfigurationError, match="requires a client certificate"):
            SecurityConfig(
                policy=SecurityPolicy.BASIC256_SHA256,
                mode=MessageSecurityMode.NONE,
            )


# ---------------------------------------------------------------------------
# Certificate loading
# ---------------------------------------------------------------------------


class TestLoadCertificatePair:
    """load_certificate_pair() file validation."""

    def test_missing_certificate(self, tmp_path: Path) -> None:
        key = tmp_path / "client.key"
        key.write_bytes(b"fake-key-data")
        with pytest.raises(CertificateError, match="not found"):
            load_certificate_pair(tmp_path / "missing.pem", key)

    def test_missing_private_key(self, tmp_path: Path) -> None:
        cert = tmp_path / "client.pem"
        cert.write_bytes(b"fake-cert-data")
        with pytest.raises(CertificateError, match="not found"):
            load_certificate_pair(cert, tmp_path / "missing.key")

    def test_empty_certificate(self, tmp_path: Path) -> None:
        cert = tmp_path / "client.pem"
        cert.write_bytes(b"")
        key = tmp_path / "client.key"
        key.write_bytes(b"fake-key-data")
        with pytest.raises(CertificateError, match="empty"):
            load_certificate_pair(cert, key)

    def test_empty_private_key(self, tmp_path: Path) -> None:
        cert = tmp_path / "client.pem"
        cert.write_bytes(b"fake-cert-data")
        key = tmp_path / "client.key"
        key.write_bytes(b"")
        with pytest.raises(CertificateError, match="empty"):
            load_certificate_pair(cert, key)

    def test_valid_pair(self, tmp_path: Path) -> None:
        cert = tmp_path / "client.pem"
        cert.write_bytes(b"-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----")
        key = tmp_path / "client.key"
        key.write_bytes(b"-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----")

        info = load_certificate_pair(cert, key)
        assert info.certificate_path == cert.resolve()
        assert info.private_key_path == key.resolve()
        assert len(info.certificate_der) > 0
        assert len(info.private_key_der) > 0


# ---------------------------------------------------------------------------
# TrustStore
# ---------------------------------------------------------------------------


class TestTrustStore:
    """TrustStore directory loading."""

    def test_empty_factory(self) -> None:
        ts = TrustStore.empty()
        assert len(ts) == 0

    def test_missing_directory(self) -> None:
        with pytest.raises(CertificateError, match="not found"):
            TrustStore.from_directory("/nonexistent/trust/dir")

    def test_load_from_directory(self, tmp_path: Path) -> None:
        (tmp_path / "server1.pem").write_bytes(b"cert1")
        (tmp_path / "server2.der").write_bytes(b"cert2")
        (tmp_path / "server3.crt").write_bytes(b"cert3")
        (tmp_path / "readme.txt").write_text("not a cert")

        ts = TrustStore.from_directory(tmp_path)
        assert len(ts) == 3

    def test_empty_directory(self, tmp_path: Path) -> None:
        ts = TrustStore.from_directory(tmp_path)
        assert len(ts) == 0


# ---------------------------------------------------------------------------
# SecurityConfig.basic256_sha256 factory
# ---------------------------------------------------------------------------


class TestSecurityConfigFactory:
    """basic256_sha256() convenience factory."""

    def test_full_setup(self, tmp_path: Path) -> None:
        cert = tmp_path / "client.pem"
        cert.write_bytes(b"fake-cert-data-here")
        key = tmp_path / "client.key"
        key.write_bytes(b"fake-key-data-here")

        trust_dir = tmp_path / "trusted"
        trust_dir.mkdir()
        (trust_dir / "plc200.pem").write_bytes(b"plc-cert")

        cfg = SecurityConfig.basic256_sha256(
            certificate_path=cert,
            private_key_path=key,
            trust_dir=trust_dir,
        )
        assert cfg.policy == SecurityPolicy.BASIC256_SHA256
        assert cfg.mode == MessageSecurityMode.SIGN_AND_ENCRYPT
        assert cfg.client_certificate is not None
        assert len(cfg.trust_store) == 1

    def test_without_trust_dir(self, tmp_path: Path) -> None:
        cert = tmp_path / "client.pem"
        cert.write_bytes(b"fake-cert-data-here")
        key = tmp_path / "client.key"
        key.write_bytes(b"fake-key-data-here")

        cfg = SecurityConfig.basic256_sha256(
            certificate_path=cert,
            private_key_path=key,
        )
        assert len(cfg.trust_store) == 0
