"""Hardened async OPC-UA client — production SCADA-grade session management.

Wraps asyncua (opcua-asyncio) as the transport layer while providing:
    - Strong Pydantic typing (our models in, our models out)
    - Forge-specific state machine and health monitoring
    - Auto-reconnect with exponential backoff
    - Structured exception hierarchy (never leaks asyncua types)

External code never touches asyncua types directly.  Everything goes
through our Pydantic models.  This boundary means we can swap asyncua
for a Rust FFI transport later without changing any caller.

The client is an async context manager that owns the full connection lifecycle:
    connect → create secure channel → activate session → operate → close
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from asyncua import Client as UaClient
from asyncua import Node as UaNode
from asyncua import ua

from forge.modules.ot.opcua_client.exceptions import (
    BrowseError,
    ConfigurationError,
    ConnectionError,
    CreateSubscriptionError,
    EndpointUnreachable,
    HistoryReadError,
    MonitoredItemError,
    OpcUaError,
    ReadError,
    SecurityNegotiationError,
    SubscriptionError,
    TimeoutError,
    WriteError,
)
from forge.modules.ot.opcua_client.security import (
    MessageSecurityMode,
    SecurityConfig,
    SecurityPolicy,
)
from forge.modules.ot.opcua_client.types import (
    AccessLevel,
    BrowseResult,
    ConnectionHealth,
    ConnectionState,
    DataType,
    DataValue,
    MonitoredItem,
    NodeClass,
    NodeId,
    OpcUaEndpoint,
    QualityCode,
    Subscription,
)

logger = logging.getLogger(__name__)

# Type alias for subscription callbacks
SubscriptionCallback = Callable[[str, DataValue], Any]
"""Callback signature: (node_id_string, data_value) → None.

Callbacks are invoked from the subscription dispatch loop.
They should be fast and non-blocking; heavy work should be
offloaded to a queue or thread pool.
"""


# ---------------------------------------------------------------------------
# Valid state transitions (state machine enforcement)
# ---------------------------------------------------------------------------

_VALID_TRANSITIONS: dict[ConnectionState, set[ConnectionState]] = {
    ConnectionState.DISCONNECTED: {ConnectionState.CONNECTING},
    ConnectionState.CONNECTING: {
        ConnectionState.CONNECTED,
        ConnectionState.FAILED,
        ConnectionState.DISCONNECTED,
    },
    ConnectionState.CONNECTED: {
        ConnectionState.RECONNECTING,
        ConnectionState.DISCONNECTED,
    },
    ConnectionState.RECONNECTING: {
        ConnectionState.CONNECTED,
        ConnectionState.FAILED,
        ConnectionState.DISCONNECTED,
    },
    ConnectionState.FAILED: {
        ConnectionState.CONNECTING,
        ConnectionState.DISCONNECTED,
    },
}


# ---------------------------------------------------------------------------
# asyncua ↔ Forge type converters
# ---------------------------------------------------------------------------

# Map asyncua ua.NodeClass → our NodeClass enum
_UA_NODE_CLASS_MAP: dict[ua.NodeClass, NodeClass] = {
    ua.NodeClass.Object: NodeClass.OBJECT,
    ua.NodeClass.Variable: NodeClass.VARIABLE,
    ua.NodeClass.Method: NodeClass.METHOD,
    ua.NodeClass.ObjectType: NodeClass.OBJECT_TYPE,
    ua.NodeClass.VariableType: NodeClass.VARIABLE_TYPE,
    ua.NodeClass.ReferenceType: NodeClass.REFERENCE_TYPE,
    ua.NodeClass.DataType: NodeClass.DATA_TYPE,
    ua.NodeClass.View: NodeClass.VIEW,
}

# Map asyncua ua.VariantType → our DataType enum
_UA_VARIANT_TYPE_MAP: dict[ua.VariantType, DataType] = {
    ua.VariantType.Boolean: DataType.BOOLEAN,
    ua.VariantType.SByte: DataType.SBYTE,
    ua.VariantType.Byte: DataType.BYTE,
    ua.VariantType.Int16: DataType.INT16,
    ua.VariantType.UInt16: DataType.UINT16,
    ua.VariantType.Int32: DataType.INT32,
    ua.VariantType.UInt32: DataType.UINT32,
    ua.VariantType.Int64: DataType.INT64,
    ua.VariantType.UInt64: DataType.UINT64,
    ua.VariantType.Float: DataType.FLOAT,
    ua.VariantType.Double: DataType.DOUBLE,
    ua.VariantType.String: DataType.STRING,
    ua.VariantType.DateTime: DataType.DATETIME,
    ua.VariantType.ByteString: DataType.BYTE_STRING,
    ua.VariantType.NodeId: DataType.NODE_ID,
    ua.VariantType.ExtensionObject: DataType.EXTENSION_OBJECT,
    ua.VariantType.Variant: DataType.VARIANT,
}

# Map our DataType → asyncua ua.VariantType (for writes)
_FORGE_TO_UA_VARIANT: dict[DataType, ua.VariantType] = {
    v: k for k, v in _UA_VARIANT_TYPE_MAP.items()
}


def _convert_node_id(ua_node_id: ua.NodeId) -> NodeId:
    """Convert asyncua NodeId to Forge NodeId."""
    identifier: str | int
    # TwoByte, FourByte, and Numeric are all integer-based identifiers
    numeric_types = {ua.NodeIdType.Numeric, ua.NodeIdType.TwoByte, ua.NodeIdType.FourByte}
    if ua_node_id.NodeIdType in numeric_types:
        identifier = int(ua_node_id.Identifier)
    else:
        identifier = str(ua_node_id.Identifier)
    return NodeId(namespace=ua_node_id.NamespaceIndex, identifier=identifier)


def _convert_quality(status_code: ua.StatusCode) -> QualityCode:
    """Convert asyncua StatusCode to Forge QualityCode."""
    raw = status_code.value if hasattr(status_code, "value") else int(status_code)
    return QualityCode.from_status_code(raw)


def _convert_data_value(ua_dv: ua.DataValue) -> DataValue:
    """Convert asyncua DataValue to Forge DataValue."""
    raw_status = (
        ua_dv.StatusCode.value
        if hasattr(ua_dv.StatusCode, "value")
        else int(ua_dv.StatusCode or 0)
    )

    # Determine data type from the variant
    data_type = DataType.VARIANT
    if ua_dv.Value is not None and hasattr(ua_dv.Value, "VariantType"):
        data_type = _UA_VARIANT_TYPE_MAP.get(
            ua_dv.Value.VariantType, DataType.VARIANT
        )

    # Extract the actual Python value from the Variant
    value = ua_dv.Value.Value if ua_dv.Value is not None else None

    # Timestamps — asyncua gives datetime or None
    source_ts = ua_dv.SourceTimestamp or datetime.now(timezone.utc)
    server_ts = ua_dv.ServerTimestamp or datetime.now(timezone.utc)
    if source_ts.tzinfo is None:
        source_ts = source_ts.replace(tzinfo=timezone.utc)
    if server_ts.tzinfo is None:
        server_ts = server_ts.replace(tzinfo=timezone.utc)

    return DataValue(
        value=value,
        data_type=data_type,
        quality=QualityCode.from_status_code(raw_status),
        status_code=raw_status,
        source_timestamp=source_ts,
        server_timestamp=server_ts,
    )


def _forge_node_id_to_ua(node_id: NodeId) -> ua.NodeId:
    """Convert Forge NodeId to asyncua NodeId."""
    if isinstance(node_id.identifier, int):
        return ua.NodeId(node_id.identifier, node_id.namespace)
    return ua.NodeId(node_id.identifier, node_id.namespace)


def _build_security_string(security: SecurityConfig) -> str | None:
    """Build asyncua set_security_string() argument from SecurityConfig.

    Format: "Policy,Mode,client_cert,client_key[,server_cert]"
    Returns None for SecurityPolicy#None.
    """
    if security.policy == SecurityPolicy.NONE:
        return None

    mode_map = {
        MessageSecurityMode.SIGN: "Sign",
        MessageSecurityMode.SIGN_AND_ENCRYPT: "SignAndEncrypt",
    }
    mode_str = mode_map.get(security.mode, "SignAndEncrypt")
    policy_str = security.policy.value  # e.g., "Basic256Sha256"

    cert = security.client_certificate
    if cert is None:
        return None  # Should not happen — SecurityConfig validates this

    parts = [
        policy_str,
        mode_str,
        str(cert.certificate_path),
        str(cert.private_key_path),
    ]
    if security.server_certificate_path:
        parts.append(str(security.server_certificate_path))

    return ",".join(parts)


# ---------------------------------------------------------------------------
# Subscription handler bridge (asyncua → Forge callbacks)
# ---------------------------------------------------------------------------


class _ForgeSubHandler:
    """Bridges asyncua's SubscriptionHandler to Forge SubscriptionCallbacks.

    asyncua calls ``datachange_notification(node, val, data)`` on its handler.
    We translate that into ``callback(node_id_str, DataValue)`` for Forge.
    """

    def __init__(self, callback: SubscriptionCallback, client_ref: OpcUaClient) -> None:
        self._callback = callback
        self._client_ref = client_ref

    def datachange_notification(self, node: UaNode, val: Any, data: Any) -> None:
        """Called by asyncua when a monitored item changes."""
        try:
            node_id_str = node.nodeid.to_string()
            # data.monitored_item.Value is the full ua.DataValue
            if hasattr(data, "monitored_item") and hasattr(
                data.monitored_item, "Value"
            ):
                forge_dv = _convert_data_value(data.monitored_item.Value)
            else:
                # Fallback: construct from raw value
                forge_dv = DataValue(
                    value=val,
                    quality=QualityCode.GOOD,
                    source_timestamp=datetime.now(timezone.utc),
                    server_timestamp=datetime.now(timezone.utc),
                )

            self._client_ref._last_data_received = datetime.now(timezone.utc)
            self._callback(node_id_str, forge_dv)

        except Exception:
            logger.exception(
                "Error in subscription callback for node %s", node.nodeid
            )


# ---------------------------------------------------------------------------
# Main client
# ---------------------------------------------------------------------------


class OpcUaClient:
    """Async OPC-UA client for Allen-Bradley ControlLogix PLCs.

    Wraps asyncua as the transport layer while exposing a typed,
    Pydantic-model-based API with Forge-specific health monitoring
    and error handling.

    Usage::

        async with OpcUaClient(
            endpoint="opc.tcp://10.4.2.10:4840",
            name="plc200",
        ) as client:
            nodes = await client.browse("ns=2;s=Fermentation")
            values = await client.read(["ns=2;s=Fermentation/TIT_2010/Out_PV"])
            sub_id = await client.subscribe(
                node_ids=["ns=2;s=Fermentation/TIT_2010/Out_PV"],
                callback=on_value_change,
            )

    The client validates its configuration eagerly at construction and
    defers connection to ``connect()`` (or the async context manager).
    """

    def __init__(
        self,
        endpoint: str | OpcUaEndpoint,
        *,
        name: str = "",
        security: SecurityConfig | None = None,
        session_timeout_ms: int = 60_000,
        request_timeout_ms: int = 10_000,
        reconnect_interval_ms: int = 1_000,
        max_reconnect_attempts: int = 0,
    ) -> None:
        """Initialize the OPC-UA client.

        Args:
            endpoint: OPC-UA endpoint URL string or OpcUaEndpoint model.
            name: Human-readable connection name for logging.
            security: Security configuration (default: no security).
            session_timeout_ms: Session timeout in milliseconds.
            request_timeout_ms: Per-request timeout in milliseconds.
            reconnect_interval_ms: Initial reconnect delay (doubles with backoff).
            max_reconnect_attempts: Max reconnection attempts (0 = unlimited).

        Raises:
            ConfigurationError: If the endpoint URL is invalid.
        """
        # Normalize endpoint to model
        if isinstance(endpoint, str):
            if not endpoint.startswith("opc.tcp://"):
                raise ConfigurationError(
                    f"OPC-UA endpoint must start with 'opc.tcp://', "
                    f"got: {endpoint!r}"
                )
            self._endpoint = OpcUaEndpoint(
                url=endpoint,
                name=name,
                session_timeout_ms=session_timeout_ms,
                request_timeout_ms=request_timeout_ms,
                reconnect_interval_ms=reconnect_interval_ms,
                max_reconnect_attempts=max_reconnect_attempts,
            )
        else:
            self._endpoint = endpoint

        self._name = name or self._endpoint.name or self._endpoint.url
        self._security = security or SecurityConfig.no_security()

        # Connection state
        self._state = ConnectionState.DISCONNECTED
        self._connected_since: datetime | None = None
        self._last_data_received: datetime | None = None
        self._reconnect_count = 0
        self._consecutive_failures = 0
        self._latency_ms: float | None = None

        # Subscription management (Forge-level tracking)
        self._subscriptions: dict[int, Subscription] = {}
        self._callbacks: dict[int, SubscriptionCallback] = {}
        self._ua_subscriptions: dict[int, Any] = {}  # asyncua Subscription objects
        self._next_sub_id = 1

        # Background tasks
        self._reconnect_task: asyncio.Task | None = None
        self._subscription_tasks: dict[int, asyncio.Task] = {}

        # asyncua client — the actual transport
        self._ua_client: UaClient | None = None

        logger.info(
            "OpcUaClient created: name=%s endpoint=%s security=%s",
            self._name,
            self._endpoint.url,
            self._security.policy.value,
        )

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def name(self) -> str:
        """Human-readable connection name."""
        return self._name

    @property
    def endpoint(self) -> OpcUaEndpoint:
        """The OPC-UA endpoint configuration."""
        return self._endpoint

    @property
    def state(self) -> ConnectionState:
        """Current connection state."""
        return self._state

    @property
    def is_connected(self) -> bool:
        """Whether the client has an active session."""
        return self._state == ConnectionState.CONNECTED

    @property
    def security(self) -> SecurityConfig:
        """The security configuration."""
        return self._security

    @property
    def health(self) -> ConnectionHealth:
        """Current connection health snapshot."""
        return ConnectionHealth(
            endpoint_url=self._endpoint.url,
            connection_name=self._name,
            state=self._state,
            connected_since=self._connected_since,
            last_data_received=self._last_data_received,
            reconnect_count=self._reconnect_count,
            consecutive_failures=self._consecutive_failures,
            active_subscriptions=len(self._subscriptions),
            monitored_items_count=sum(
                s.node_count for s in self._subscriptions.values()
            ),
            latency_ms=self._latency_ms,
        )

    # ------------------------------------------------------------------
    # Async context manager
    # ------------------------------------------------------------------

    async def __aenter__(self) -> OpcUaClient:
        """Connect to the OPC-UA server."""
        await self.connect()
        return self

    async def __aexit__(self, exc_type: type | None, *_: Any) -> None:
        """Disconnect and clean up resources."""
        await self.disconnect()

    # ------------------------------------------------------------------
    # Connection lifecycle
    # ------------------------------------------------------------------

    async def connect(self) -> None:
        """Establish connection to the OPC-UA server.

        This performs the full connection sequence via asyncua:
            1. Create asyncua Client with configured URL
            2. Apply security settings (if non-None policy)
            3. Set session timeout
            4. Connect (TCP + OpenSecureChannel + CreateSession + ActivateSession)

        Raises:
            ConnectionError: If the connection cannot be established.
            SecurityNegotiationError: If TLS/cert negotiation fails.
            TimeoutError: If connection exceeds the session timeout.
        """
        self._transition_state(ConnectionState.CONNECTING)

        try:
            logger.info(
                "Connecting to %s (%s)...",
                self._endpoint.url,
                self._security.policy.value,
            )

            url = self._endpoint.url
            if not url.startswith("opc.tcp://"):
                raise EndpointUnreachable(
                    f"Invalid OPC-UA URL scheme: {url}",
                    endpoint_url=url,
                )

            # Create the asyncua client
            self._ua_client = UaClient(url=url, timeout=self._endpoint.request_timeout_ms / 1000.0)
            self._ua_client.session_timeout = self._endpoint.session_timeout_ms

            # Apply security configuration
            sec_string = _build_security_string(self._security)
            if sec_string:
                await self._ua_client.set_security_string(sec_string)

            # Connect — this does TCP + secure channel + session
            t0 = time.monotonic()
            await self._ua_client.connect()
            self._latency_ms = (time.monotonic() - t0) * 1000.0

            # Mark connected
            self._transition_state(ConnectionState.CONNECTED)
            self._connected_since = datetime.now(timezone.utc)
            self._consecutive_failures = 0

            logger.info(
                "Connected to %s (latency=%.1fms, session timeout=%dms)",
                self._endpoint.url,
                self._latency_ms,
                self._endpoint.session_timeout_ms,
            )

        except OpcUaError:
            self._consecutive_failures += 1
            self._transition_state(ConnectionState.FAILED)
            self._ua_client = None
            raise
        except (OSError, asyncio.TimeoutError, ConnectionRefusedError) as exc:
            self._consecutive_failures += 1
            self._transition_state(ConnectionState.FAILED)
            self._ua_client = None
            raise EndpointUnreachable(
                f"Cannot reach {self._endpoint.url}: {exc}",
                endpoint_url=self._endpoint.url,
            ) from exc
        except Exception as exc:
            self._consecutive_failures += 1
            self._transition_state(ConnectionState.FAILED)
            self._ua_client = None
            # Check for security-related failures
            exc_str = str(exc).lower()
            if "security" in exc_str or "certificate" in exc_str or "policy" in exc_str:
                raise SecurityNegotiationError(
                    f"Security negotiation failed for {self._endpoint.url}: {exc}",
                    endpoint_url=self._endpoint.url,
                ) from exc
            raise ConnectionError(
                f"Unexpected error connecting to {self._endpoint.url}: {exc}",
                endpoint_url=self._endpoint.url,
            ) from exc

    async def disconnect(self) -> None:
        """Gracefully disconnect from the OPC-UA server.

        Cancels all background tasks (reconnect, subscriptions),
        deletes asyncua subscriptions, closes the session, and
        releases the transport.
        """
        logger.info("Disconnecting from %s...", self._endpoint.url)

        # Cancel reconnect task
        if self._reconnect_task and not self._reconnect_task.done():
            self._reconnect_task.cancel()
            try:
                await self._reconnect_task
            except asyncio.CancelledError:
                pass
            self._reconnect_task = None

        # Cancel subscription tasks
        for task in self._subscription_tasks.values():
            if not task.done():
                task.cancel()
        if self._subscription_tasks:
            await asyncio.gather(
                *self._subscription_tasks.values(),
                return_exceptions=True,
            )
        self._subscription_tasks.clear()

        # Delete asyncua subscriptions
        for ua_sub in self._ua_subscriptions.values():
            try:
                await ua_sub.delete()
            except Exception:
                pass  # Best-effort cleanup during disconnect
        self._ua_subscriptions.clear()
        self._subscriptions.clear()
        self._callbacks.clear()

        # Disconnect asyncua client
        if self._ua_client is not None:
            try:
                await self._ua_client.disconnect()
            except Exception:
                pass  # Best-effort cleanup
            self._ua_client = None

        # Update state
        self._transition_state(ConnectionState.DISCONNECTED)
        self._connected_since = None

        logger.info("Disconnected from %s", self._endpoint.url)

    # ------------------------------------------------------------------
    # OPC-UA services
    # ------------------------------------------------------------------

    async def browse(
        self,
        node_id: str | NodeId = "i=85",
        *,
        max_results: int = 0,
        node_class_filter: NodeClass | None = None,
    ) -> list[BrowseResult]:
        """Browse child nodes of the specified node.

        The default starting node (i=85) is the OPC-UA Objects folder,
        which is the root of the PLC's exposed address space.

        Uses asyncua's ``Node.get_children()`` and reads attributes
        (BrowseName, NodeClass, DataType, AccessLevel) for each child.

        Args:
            node_id: Starting node to browse from (string or NodeId).
            max_results: Maximum results to return (0 = unlimited).
            node_class_filter: Optional filter for node class (e.g., VARIABLE only).

        Returns:
            List of BrowseResult for each child node.

        Raises:
            BrowseError: If the browse service fails.
            ConnectionError: If not connected.
            TimeoutError: If the operation times out.
        """
        self._ensure_connected("browse")
        parsed = self._parse_node_id(node_id)

        logger.debug(
            "Browse: node=%s max_results=%d filter=%s",
            parsed,
            max_results,
            node_class_filter,
        )

        try:
            ua_node = self._ua_client.get_node(_forge_node_id_to_ua(parsed))
            children = await ua_node.get_children()

            results: list[BrowseResult] = []
            for child in children:
                try:
                    browse_name = await child.read_browse_name()
                    node_class_val = await child.read_node_class()

                    # Map asyncua NodeClass to Forge NodeClass
                    forge_nc = _UA_NODE_CLASS_MAP.get(
                        node_class_val, NodeClass.OBJECT
                    )

                    # Apply node class filter
                    if node_class_filter and forge_nc != node_class_filter:
                        continue

                    # Read data type and access level for Variable nodes
                    forge_dt: DataType | None = None
                    access_level_int = int(AccessLevel.CURRENT_READ)
                    has_children = False

                    if node_class_val == ua.NodeClass.Variable:
                        try:
                            dt_node_id = await child.read_data_type()
                            # Convert data type NodeId to name (best effort)
                            try:
                                dt_node = self._ua_client.get_node(dt_node_id)
                                dt_name = await dt_node.read_browse_name()
                                # Try to map the name to our DataType enum
                                for fdt in DataType:
                                    if fdt.value.lower() == dt_name.Name.lower():
                                        forge_dt = fdt
                                        break
                                if forge_dt is None:
                                    forge_dt = DataType.VARIANT
                            except Exception:
                                forge_dt = DataType.VARIANT
                        except Exception:
                            forge_dt = DataType.VARIANT

                        try:
                            al_val = await child.read_attribute(
                                ua.AttributeIds.AccessLevel
                            )
                            access_level_int = int(al_val.Value.Value or 1)
                        except Exception:
                            access_level_int = int(AccessLevel.CURRENT_READ)
                    else:
                        # Non-variable nodes: check for children
                        try:
                            sub_children = await child.get_children()
                            has_children = len(sub_children) > 0
                        except Exception:
                            has_children = False

                    # Read display name
                    try:
                        display_name = await child.read_display_name()
                        display_str = display_name.Text or browse_name.Name
                    except Exception:
                        display_str = browse_name.Name

                    results.append(
                        BrowseResult(
                            node_id=_convert_node_id(child.nodeid),
                            browse_name=browse_name.Name,
                            display_name=display_str,
                            node_class=forge_nc,
                            data_type=forge_dt,
                            access_level=access_level_int,
                            has_children=has_children,
                        )
                    )

                    if max_results > 0 and len(results) >= max_results:
                        break

                except Exception as child_exc:
                    logger.warning(
                        "Failed to read attributes for child %s: %s",
                        child.nodeid,
                        child_exc,
                    )
                    continue

            logger.debug("Browse returned %d results", len(results))
            return results

        except OpcUaError:
            raise
        except asyncio.TimeoutError as exc:
            raise TimeoutError(
                f"Browse timed out for node {parsed}",
                timeout_ms=self._endpoint.request_timeout_ms,
                operation="browse",
            ) from exc
        except Exception as exc:
            raise BrowseError(
                f"Browse failed for node {parsed}: {exc}",
                node_id=str(parsed),
            ) from exc

    async def read(
        self,
        node_ids: list[str | NodeId],
        *,
        max_age_ms: float = 0,
    ) -> list[DataValue]:
        """Read current values from one or more nodes.

        Uses asyncua's ``Node.read_data_value()`` which returns the full
        DataValue including value, timestamps, and StatusCode.

        Args:
            node_ids: List of node IDs to read.
            max_age_ms: Maximum acceptable age for cached values (0 = fresh read).

        Returns:
            List of DataValue in the same order as node_ids.

        Raises:
            ReadError: If any read fails (partial failures included).
            ConnectionError: If not connected.
            TimeoutError: If the operation times out.
        """
        self._ensure_connected("read")

        if not node_ids:
            return []

        parsed = [self._parse_node_id(nid) for nid in node_ids]
        logger.debug("Read: %d nodes, max_age=%dms", len(parsed), max_age_ms)

        try:
            t0 = time.monotonic()
            results: list[DataValue] = []

            for forge_nid in parsed:
                ua_node = self._ua_client.get_node(_forge_node_id_to_ua(forge_nid))
                try:
                    ua_dv = await ua_node.read_data_value()
                    results.append(_convert_data_value(ua_dv))
                except ua.UaStatusCodeError as exc:
                    raise ReadError(
                        f"Read failed for {forge_nid}: {exc}",
                        status_code=exc.code if hasattr(exc, "code") else 0,
                        node_id=str(forge_nid),
                    ) from exc

            elapsed_ms = (time.monotonic() - t0) * 1000.0
            self._latency_ms = elapsed_ms
            self._last_data_received = datetime.now(timezone.utc)

            logger.debug(
                "Read completed: %d values in %.1fms", len(results), elapsed_ms
            )
            return results

        except OpcUaError:
            raise
        except asyncio.TimeoutError as exc:
            raise TimeoutError(
                f"Read timed out for {len(parsed)} nodes",
                timeout_ms=self._endpoint.request_timeout_ms,
                operation="read",
            ) from exc
        except Exception as exc:
            raise ReadError(
                f"Read failed: {exc}",
            ) from exc

    async def write(
        self,
        node_id: str | NodeId,
        value: Any,
        *,
        data_type: DataType | None = None,
    ) -> None:
        """Write a value to a single node.

        For safety, writes are single-node only.  Batch writes
        should go through the control module's write interface
        which enforces safety interlocks.

        Uses asyncua's ``Node.write_value()`` with optional explicit
        VariantType for type coercion.

        Args:
            node_id: Target node to write to.
            value: Value to write (will be coerced to the node's data type).
            data_type: Optional explicit data type hint for coercion.

        Raises:
            WriteError: If the write is rejected (wrong type, read-only, etc.).
            ConnectionError: If not connected.
            TimeoutError: If the operation times out.
        """
        self._ensure_connected("write")
        parsed = self._parse_node_id(node_id)

        logger.debug(
            "Write: node=%s value=%r type=%s",
            parsed,
            value,
            data_type,
        )

        try:
            ua_node = self._ua_client.get_node(_forge_node_id_to_ua(parsed))

            # If explicit data type given, map to asyncua VariantType
            if data_type and data_type in _FORGE_TO_UA_VARIANT:
                variant_type = _FORGE_TO_UA_VARIANT[data_type]
                await ua_node.write_value(value, varianttype=variant_type)
            else:
                # Let asyncua auto-detect the type
                await ua_node.write_value(value)

            logger.debug("Write succeeded: node=%s", parsed)

        except ua.UaStatusCodeError as exc:
            raise WriteError(
                f"Write rejected for {parsed}: {exc}",
                status_code=exc.code if hasattr(exc, "code") else 0,
                node_id=str(parsed),
            ) from exc
        except OpcUaError:
            raise
        except asyncio.TimeoutError as exc:
            raise TimeoutError(
                f"Write timed out for {parsed}",
                timeout_ms=self._endpoint.request_timeout_ms,
                operation="write",
            ) from exc
        except Exception as exc:
            raise WriteError(
                f"Write failed for {parsed}: {exc}",
                node_id=str(parsed),
            ) from exc

    async def subscribe(
        self,
        node_ids: list[str | NodeId],
        callback: SubscriptionCallback,
        *,
        interval_ms: float = 500.0,
        queue_size: int = 10,
    ) -> int:
        """Create a subscription for value-change notifications.

        Uses asyncua's ``Client.create_subscription()`` and
        ``Subscription.subscribe_data_change()`` with a bridge handler
        that converts asyncua types to Forge DataValues.

        Args:
            node_ids: Nodes to monitor for changes.
            callback: Function called with (node_id_str, DataValue) on change.
            interval_ms: Publishing interval in milliseconds.
            queue_size: Server-side buffer size per monitored item.

        Returns:
            Subscription ID (used to unsubscribe later).

        Raises:
            SubscriptionError: If the subscription cannot be created.
            ConnectionError: If not connected.
        """
        self._ensure_connected("subscribe")

        if not node_ids:
            raise SubscriptionError("Cannot create subscription with no nodes")

        parsed = [self._parse_node_id(nid) for nid in node_ids]

        # Allocate local subscription ID
        sub_id = self._next_sub_id
        self._next_sub_id += 1

        try:
            # Create asyncua subscription with bridge handler
            handler = _ForgeSubHandler(callback, self)
            ua_sub = await self._ua_client.create_subscription(
                interval_ms, handler
            )

            # Subscribe to data changes on all nodes
            ua_nodes = [
                self._ua_client.get_node(_forge_node_id_to_ua(nid))
                for nid in parsed
            ]
            await ua_sub.subscribe_data_change(
                ua_nodes, queuesize=queue_size
            )

            # Build monitored items for Forge tracking
            monitored = [
                MonitoredItem(
                    item_id=i,
                    node_id=nid,
                    sampling_interval_ms=interval_ms,
                    queue_size=queue_size,
                )
                for i, nid in enumerate(parsed)
            ]

            subscription = Subscription(
                subscription_id=sub_id,
                publishing_interval_ms=interval_ms,
                monitored_items=monitored,
                is_active=True,
            )

            self._subscriptions[sub_id] = subscription
            self._callbacks[sub_id] = callback
            self._ua_subscriptions[sub_id] = ua_sub

            logger.info(
                "Subscription %d created: %d items, interval=%dms",
                sub_id,
                len(monitored),
                interval_ms,
            )

            return sub_id

        except OpcUaError:
            raise
        except Exception as exc:
            raise CreateSubscriptionError(
                f"Failed to create subscription: {exc}",
            ) from exc

    async def unsubscribe(self, subscription_id: int) -> None:
        """Remove a subscription and stop receiving notifications.

        Deletes the asyncua subscription on the server and cleans
        up all local tracking state.

        Args:
            subscription_id: The ID returned by subscribe().

        Raises:
            SubscriptionError: If the subscription ID is not found.
        """
        if subscription_id not in self._subscriptions:
            raise SubscriptionError(
                f"Unknown subscription ID: {subscription_id}",
                subscription_id=subscription_id,
            )

        # Delete asyncua subscription
        if subscription_id in self._ua_subscriptions:
            ua_sub = self._ua_subscriptions.pop(subscription_id)
            try:
                await ua_sub.delete()
            except Exception:
                pass  # Best-effort cleanup

        # Cancel background task if running
        if subscription_id in self._subscription_tasks:
            task = self._subscription_tasks.pop(subscription_id)
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

        sub = self._subscriptions.pop(subscription_id)
        self._callbacks.pop(subscription_id, None)

        logger.info(
            "Subscription %d removed (%d items)",
            subscription_id,
            sub.node_count,
        )

    async def history_read(
        self,
        node_id: str | NodeId,
        *,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        max_values: int = 1000,
    ) -> list[DataValue]:
        """Read historical values for a node (if supported by the server).

        Uses asyncua's ``Node.read_raw_history()`` method.

        Note: Allen-Bradley ControlLogix PLCs do NOT natively support
        HistoryRead.  This method is provided for completeness and will
        work against OPC-UA servers that have a historian module
        (e.g., Ignition, KEPServerEX, or NextTrend with OPC-UA HA).

        Args:
            node_id: Node to read history for.
            start_time: Start of the time range (default: 1 hour ago).
            end_time: End of the time range (default: now).
            max_values: Maximum number of historical values to return.

        Returns:
            List of DataValue ordered by source_timestamp.

        Raises:
            HistoryReadError: If the server doesn't support history.
            ConnectionError: If not connected.
        """
        self._ensure_connected("history_read")
        parsed = self._parse_node_id(node_id)

        now = datetime.now(timezone.utc)
        if end_time is None:
            end_time = now
        if start_time is None:
            start_time = now - timedelta(hours=1)

        logger.debug(
            "HistoryRead: node=%s start=%s end=%s max=%d",
            parsed,
            start_time,
            end_time,
            max_values,
        )

        try:
            ua_node = self._ua_client.get_node(_forge_node_id_to_ua(parsed))

            # asyncua's read_raw_history returns list of ua.DataValue
            history = await ua_node.read_raw_history(
                starttime=start_time,
                endtime=end_time,
                numvalues=max_values,
            )

            results = [_convert_data_value(ua_dv) for ua_dv in history]

            logger.debug(
                "HistoryRead returned %d values for %s", len(results), parsed
            )
            return results

        except ua.UaStatusCodeError as exc:
            raise HistoryReadError(
                f"HistoryRead not supported or failed for {parsed}: {exc}",
                status_code=exc.code if hasattr(exc, "code") else 0,
                node_id=str(parsed),
            ) from exc
        except OpcUaError:
            raise
        except asyncio.TimeoutError as exc:
            raise TimeoutError(
                f"HistoryRead timed out for {parsed}",
                timeout_ms=self._endpoint.request_timeout_ms,
                operation="history_read",
            ) from exc
        except Exception as exc:
            raise HistoryReadError(
                f"HistoryRead failed for {parsed}: {exc}",
                node_id=str(parsed),
            ) from exc

    # ------------------------------------------------------------------
    # Auto-reconnect
    # ------------------------------------------------------------------

    async def _reconnect_loop(self) -> None:
        """Background reconnection with exponential backoff.

        Interval starts at reconnect_interval_ms and doubles each
        attempt, capping at 60 seconds.  Resets to initial interval
        on successful reconnection.
        """
        base_interval = self._endpoint.reconnect_interval_ms / 1000.0
        max_interval = 60.0
        interval = base_interval
        max_attempts = self._endpoint.max_reconnect_attempts

        while True:
            if max_attempts > 0 and self._reconnect_count >= max_attempts:
                logger.error(
                    "Max reconnect attempts (%d) reached for %s",
                    max_attempts,
                    self._endpoint.url,
                )
                self._transition_state(ConnectionState.FAILED)
                return

            logger.info(
                "Reconnecting to %s in %.1fs (attempt %d)...",
                self._endpoint.url,
                interval,
                self._reconnect_count + 1,
            )

            await asyncio.sleep(interval)

            try:
                await self.connect()
                self._reconnect_count += 1
                logger.info(
                    "Reconnected to %s (total reconnects: %d)",
                    self._endpoint.url,
                    self._reconnect_count,
                )
                return

            except (ConnectionError, TimeoutError) as exc:
                self._reconnect_count += 1
                interval = min(interval * 2, max_interval)
                logger.warning(
                    "Reconnect attempt %d failed: %s (next in %.1fs)",
                    self._reconnect_count,
                    exc.message,
                    interval,
                )

            except asyncio.CancelledError:
                logger.info("Reconnect loop cancelled for %s", self._endpoint.url)
                return

    def start_reconnect(self) -> None:
        """Initiate auto-reconnect in the background.

        Called internally when a connection drop is detected.
        Can also be called explicitly to recover from FAILED state.
        """
        if self._state not in (
            ConnectionState.CONNECTED,
            ConnectionState.RECONNECTING,
        ):
            self._transition_state(ConnectionState.RECONNECTING)

        if self._reconnect_task is None or self._reconnect_task.done():
            self._reconnect_task = asyncio.create_task(
                self._reconnect_loop(),
                name=f"opcua-reconnect-{self._name}",
            )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _transition_state(self, new_state: ConnectionState) -> None:
        """Enforce valid state transitions and log changes."""
        if self._state == new_state:
            return

        valid = _VALID_TRANSITIONS.get(self._state, set())
        if new_state not in valid:
            logger.warning(
                "Invalid state transition: %s → %s (allowed: %s)",
                self._state.value,
                new_state.value,
                {s.value for s in valid},
            )
            return

        old = self._state
        self._state = new_state
        logger.info(
            "Connection state: %s → %s (%s)",
            old.value,
            new_state.value,
            self._name,
        )

    def _ensure_connected(self, operation: str) -> None:
        """Raise ConnectionError if not in CONNECTED state."""
        if self._state != ConnectionState.CONNECTED:
            raise ConnectionError(
                f"Cannot {operation}: client is {self._state.value} "
                f"(endpoint: {self._endpoint.url})",
                endpoint_url=self._endpoint.url,
            )

    @staticmethod
    def _parse_node_id(node_id: str | NodeId) -> NodeId:
        """Normalize a node ID argument to a NodeId model."""
        if isinstance(node_id, NodeId):
            return node_id
        return NodeId.parse(node_id)

    def __repr__(self) -> str:
        return (
            f"OpcUaClient(name={self._name!r}, "
            f"endpoint={self._endpoint.url!r}, "
            f"state={self._state.value})"
        )
