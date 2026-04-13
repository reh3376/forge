"""Hardened async Python OPC-UA client library.

Built as a reference-based implementation (opcua-asyncio as design template,
not runtime dependency).  Purpose-built for production SCADA use against
Allen-Bradley ControlLogix L82E/L83E PLCs with v36+ firmware.

Features:
    - Async context manager session lifecycle
    - Browse, Read, Write, Subscribe, HistoryRead services
    - TLS/certificate authentication (SecurityPolicy.Basic256Sha256)
    - Auto-reconnect with exponential backoff and session recovery
    - Connection health monitoring with state machine
    - Strong typing via Pydantic for all OPC-UA data types

Usage::

    async with OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840") as client:
        # Browse address space
        nodes = await client.browse("ns=2;s=Fermentation")

        # Subscribe to tag changes
        sub_id = await client.subscribe(
            node_ids=["ns=2;s=Fermentation/TIT_2010/Out_PV"],
            callback=on_value_change,
            interval_ms=500,
        )

        # Read current values
        values = await client.read(["ns=2;s=Fermentation/TIT_2010/Out_PV"])

        # Write a value (with type validation)
        await client.write("ns=2;s=Fermentation/Motor01/HMI_MO", True)
"""

from forge.modules.ot.opcua_client._compat import patch_asyncua_binary as _patch_asyncua

_patch_asyncua()

from forge.modules.ot.opcua_client.client import OpcUaClient
from forge.modules.ot.opcua_client.paths import NormalizedPath, PathNormalizer
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

__all__ = [
    # Client
    "OpcUaClient",
    # Paths
    "NormalizedPath",
    "PathNormalizer",
    # Types
    "AccessLevel",
    "BrowseResult",
    "ConnectionHealth",
    "ConnectionState",
    "DataType",
    "DataValue",
    "MonitoredItem",
    "NodeClass",
    "NodeId",
    "OpcUaEndpoint",
    "QualityCode",
    "Subscription",
    # Security
    "MessageSecurityMode",
    "SecurityConfig",
    "SecurityPolicy",
    # Exceptions
    "BrowseError",
    "CertificateError",
    "ConfigurationError",
    "ConnectionError",
    "CreateSubscriptionError",
    "EndpointUnreachable",
    "HistoryReadError",
    "MonitoredItemError",
    "OpcUaError",
    "PolicyViolationError",
    "ReadError",
    "SecurityError",
    "SecurityNegotiationError",
    "ServiceError",
    "SessionActivationError",
    "SubscriptionError",
    "TimeoutError",
    "WriteError",
]
