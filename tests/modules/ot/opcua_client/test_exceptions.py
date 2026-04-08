"""Tests for OPC-UA exception hierarchy (exceptions.py).

Validates exception inheritance, attribute preservation, and repr formatting.
"""

from __future__ import annotations

import pytest

from forge.modules.ot.opcua_client.exceptions import (
    BrowseError,
    CertificateError,
    ConfigurationError,
    ConnectionError,
    CreateSubscriptionError,
    EndpointUnreachable,
    HistoryReadError,
    MonitoredItemError,
    OpcUaError,
    PolicyViolationError,
    ReadError,
    SecurityError,
    SecurityNegotiationError,
    ServiceError,
    SessionActivationError,
    SubscriptionError,
    TimeoutError,
    WriteError,
)


# ---------------------------------------------------------------------------
# Base exception
# ---------------------------------------------------------------------------


class TestOpcUaError:
    """Base OpcUaError."""

    def test_message(self) -> None:
        err = OpcUaError("something broke")
        assert err.message == "something broke"
        assert str(err) == "something broke"

    def test_detail(self) -> None:
        err = OpcUaError("fail", detail={"key": "value"})
        assert err.detail == {"key": "value"}

    def test_default_detail_empty(self) -> None:
        err = OpcUaError("fail")
        assert err.detail == {}

    def test_repr_without_detail(self) -> None:
        err = OpcUaError("test")
        assert repr(err) == "OpcUaError('test')"

    def test_repr_with_detail(self) -> None:
        err = OpcUaError("test", detail={"x": 1})
        assert "detail=" in repr(err)

    def test_is_exception(self) -> None:
        assert issubclass(OpcUaError, Exception)


# ---------------------------------------------------------------------------
# Connection errors
# ---------------------------------------------------------------------------


class TestConnectionErrors:
    """ConnectionError hierarchy."""

    def test_connection_error_endpoint(self) -> None:
        err = ConnectionError(
            "failed", endpoint_url="opc.tcp://10.4.2.10:4840"
        )
        assert err.endpoint_url == "opc.tcp://10.4.2.10:4840"
        assert isinstance(err, OpcUaError)

    def test_endpoint_unreachable(self) -> None:
        err = EndpointUnreachable(
            "host down", endpoint_url="opc.tcp://10.4.2.99:4840"
        )
        assert isinstance(err, ConnectionError)
        assert isinstance(err, OpcUaError)

    def test_security_negotiation_error(self) -> None:
        err = SecurityNegotiationError("TLS handshake rejected")
        assert isinstance(err, ConnectionError)

    def test_session_activation_error(self) -> None:
        err = SessionActivationError("identity token rejected")
        assert isinstance(err, ConnectionError)


# ---------------------------------------------------------------------------
# Timeout
# ---------------------------------------------------------------------------


class TestTimeoutError:
    """TimeoutError with operation context."""

    def test_timeout_attributes(self) -> None:
        err = TimeoutError(
            "read timed out",
            timeout_ms=10_000,
            operation="read",
        )
        assert err.timeout_ms == 10_000
        assert err.operation == "read"
        assert isinstance(err, OpcUaError)


# ---------------------------------------------------------------------------
# Service errors
# ---------------------------------------------------------------------------


class TestServiceErrors:
    """ServiceError hierarchy with status codes."""

    def test_service_error_status_code(self) -> None:
        err = ServiceError(
            "bad status",
            status_code=0x80000000,
            node_id="ns=2;s=Tag1",
        )
        assert err.status_code == 0x80000000
        assert err.node_id == "ns=2;s=Tag1"
        assert isinstance(err, OpcUaError)

    def test_browse_error(self) -> None:
        err = BrowseError("browse failed", status_code=0x80040000)
        assert isinstance(err, ServiceError)

    def test_read_error(self) -> None:
        err = ReadError("read failed", node_id="ns=2;s=Bad")
        assert isinstance(err, ServiceError)
        assert err.node_id == "ns=2;s=Bad"

    def test_write_error(self) -> None:
        err = WriteError("read only", node_id="ns=2;s=RO")
        assert isinstance(err, ServiceError)

    def test_history_read_error(self) -> None:
        err = HistoryReadError("not supported")
        assert isinstance(err, ServiceError)


# ---------------------------------------------------------------------------
# Subscription errors
# ---------------------------------------------------------------------------


class TestSubscriptionErrors:
    """SubscriptionError hierarchy."""

    def test_subscription_error(self) -> None:
        err = SubscriptionError("failed", subscription_id=42)
        assert err.subscription_id == 42
        assert isinstance(err, OpcUaError)

    def test_create_subscription_error(self) -> None:
        err = CreateSubscriptionError("limit reached")
        assert isinstance(err, SubscriptionError)

    def test_monitored_item_error(self) -> None:
        err = MonitoredItemError(
            "cannot monitor",
            subscription_id=5,
            node_id="ns=2;s=Tag1",
            status_code=0x80000000,
        )
        assert err.subscription_id == 5
        assert err.node_id == "ns=2;s=Tag1"
        assert err.status_code == 0x80000000
        assert isinstance(err, SubscriptionError)


# ---------------------------------------------------------------------------
# Security errors
# ---------------------------------------------------------------------------


class TestSecurityErrors:
    """SecurityError hierarchy."""

    def test_security_error(self) -> None:
        err = SecurityError("cert rejected")
        assert isinstance(err, OpcUaError)

    def test_certificate_error(self) -> None:
        err = CertificateError(
            "not found", certificate_path="/certs/missing.pem"
        )
        assert err.certificate_path == "/certs/missing.pem"
        assert isinstance(err, SecurityError)

    def test_policy_violation_error(self) -> None:
        err = PolicyViolationError("Basic256Sha256 not supported")
        assert isinstance(err, SecurityError)


# ---------------------------------------------------------------------------
# Configuration errors
# ---------------------------------------------------------------------------


class TestConfigurationError:
    """ConfigurationError for invalid setup."""

    def test_configuration_error(self) -> None:
        err = ConfigurationError("bad endpoint")
        assert isinstance(err, OpcUaError)


# ---------------------------------------------------------------------------
# Catch-all hierarchy tests
# ---------------------------------------------------------------------------


class TestExceptionHierarchy:
    """Verify that catching broad categories works."""

    def test_catch_all_opcua(self) -> None:
        """All exceptions are catchable as OpcUaError."""
        exceptions = [
            ConnectionError("x"),
            EndpointUnreachable("x"),
            SecurityNegotiationError("x"),
            SessionActivationError("x"),
            TimeoutError("x"),
            ServiceError("x"),
            BrowseError("x"),
            ReadError("x"),
            WriteError("x"),
            HistoryReadError("x"),
            SubscriptionError("x"),
            CreateSubscriptionError("x"),
            MonitoredItemError("x"),
            SecurityError("x"),
            CertificateError("x"),
            PolicyViolationError("x"),
            ConfigurationError("x"),
        ]
        for exc in exceptions:
            assert isinstance(exc, OpcUaError), f"{type(exc)} is not OpcUaError"

    def test_catch_connection_category(self) -> None:
        """All connection subtypes are catchable as ConnectionError."""
        for exc_cls in (
            EndpointUnreachable,
            SecurityNegotiationError,
            SessionActivationError,
        ):
            assert issubclass(exc_cls, ConnectionError)

    def test_catch_service_category(self) -> None:
        """All service subtypes are catchable as ServiceError."""
        for exc_cls in (BrowseError, ReadError, WriteError, HistoryReadError):
            assert issubclass(exc_cls, ServiceError)
