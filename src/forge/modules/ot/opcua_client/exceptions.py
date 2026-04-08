"""OPC-UA exception hierarchy — structured errors for every failure mode.

Every exception carries enough context to diagnose the problem without
reaching for raw logs.  The hierarchy is intentionally shallow:

    OpcUaError (base)
    ├── ConnectionError       — TCP/TLS/session establishment
    │   ├── EndpointUnreachable
    │   ├── SecurityNegotiationError
    │   └── SessionActivationError
    ├── TimeoutError          — Any operation exceeding its deadline
    ├── ServiceError          — OPC-UA service-level faults
    │   ├── BrowseError
    │   ├── ReadError
    │   ├── WriteError
    │   └── HistoryReadError
    ├── SubscriptionError     — Subscription lifecycle failures
    │   ├── CreateSubscriptionError
    │   └── MonitoredItemError
    ├── SecurityError         — Certificate/trust/policy failures
    │   ├── CertificateError
    │   └── PolicyViolationError
    └── ConfigurationError    — Invalid endpoint/client configuration

Design notes:
    - status_code is preserved on ServiceError subclasses so callers
      can inspect the raw OPC-UA StatusCode when needed.
    - node_id is attached to node-specific errors (Read, Write, Browse)
      for fast triage without log correlation.
    - All exceptions are picklable (no lambda/closure state) so they
      survive multiprocessing boundaries in the acquisition engine.
"""

from __future__ import annotations


class OpcUaError(Exception):
    """Base exception for all OPC-UA client operations.

    Attributes:
        message: Human-readable description.
        detail: Optional structured detail (dict) for logging/telemetry.
    """

    def __init__(self, message: str, *, detail: dict | None = None) -> None:
        self.message = message
        self.detail = detail or {}
        super().__init__(message)

    def __repr__(self) -> str:
        cls = type(self).__name__
        if self.detail:
            return f"{cls}({self.message!r}, detail={self.detail!r})"
        return f"{cls}({self.message!r})"


# ---------------------------------------------------------------------------
# Connection errors
# ---------------------------------------------------------------------------


class ConnectionError(OpcUaError):  # noqa: A001 — shadows builtin intentionally
    """Failed to establish or maintain an OPC-UA connection.

    This shadows the Python builtin ConnectionError on purpose:
    within the opcua_client package, OPC-UA connection failures are
    the only ConnectionError that matters.  External code that needs
    the builtin can use ``builtins.ConnectionError``.

    Attributes:
        endpoint_url: The OPC-UA endpoint that was targeted.
    """

    def __init__(
        self,
        message: str,
        *,
        endpoint_url: str = "",
        detail: dict | None = None,
    ) -> None:
        self.endpoint_url = endpoint_url
        super().__init__(message, detail=detail)


class EndpointUnreachable(ConnectionError):
    """TCP connection to the OPC-UA server could not be established.

    Common causes: wrong IP/port, firewall rules, PLC powered off,
    network partition between OT and IT VLANs.
    """


class SecurityNegotiationError(ConnectionError):
    """TLS/security handshake failed during connection setup.

    The server and client could not agree on a SecurityPolicy or
    the certificate exchange was rejected.
    """


class SessionActivationError(ConnectionError):
    """OPC-UA session activation failed after the secure channel was established.

    This typically means the server rejected the client's identity token
    (anonymous, username/password, or X.509 certificate).
    """


# ---------------------------------------------------------------------------
# Timeout
# ---------------------------------------------------------------------------


class TimeoutError(OpcUaError):  # noqa: A001 — shadows builtin intentionally
    """An OPC-UA operation exceeded its configured deadline.

    Attributes:
        timeout_ms: The deadline that was exceeded, in milliseconds.
        operation: A short label for the operation (e.g. "read", "browse").
    """

    def __init__(
        self,
        message: str,
        *,
        timeout_ms: float = 0,
        operation: str = "",
        detail: dict | None = None,
    ) -> None:
        self.timeout_ms = timeout_ms
        self.operation = operation
        super().__init__(message, detail=detail)


# ---------------------------------------------------------------------------
# Service-level errors (Browse, Read, Write, HistoryRead)
# ---------------------------------------------------------------------------


class ServiceError(OpcUaError):
    """An OPC-UA service call returned a non-Good StatusCode.

    Attributes:
        status_code: Raw OPC-UA StatusCode (uint32).
        node_id: The node that caused the error (if applicable).
    """

    def __init__(
        self,
        message: str,
        *,
        status_code: int = 0,
        node_id: str = "",
        detail: dict | None = None,
    ) -> None:
        self.status_code = status_code
        self.node_id = node_id
        super().__init__(message, detail=detail)


class BrowseError(ServiceError):
    """Browse service failed for one or more starting nodes."""


class ReadError(ServiceError):
    """Read service returned a Bad StatusCode for one or more nodes."""


class WriteError(ServiceError):
    """Write service failed — the server rejected the value.

    Common causes: wrong data type, access level is read-only,
    value out of engineering range, PLC in program mode.
    """


class HistoryReadError(ServiceError):
    """HistoryRead service failed or returned no data.

    Allen-Bradley ControlLogix does not support HistoryRead natively;
    this error is expected unless a historian middleware is in place.
    """


# ---------------------------------------------------------------------------
# Subscription errors
# ---------------------------------------------------------------------------


class SubscriptionError(OpcUaError):
    """A subscription lifecycle operation failed.

    Attributes:
        subscription_id: Server-assigned subscription ID (if known).
    """

    def __init__(
        self,
        message: str,
        *,
        subscription_id: int = 0,
        detail: dict | None = None,
    ) -> None:
        self.subscription_id = subscription_id
        super().__init__(message, detail=detail)


class CreateSubscriptionError(SubscriptionError):
    """The server refused to create a new subscription.

    May occur if the server's subscription limit is reached or the
    requested publishing interval is unsupported.
    """


class MonitoredItemError(SubscriptionError):
    """Failed to add, modify, or remove a monitored item.

    Attributes:
        node_id: The node that could not be monitored.
        status_code: OPC-UA StatusCode from the MonitoredItemResult.
    """

    def __init__(
        self,
        message: str,
        *,
        subscription_id: int = 0,
        node_id: str = "",
        status_code: int = 0,
        detail: dict | None = None,
    ) -> None:
        self.node_id = node_id
        self.status_code = status_code
        super().__init__(
            message, subscription_id=subscription_id, detail=detail
        )


# ---------------------------------------------------------------------------
# Security / certificate errors
# ---------------------------------------------------------------------------


class SecurityError(OpcUaError):
    """Certificate, trust store, or security policy failure.

    Raised during connection setup or when the server rejects a
    previously-trusted certificate (e.g., after certificate rotation).
    """


class CertificateError(SecurityError):
    """A specific certificate could not be loaded, parsed, or validated.

    Attributes:
        certificate_path: Path to the certificate file that failed.
    """

    def __init__(
        self,
        message: str,
        *,
        certificate_path: str = "",
        detail: dict | None = None,
    ) -> None:
        self.certificate_path = certificate_path
        super().__init__(message, detail=detail)


class PolicyViolationError(SecurityError):
    """The requested SecurityPolicy is not supported by the server.

    For example, requesting Basic256Sha256 against a PLC that only
    exposes SecurityPolicy#None.
    """


# ---------------------------------------------------------------------------
# Configuration errors
# ---------------------------------------------------------------------------


class ConfigurationError(OpcUaError):
    """Invalid OPC-UA client or endpoint configuration.

    Raised eagerly at construction time so misconfigurations fail fast
    rather than surfacing as opaque runtime errors.
    """
