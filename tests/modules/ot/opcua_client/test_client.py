"""Tests for OPC-UA client (client.py).

Covers connection lifecycle, state machine, service validation,
subscription management, and health monitoring.

The asyncua Client is mocked for unit tests — we test that our
wrapper correctly delegates to asyncua and converts types.
Integration tests against a real server are in tests/integration/.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from asyncua import ua

from forge.modules.ot.opcua_client.client import (
    OpcUaClient,
    SubscriptionCallback,
    _VALID_TRANSITIONS,
    _build_security_string,
    _convert_data_value,
    _convert_node_id,
    _convert_quality,
    _forge_node_id_to_ua,
)
from forge.modules.ot.opcua_client.exceptions import (
    BrowseError,
    ConfigurationError,
    ConnectionError,
    EndpointUnreachable,
    ReadError,
    SubscriptionError,
    WriteError,
)
from forge.modules.ot.opcua_client.security import (
    MessageSecurityMode,
    SecurityConfig,
    SecurityPolicy,
)
from forge.modules.ot.opcua_client.types import (
    ConnectionState,
    DataType,
    DataValue,
    NodeClass,
    NodeId,
    OpcUaEndpoint,
    QualityCode,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _mock_ua_client() -> AsyncMock:
    """Create a mock asyncua Client for unit testing."""
    mock = AsyncMock()
    mock.connect = AsyncMock()
    mock.disconnect = AsyncMock()
    mock.session_timeout = 60_000
    mock.get_node = MagicMock()  # Returns synchronously
    mock.create_subscription = AsyncMock()
    mock.set_security_string = AsyncMock()
    return mock


@pytest.fixture
def mock_ua_client():
    """Patch asyncua.Client so OpcUaClient doesn't try real connections."""
    with patch("forge.modules.ot.opcua_client.client.UaClient") as mock_cls:
        mock_instance = _mock_ua_client()
        mock_cls.return_value = mock_instance
        yield mock_instance


# ---------------------------------------------------------------------------
# Type converter tests
# ---------------------------------------------------------------------------


class TestTypeConverters:
    """Test asyncua ↔ Forge type conversion functions."""

    def test_convert_node_id_numeric(self) -> None:
        ua_nid = ua.NodeId(85, 0)
        forge_nid = _convert_node_id(ua_nid)
        assert forge_nid.namespace == 0
        assert forge_nid.identifier == 85

    def test_convert_node_id_string(self) -> None:
        ua_nid = ua.NodeId("Fermentation/TIT_2010", 2)
        forge_nid = _convert_node_id(ua_nid)
        assert forge_nid.namespace == 2
        assert forge_nid.identifier == "Fermentation/TIT_2010"

    def test_convert_quality_good(self) -> None:
        sc = ua.StatusCode(0)
        assert _convert_quality(sc) == QualityCode.GOOD

    def test_convert_quality_bad(self) -> None:
        sc = ua.StatusCode(0x80000000)
        assert _convert_quality(sc) == QualityCode.BAD

    def test_convert_quality_uncertain(self) -> None:
        sc = ua.StatusCode(0x40000000)
        assert _convert_quality(sc) == QualityCode.UNCERTAIN

    def test_convert_data_value(self) -> None:
        now = datetime.now(timezone.utc)
        ua_dv = ua.DataValue(
            Value=ua.Variant(72.5, ua.VariantType.Double),
            StatusCode_=ua.StatusCode(0),
            SourceTimestamp=now,
            ServerTimestamp=now,
        )
        forge_dv = _convert_data_value(ua_dv)
        assert forge_dv.value == 72.5
        assert forge_dv.data_type == DataType.DOUBLE
        assert forge_dv.quality == QualityCode.GOOD
        assert forge_dv.status_code == 0

    def test_convert_data_value_none(self) -> None:
        ua_dv = ua.DataValue(Value=None, StatusCode_=ua.StatusCode(0x80000000))
        forge_dv = _convert_data_value(ua_dv)
        assert forge_dv.value is None
        assert forge_dv.quality == QualityCode.BAD

    def test_forge_node_id_to_ua_numeric(self) -> None:
        forge_nid = NodeId(namespace=0, identifier=85)
        ua_nid = _forge_node_id_to_ua(forge_nid)
        assert ua_nid.NamespaceIndex == 0
        assert ua_nid.Identifier == 85

    def test_forge_node_id_to_ua_string(self) -> None:
        forge_nid = NodeId(namespace=2, identifier="Tag1")
        ua_nid = _forge_node_id_to_ua(forge_nid)
        assert ua_nid.NamespaceIndex == 2
        assert ua_nid.Identifier == "Tag1"


class TestBuildSecurityString:
    """Test _build_security_string() conversion."""

    def test_no_security_returns_none(self) -> None:
        cfg = SecurityConfig.no_security()
        assert _build_security_string(cfg) is None

    def test_basic256_sha256(self, tmp_path) -> None:
        cert = tmp_path / "client.pem"
        cert.write_bytes(b"fake-cert")
        key = tmp_path / "client.key"
        key.write_bytes(b"fake-key")

        cfg = SecurityConfig.basic256_sha256(cert, key)
        result = _build_security_string(cfg)
        assert result is not None
        assert "Basic256Sha256" in result
        assert "SignAndEncrypt" in result
        assert str(cert.resolve()) in result
        assert str(key.resolve()) in result


# ---------------------------------------------------------------------------
# Construction
# ---------------------------------------------------------------------------


class TestClientConstruction:
    """OpcUaClient initialization and validation."""

    def test_string_endpoint(self) -> None:
        client = OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840", name="plc200")
        assert client.name == "plc200"
        assert client.endpoint.url == "opc.tcp://10.4.2.10:4840"
        assert client.state == ConnectionState.DISCONNECTED

    def test_model_endpoint(self) -> None:
        ep = OpcUaEndpoint(url="opc.tcp://10.4.2.10:4840", name="plc200")
        client = OpcUaClient(endpoint=ep)
        assert client.endpoint is ep

    def test_invalid_url_scheme(self) -> None:
        with pytest.raises(ConfigurationError, match="opc.tcp://"):
            OpcUaClient(endpoint="http://10.4.2.10:4840")

    def test_default_security(self) -> None:
        client = OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840")
        assert client.security.policy.value == "None"

    def test_custom_security(self) -> None:
        sec = SecurityConfig.no_security()
        client = OpcUaClient(
            endpoint="opc.tcp://10.4.2.10:4840", security=sec
        )
        assert client.security is sec

    def test_name_fallback_to_url(self) -> None:
        client = OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840")
        assert "10.4.2.10" in client.name

    def test_repr(self) -> None:
        client = OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840", name="plc1")
        r = repr(client)
        assert "plc1" in r
        assert "DISCONNECTED" in r


# ---------------------------------------------------------------------------
# Connection lifecycle (with mocked asyncua)
# ---------------------------------------------------------------------------


class TestConnectionLifecycle:
    """Connect, disconnect, and async context manager."""

    @pytest.mark.asyncio
    async def test_connect(self, mock_ua_client) -> None:
        client = OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840")
        await client.connect()
        assert client.is_connected
        assert client.state == ConnectionState.CONNECTED
        mock_ua_client.connect.assert_awaited_once()
        await client.disconnect()

    @pytest.mark.asyncio
    async def test_disconnect(self, mock_ua_client) -> None:
        client = OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840")
        await client.connect()
        await client.disconnect()
        assert client.state == ConnectionState.DISCONNECTED
        assert not client.is_connected
        mock_ua_client.disconnect.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_context_manager(self, mock_ua_client) -> None:
        async with OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840") as client:
            assert client.is_connected
        assert client.state == ConnectionState.DISCONNECTED

    @pytest.mark.asyncio
    async def test_connect_measures_latency(self, mock_ua_client) -> None:
        async with OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840") as client:
            assert client.health.latency_ms is not None
            assert client.health.latency_ms >= 0

    @pytest.mark.asyncio
    async def test_connect_failure_sets_failed_state(self, mock_ua_client) -> None:
        mock_ua_client.connect.side_effect = OSError("Connection refused")
        client = OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840")
        with pytest.raises(EndpointUnreachable, match="Connection refused"):
            await client.connect()
        assert client.state == ConnectionState.FAILED
        assert client.health.consecutive_failures == 1


# ---------------------------------------------------------------------------
# State machine
# ---------------------------------------------------------------------------


class TestStateMachine:
    """Connection state machine transitions."""

    def test_valid_transitions_defined(self) -> None:
        for state in ConnectionState:
            assert state in _VALID_TRANSITIONS

    def test_disconnected_to_connecting(self) -> None:
        client = OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840")
        assert client.state == ConnectionState.DISCONNECTED
        client._transition_state(ConnectionState.CONNECTING)
        assert client.state == ConnectionState.CONNECTING

    def test_invalid_transition_ignored(self) -> None:
        client = OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840")
        client._transition_state(ConnectionState.CONNECTED)
        assert client.state == ConnectionState.DISCONNECTED

    def test_same_state_noop(self) -> None:
        client = OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840")
        client._transition_state(ConnectionState.DISCONNECTED)
        assert client.state == ConnectionState.DISCONNECTED


# ---------------------------------------------------------------------------
# Service methods — guard checks
# ---------------------------------------------------------------------------


class TestServiceGuards:
    """Service methods reject calls when not connected."""

    @pytest.mark.asyncio
    async def test_browse_requires_connection(self) -> None:
        client = OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840")
        with pytest.raises(ConnectionError, match="browse"):
            await client.browse()

    @pytest.mark.asyncio
    async def test_read_requires_connection(self) -> None:
        client = OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840")
        with pytest.raises(ConnectionError, match="read"):
            await client.read(["ns=2;s=Tag1"])

    @pytest.mark.asyncio
    async def test_write_requires_connection(self) -> None:
        client = OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840")
        with pytest.raises(ConnectionError, match="write"):
            await client.write("ns=2;s=Tag1", 42)

    @pytest.mark.asyncio
    async def test_subscribe_requires_connection(self) -> None:
        client = OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840")
        with pytest.raises(ConnectionError, match="subscribe"):
            await client.subscribe(["ns=2;s=Tag1"], lambda n, d: None)

    @pytest.mark.asyncio
    async def test_history_read_requires_connection(self) -> None:
        client = OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840")
        with pytest.raises(ConnectionError, match="history_read"):
            await client.history_read("ns=2;s=Tag1")


# ---------------------------------------------------------------------------
# Service methods — with mocked asyncua
# ---------------------------------------------------------------------------


class TestBrowseService:
    """Browse service with mocked asyncua transport."""

    @pytest.mark.asyncio
    async def test_browse_returns_children(self, mock_ua_client) -> None:
        # Mock child nodes
        child1 = AsyncMock()
        child1.nodeid = ua.NodeId("Tag1", 2)
        child1.read_browse_name.return_value = ua.QualifiedName("Tag1", 2)
        child1.read_node_class.return_value = ua.NodeClass.Variable
        child1.read_display_name.return_value = ua.LocalizedText("Tag1")
        child1.read_data_type.return_value = ua.NodeId(ua.ObjectIds.Double)

        dt_node = AsyncMock()
        dt_node.read_browse_name.return_value = ua.QualifiedName("Double", 0)
        mock_ua_client.get_node.side_effect = lambda nid: (
            dt_node if (hasattr(nid, "Identifier") and nid.Identifier == ua.ObjectIds.Double) else MagicMock()
        )

        child1.read_attribute.return_value = MagicMock(
            Value=MagicMock(Value=3)  # READ | WRITE
        )

        parent_node = AsyncMock()
        parent_node.get_children.return_value = [child1]
        mock_ua_client.get_node.return_value = parent_node
        # Re-set for the data type lookup
        mock_ua_client.get_node.side_effect = None
        mock_ua_client.get_node.return_value = parent_node
        parent_node.get_children.return_value = [child1]

        async with OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840") as client:
            results = await client.browse("ns=2;s=Fermentation")

        assert len(results) == 1
        assert results[0].browse_name == "Tag1"
        assert results[0].node_class == NodeClass.VARIABLE

    @pytest.mark.asyncio
    async def test_browse_empty_node(self, mock_ua_client) -> None:
        parent_node = AsyncMock()
        parent_node.get_children.return_value = []
        mock_ua_client.get_node.return_value = parent_node

        async with OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840") as client:
            results = await client.browse()

        assert results == []


class TestReadService:
    """Read service with mocked asyncua transport."""

    @pytest.mark.asyncio
    async def test_read_single_value(self, mock_ua_client) -> None:
        now = datetime.now(timezone.utc)
        mock_node = AsyncMock()
        mock_node.read_data_value.return_value = ua.DataValue(
            Value=ua.Variant(72.5, ua.VariantType.Double),
            StatusCode_=ua.StatusCode(0),
            SourceTimestamp=now,
            ServerTimestamp=now,
        )
        mock_ua_client.get_node.return_value = mock_node

        async with OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840") as client:
            results = await client.read(["ns=2;s=TIT_2010"])

        assert len(results) == 1
        assert results[0].value == 72.5
        assert results[0].data_type == DataType.DOUBLE
        assert results[0].quality == QualityCode.GOOD

    @pytest.mark.asyncio
    async def test_read_empty_list(self, mock_ua_client) -> None:
        async with OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840") as client:
            results = await client.read([])
        assert results == []

    @pytest.mark.asyncio
    async def test_read_status_code_error(self, mock_ua_client) -> None:
        mock_node = AsyncMock()
        mock_node.read_data_value.side_effect = ua.UaStatusCodeError(0x80000000)
        mock_ua_client.get_node.return_value = mock_node

        async with OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840") as client:
            with pytest.raises(ReadError):
                await client.read(["ns=2;s=BadTag"])


class TestWriteService:
    """Write service with mocked asyncua transport."""

    @pytest.mark.asyncio
    async def test_write_auto_type(self, mock_ua_client) -> None:
        mock_node = AsyncMock()
        mock_ua_client.get_node.return_value = mock_node

        async with OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840") as client:
            await client.write("ns=2;s=TIT_2010", 42.5)

        mock_node.write_value.assert_awaited_once_with(42.5)

    @pytest.mark.asyncio
    async def test_write_explicit_type(self, mock_ua_client) -> None:
        mock_node = AsyncMock()
        mock_ua_client.get_node.return_value = mock_node

        async with OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840") as client:
            await client.write("ns=2;s=Counter", 42, data_type=DataType.INT32)

        mock_node.write_value.assert_awaited_once_with(
            42, varianttype=ua.VariantType.Int32
        )

    @pytest.mark.asyncio
    async def test_write_rejected(self, mock_ua_client) -> None:
        mock_node = AsyncMock()
        mock_node.write_value.side_effect = ua.UaStatusCodeError(0x80000000)
        mock_ua_client.get_node.return_value = mock_node

        async with OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840") as client:
            with pytest.raises(WriteError):
                await client.write("ns=2;s=ReadOnly", 99)


class TestSubscribeService:
    """Subscribe service with mocked asyncua transport."""

    @pytest.mark.asyncio
    async def test_subscribe_creates_asyncua_subscription(self, mock_ua_client) -> None:
        mock_sub = AsyncMock()
        mock_sub.subscribe_data_change = AsyncMock(return_value=[1, 2])
        mock_sub.delete = AsyncMock()
        mock_ua_client.create_subscription.return_value = mock_sub
        mock_ua_client.get_node.return_value = MagicMock()

        async with OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840") as client:
            sub_id = await client.subscribe(
                ["ns=2;s=Tag1", "ns=2;s=Tag2"],
                callback=lambda nid, dv: None,
                interval_ms=250.0,
            )

        assert isinstance(sub_id, int)
        assert sub_id >= 1
        mock_ua_client.create_subscription.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_subscribe_empty_nodes_rejected(self, mock_ua_client) -> None:
        async with OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840") as client:
            with pytest.raises(SubscriptionError, match="no nodes"):
                await client.subscribe([], lambda n, d: None)

    @pytest.mark.asyncio
    async def test_unsubscribe_deletes_asyncua_sub(self, mock_ua_client) -> None:
        mock_sub = AsyncMock()
        mock_sub.subscribe_data_change = AsyncMock(return_value=[1])
        mock_sub.delete = AsyncMock()
        mock_ua_client.create_subscription.return_value = mock_sub
        mock_ua_client.get_node.return_value = MagicMock()

        async with OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840") as client:
            sub_id = await client.subscribe(
                ["ns=2;s=Tag1"], lambda n, d: None
            )
            await client.unsubscribe(sub_id)
            assert client.health.active_subscriptions == 0
            mock_sub.delete.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_unsubscribe_unknown_id(self, mock_ua_client) -> None:
        async with OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840") as client:
            with pytest.raises(SubscriptionError, match="Unknown"):
                await client.unsubscribe(999)


class TestHistoryReadService:
    """HistoryRead service with mocked asyncua transport."""

    @pytest.mark.asyncio
    async def test_history_read_returns_values(self, mock_ua_client) -> None:
        now = datetime.now(timezone.utc)
        mock_node = AsyncMock()
        mock_node.read_raw_history.return_value = [
            ua.DataValue(
                Value=ua.Variant(70.0, ua.VariantType.Double),
                StatusCode_=ua.StatusCode(0),
                SourceTimestamp=now,
                ServerTimestamp=now,
            ),
            ua.DataValue(
                Value=ua.Variant(71.5, ua.VariantType.Double),
                StatusCode_=ua.StatusCode(0),
                SourceTimestamp=now,
                ServerTimestamp=now,
            ),
        ]
        mock_ua_client.get_node.return_value = mock_node

        async with OpcUaClient(endpoint="opc.tcp://10.4.2.10:4840") as client:
            results = await client.history_read("ns=2;s=TIT_2010")

        assert len(results) == 2
        assert results[0].value == 70.0
        assert results[1].value == 71.5


# ---------------------------------------------------------------------------
# Health monitoring
# ---------------------------------------------------------------------------


class TestHealthMonitoring:
    """ConnectionHealth snapshot from client."""

    def test_health_disconnected(self) -> None:
        client = OpcUaClient(
            endpoint="opc.tcp://10.4.2.10:4840", name="plc200"
        )
        health = client.health
        assert health.state == ConnectionState.DISCONNECTED
        assert health.connection_name == "plc200"
        assert health.connected_since is None
        assert health.active_subscriptions == 0

    @pytest.mark.asyncio
    async def test_health_connected(self, mock_ua_client) -> None:
        async with OpcUaClient(
            endpoint="opc.tcp://10.4.2.10:4840", name="plc200"
        ) as client:
            health = client.health
            assert health.state == ConnectionState.CONNECTED
            assert health.connected_since is not None
            assert health.endpoint_url == "opc.tcp://10.4.2.10:4840"


# ---------------------------------------------------------------------------
# NodeId parsing helper
# ---------------------------------------------------------------------------


class TestParseNodeId:
    """Client._parse_node_id static method."""

    def test_string_input(self) -> None:
        nid = OpcUaClient._parse_node_id("ns=2;s=Fermentation/TIT_2010")
        assert nid.namespace == 2
        assert nid.identifier == "Fermentation/TIT_2010"

    def test_model_passthrough(self) -> None:
        original = NodeId(namespace=2, identifier="Tag1")
        result = OpcUaClient._parse_node_id(original)
        assert result is original
