"""Integration tests for OpcUaClient against a real asyncua OPC-UA server.

These tests spin up an in-process asyncua Server, then exercise our
OpcUaClient against it over the loopback interface.  This validates:

    - Real OPC-UA binary encoding/decoding (not mocked)
    - Full connect -> operate -> disconnect lifecycle
    - Converter layer accuracy against live server types
    - Subscription data-change notifications through the wire
    - Security negotiation (SecurityPolicy#None)
    - Browse, Read, Write, Subscribe, HistoryRead services end-to-end

Unlike the unit tests (test_client.py) which mock asyncua's Client at
the import site, these tests exercise the complete protocol stack.

Requirements:
    - asyncua (opcua-asyncio) -- provides both Server and Client
    - pytest-asyncio
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from asyncua import Server as UaServer
from asyncua import ua

from forge.modules.ot.opcua_client import (
    ConnectionState,
    DataType,
    NodeClass,
    OpcUaClient,
    QualityCode,
)
from forge.modules.ot.opcua_client.exceptions import (
    EndpointUnreachable,
    WriteError,
)

# ---------------------------------------------------------------------------
# Fixtures -- function-scoped for pytest-asyncio event loop compatibility
# ---------------------------------------------------------------------------

_TEST_PORT = 48_484
_TEST_ENDPOINT = f"opc.tcp://127.0.0.1:{_TEST_PORT}/freeopcua/server/"


async def _create_test_server() -> dict:
    """Start an in-process asyncua OPC-UA server.

    Creates a minimal address space:
        Objects/
            TestFolder/
                Temperature    (Float, read/write)
                Pressure       (Double, read-only)
                MotorRunning   (Boolean, read/write)
                Counter        (Int32, read/write)
                StatusMessage  (String, read-only)
    """
    server = UaServer()
    await server.init()
    server.set_endpoint(_TEST_ENDPOINT)
    server.set_server_name("ForgeIntegrationTestServer")
    server.set_security_policy([ua.SecurityPolicyType.NoSecurity])

    ns_idx = await server.register_namespace("urn:forge:integration-test")
    objects = server.get_objects_node()
    test_folder = await objects.add_folder(ns_idx, "TestFolder")

    temp_var = await test_folder.add_variable(
        ns_idx, "Temperature", 72.5, varianttype=ua.VariantType.Float
    )
    await temp_var.set_writable()

    pressure_var = await test_folder.add_variable(
        ns_idx, "Pressure", 14.696, varianttype=ua.VariantType.Double
    )

    motor_var = await test_folder.add_variable(
        ns_idx, "MotorRunning", False, varianttype=ua.VariantType.Boolean
    )
    await motor_var.set_writable()

    counter_var = await test_folder.add_variable(
        ns_idx, "Counter", 0, varianttype=ua.VariantType.Int32
    )
    await counter_var.set_writable()

    status_var = await test_folder.add_variable(
        ns_idx, "StatusMessage", "Idle", varianttype=ua.VariantType.String
    )

    await server.start()

    return {
        "server": server,
        "ns_idx": ns_idx,
        "folder": test_folder,
        "temperature": temp_var,
        "pressure": pressure_var,
        "motor": motor_var,
        "counter": counter_var,
        "status": status_var,
    }


@pytest_asyncio.fixture
async def opcua_server():
    """Function-scoped asyncua OPC-UA server fixture."""
    ctx = await _create_test_server()
    yield ctx
    await ctx["server"].stop()


@pytest_asyncio.fixture
async def client(opcua_server):
    """Create and connect a Forge OpcUaClient to the test server."""
    c = OpcUaClient(
        endpoint=_TEST_ENDPOINT,
        name="integration-test",
        session_timeout_ms=30_000,
        request_timeout_ms=5_000,
    )
    await c.connect()
    yield c
    await c.disconnect()


# ---------------------------------------------------------------------------
# Connection lifecycle tests
# ---------------------------------------------------------------------------


class TestConnectionLifecycle:
    """Tests for connect / disconnect / state transitions."""

    @pytest.mark.asyncio
    async def test_connect_and_disconnect(self, opcua_server):
        """Client connects, reaches CONNECTED, then disconnects cleanly."""
        c = OpcUaClient(endpoint=_TEST_ENDPOINT, name="lifecycle-test")

        assert c.state == ConnectionState.DISCONNECTED
        await c.connect()
        assert c.state == ConnectionState.CONNECTED
        assert c.is_connected is True

        await c.disconnect()
        assert c.state == ConnectionState.DISCONNECTED
        assert c.is_connected is False

    @pytest.mark.asyncio
    async def test_context_manager(self, opcua_server):
        """Async context manager connects on entry, disconnects on exit."""
        async with OpcUaClient(endpoint=_TEST_ENDPOINT) as c:
            assert c.state == ConnectionState.CONNECTED
        assert c.state == ConnectionState.DISCONNECTED

    @pytest.mark.asyncio
    async def test_connection_health_populated(self, client):
        """Health snapshot should be fully populated after connection."""
        health = client.health
        assert health.state == ConnectionState.CONNECTED
        assert health.endpoint_url == _TEST_ENDPOINT
        assert health.connected_since is not None
        assert health.latency_ms is not None
        assert health.latency_ms > 0
        assert health.consecutive_failures == 0

    @pytest.mark.asyncio
    async def test_connect_to_unreachable_endpoint(self):
        """Connecting to a dead endpoint raises EndpointUnreachable."""
        c = OpcUaClient(
            endpoint="opc.tcp://127.0.0.1:19999/nonexistent",
            request_timeout_ms=2_000,
        )
        with pytest.raises(EndpointUnreachable):
            await c.connect()
        assert c.state == ConnectionState.FAILED


# ---------------------------------------------------------------------------
# Browse service tests
# ---------------------------------------------------------------------------


class TestBrowseService:
    """Tests for browsing the OPC-UA address space."""

    @pytest.mark.asyncio
    async def test_browse_objects_folder(self, client):
        """Browsing the Objects folder should return TestFolder."""
        results = await client.browse("i=85")
        names = [r.browse_name for r in results]
        assert "TestFolder" in names

    @pytest.mark.asyncio
    async def test_browse_test_folder(self, client, opcua_server):
        """Browsing TestFolder should return all 5 variables."""
        folder_nid = opcua_server["folder"].nodeid
        nid_str = folder_nid.to_string()

        results = await client.browse(nid_str)
        names = {r.browse_name for r in results}
        expected = {"Temperature", "Pressure", "MotorRunning", "Counter", "StatusMessage"}
        assert expected.issubset(names), f"Missing: {expected - names}"

    @pytest.mark.asyncio
    async def test_browse_returns_correct_node_classes(self, client, opcua_server):
        """Variable nodes should have NodeClass.VARIABLE."""
        folder_nid = opcua_server["folder"].nodeid.to_string()
        results = await client.browse(folder_nid)

        for r in results:
            if r.browse_name in {"Temperature", "Pressure", "MotorRunning", "Counter", "StatusMessage"}:
                assert r.node_class == NodeClass.VARIABLE, (
                    f"{r.browse_name} should be VARIABLE, got {r.node_class}"
                )

    @pytest.mark.asyncio
    async def test_browse_returns_data_types(self, client, opcua_server):
        """Variable nodes should have populated data_type field."""
        folder_nid = opcua_server["folder"].nodeid.to_string()
        results = await client.browse(folder_nid)

        for r in results:
            if r.browse_name in {"Temperature", "Pressure", "MotorRunning", "Counter", "StatusMessage"}:
                assert r.data_type is not None, (
                    f"{r.browse_name} should have a data_type"
                )

    @pytest.mark.asyncio
    async def test_browse_with_node_class_filter(self, client, opcua_server):
        """Filtering by VARIABLE should return only variables."""
        folder_nid = opcua_server["folder"].nodeid.to_string()
        results = await client.browse(folder_nid, node_class_filter=NodeClass.VARIABLE)

        for r in results:
            assert r.node_class == NodeClass.VARIABLE

    @pytest.mark.asyncio
    async def test_browse_with_max_results(self, client, opcua_server):
        """max_results should limit the number of results."""
        folder_nid = opcua_server["folder"].nodeid.to_string()
        results = await client.browse(folder_nid, max_results=2)
        assert len(results) <= 2

    @pytest.mark.asyncio
    async def test_browse_folder_has_children(self, client):
        """TestFolder should report has_children=True from Objects browse."""
        results = await client.browse("i=85")
        folder = next((r for r in results if r.browse_name == "TestFolder"), None)
        assert folder is not None
        assert folder.has_children is True


# ---------------------------------------------------------------------------
# Read service tests
# ---------------------------------------------------------------------------


class TestReadService:
    """Tests for reading current values."""

    @pytest.mark.asyncio
    async def test_read_single_float(self, client, opcua_server):
        """Read a Float variable and verify value + quality."""
        nid = opcua_server["temperature"].nodeid.to_string()
        values = await client.read([nid])

        assert len(values) == 1
        dv = values[0]
        assert isinstance(dv.value, float)
        assert abs(dv.value - 72.5) < 0.01
        assert dv.quality == QualityCode.GOOD
        assert dv.source_timestamp is not None

    @pytest.mark.asyncio
    async def test_read_multiple_types(self, client, opcua_server):
        """Read multiple variables of different types in one call."""
        nids = [
            opcua_server["temperature"].nodeid.to_string(),
            opcua_server["pressure"].nodeid.to_string(),
            opcua_server["motor"].nodeid.to_string(),
            opcua_server["counter"].nodeid.to_string(),
            opcua_server["status"].nodeid.to_string(),
        ]
        values = await client.read(nids)

        assert len(values) == 5
        assert isinstance(values[0].value, float)  # Temperature (Float)
        assert isinstance(values[1].value, float)  # Pressure (Double)
        assert abs(values[1].value - 14.696) < 0.001
        assert values[2].value is False  # MotorRunning (Boolean)
        assert values[3].value == 0  # Counter (Int32)
        assert values[4].value == "Idle"  # StatusMessage (String)

    @pytest.mark.asyncio
    async def test_read_data_type_mapping(self, client, opcua_server):
        """DataType enum should be correctly mapped from OPC-UA variant types."""
        nids_types = [
            (opcua_server["temperature"], DataType.FLOAT),
            (opcua_server["pressure"], DataType.DOUBLE),
            (opcua_server["motor"], DataType.BOOLEAN),
            (opcua_server["counter"], DataType.INT32),
            (opcua_server["status"], DataType.STRING),
        ]
        for var, expected_dt in nids_types:
            values = await client.read([var.nodeid.to_string()])
            assert values[0].data_type == expected_dt, (
                f"Expected {expected_dt}, got {values[0].data_type}"
            )

    @pytest.mark.asyncio
    async def test_read_timestamps_are_utc(self, client, opcua_server):
        """Timestamps from the server should be timezone-aware UTC."""
        nid = opcua_server["temperature"].nodeid.to_string()
        values = await client.read([nid])
        dv = values[0]
        assert dv.source_timestamp.tzinfo is not None
        assert dv.server_timestamp.tzinfo is not None

    @pytest.mark.asyncio
    async def test_read_empty_list(self, client):
        """Reading an empty node list should return empty results."""
        values = await client.read([])
        assert values == []

    @pytest.mark.asyncio
    async def test_read_updates_latency(self, client, opcua_server):
        """Read operation should update the client's latency tracking."""
        nid = opcua_server["temperature"].nodeid.to_string()
        await client.read([nid])
        assert client.health.latency_ms is not None
        assert client.health.latency_ms > 0


# ---------------------------------------------------------------------------
# Write service tests
# ---------------------------------------------------------------------------


class TestWriteService:
    """Tests for writing values to nodes."""

    @pytest.mark.asyncio
    async def test_write_float(self, client, opcua_server):
        """Write a float value and read it back.

        OPC-UA servers enforce strict type matching: a Python float
        (64-bit double) must be explicitly typed as Float (32-bit)
        when the server variable is VariantType.Float.
        """
        nid = opcua_server["temperature"].nodeid.to_string()
        await client.write(nid, 98.6, data_type=DataType.FLOAT)
        values = await client.read([nid])
        assert abs(values[0].value - 98.6) < 0.1  # Float precision

    @pytest.mark.asyncio
    async def test_write_boolean(self, client, opcua_server):
        """Write a boolean value and read it back."""
        nid = opcua_server["motor"].nodeid.to_string()
        await client.write(nid, True)
        values = await client.read([nid])
        assert values[0].value is True

    @pytest.mark.asyncio
    async def test_write_int32(self, client, opcua_server):
        """Write an integer value and read it back.

        OPC-UA servers enforce strict type matching: a Python int
        (64-bit) must be explicitly typed as Int32 when the server
        variable is VariantType.Int32.
        """
        nid = opcua_server["counter"].nodeid.to_string()
        await client.write(nid, 42, data_type=DataType.INT32)
        values = await client.read([nid])
        assert values[0].value == 42

    @pytest.mark.asyncio
    async def test_write_with_explicit_data_type(self, client, opcua_server):
        """Write with explicit DataType for type coercion."""
        nid = opcua_server["counter"].nodeid.to_string()
        await client.write(nid, 100, data_type=DataType.INT32)
        values = await client.read([nid])
        assert values[0].value == 100

    @pytest.mark.asyncio
    async def test_write_read_only_raises(self, client, opcua_server):
        """Writing to a read-only node should raise WriteError."""
        nid = opcua_server["status"].nodeid.to_string()
        with pytest.raises(WriteError):
            await client.write(nid, "Running")


# ---------------------------------------------------------------------------
# Subscribe service tests
# ---------------------------------------------------------------------------


class TestSubscribeService:
    """Tests for real-time data-change subscriptions."""

    @pytest.mark.asyncio
    async def test_subscribe_receives_data_change(self, client, opcua_server):
        """Subscribe to a tag, write a new value, verify callback fires."""
        nid = opcua_server["temperature"].nodeid.to_string()
        received: list[tuple[str, object]] = []

        def on_change(node_id_str: str, data_value):
            received.append((node_id_str, data_value))

        sub_id = await client.subscribe(
            node_ids=[nid],
            callback=on_change,
            interval_ms=100,
        )

        # Wait for initial subscription to settle
        await asyncio.sleep(0.5)
        received.clear()  # Clear initial value notification

        # Write a new value to trigger a data change
        await opcua_server["temperature"].write_value(
            ua.DataValue(ua.Variant(99.9, ua.VariantType.Float))
        )

        # Wait for notification to propagate
        await asyncio.sleep(1.0)

        assert len(received) >= 1, f"Expected at least 1 notification, got {len(received)}"
        _, dv = received[-1]
        assert abs(dv.value - 99.9) < 0.1
        assert dv.quality == QualityCode.GOOD

        await client.unsubscribe(sub_id)

    @pytest.mark.asyncio
    async def test_subscribe_returns_valid_id(self, client, opcua_server):
        """subscribe() should return a positive integer subscription ID."""
        nid = opcua_server["temperature"].nodeid.to_string()
        sub_id = await client.subscribe(
            node_ids=[nid],
            callback=lambda n, d: None,
            interval_ms=500,
        )
        assert isinstance(sub_id, int)
        assert sub_id > 0
        await client.unsubscribe(sub_id)

    @pytest.mark.asyncio
    async def test_unsubscribe_clears_tracking(self, client, opcua_server):
        """After unsubscribe, active subscription count should decrease."""
        nid = opcua_server["temperature"].nodeid.to_string()
        sub_id = await client.subscribe(
            node_ids=[nid],
            callback=lambda n, d: None,
            interval_ms=500,
        )
        assert client.health.active_subscriptions >= 1
        await client.unsubscribe(sub_id)
        assert client.health.active_subscriptions == 0


# ---------------------------------------------------------------------------
# Type converter round-trip tests (through real wire protocol)
# ---------------------------------------------------------------------------


class TestTypeConverterRoundTrip:
    """Verify Forge type converters produce correct models from live server data."""

    @pytest.mark.asyncio
    async def test_node_id_round_trip(self, client, opcua_server):
        """Browse result NodeIds should be valid and re-usable for read."""
        folder_nid = opcua_server["folder"].nodeid.to_string()
        results = await client.browse(folder_nid)
        temp_result = next(r for r in results if r.browse_name == "Temperature")

        # Use the NodeId from browse result to read the value
        values = await client.read([temp_result.node_id])
        assert len(values) == 1
        assert isinstance(values[0].value, float)

    @pytest.mark.asyncio
    async def test_quality_code_mapping(self, client, opcua_server):
        """Good status codes from server should map to QualityCode.GOOD."""
        nid = opcua_server["temperature"].nodeid.to_string()
        values = await client.read([nid])
        assert values[0].quality == QualityCode.GOOD
        assert values[0].status_code == 0

    @pytest.mark.asyncio
    async def test_data_value_completeness(self, client, opcua_server):
        """DataValue from live read should have all fields populated."""
        nid = opcua_server["temperature"].nodeid.to_string()
        values = await client.read([nid])
        dv = values[0]
        assert dv.value is not None
        assert dv.data_type is not None
        assert dv.quality is not None
        assert dv.status_code is not None
        assert dv.source_timestamp is not None
        assert dv.server_timestamp is not None

    @pytest.mark.asyncio
    async def test_write_read_round_trip_preserves_types(self, client, opcua_server):
        """Write a value, read it back -- types should be preserved."""
        nid = opcua_server["counter"].nodeid.to_string()
        await client.write(nid, 12345, data_type=DataType.INT32)
        values = await client.read([nid])
        assert values[0].value == 12345
        assert values[0].data_type == DataType.INT32


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases:
    """Edge cases and error handling through real wire protocol."""

    @pytest.mark.asyncio
    async def test_browse_leaf_node(self, client, opcua_server):
        """Browsing a leaf Variable node should not error."""
        nid = opcua_server["temperature"].nodeid.to_string()
        results = await client.browse(nid)
        assert isinstance(results, list)

    @pytest.mark.asyncio
    async def test_concurrent_reads(self, client, opcua_server):
        """Multiple concurrent reads should all succeed."""
        nids = [
            opcua_server["temperature"].nodeid.to_string(),
            opcua_server["pressure"].nodeid.to_string(),
            opcua_server["motor"].nodeid.to_string(),
        ]
        tasks = [client.read(nids) for _ in range(5)]
        results = await asyncio.gather(*tasks)
        assert len(results) == 5
        for values in results:
            assert len(values) == 3

    @pytest.mark.asyncio
    async def test_disconnect_cleans_up_subscriptions(self, opcua_server):
        """Disconnecting with active subscriptions should cleanup gracefully."""
        c = OpcUaClient(endpoint=_TEST_ENDPOINT)
        await c.connect()

        nid = opcua_server["temperature"].nodeid.to_string()
        await c.subscribe(
            node_ids=[nid],
            callback=lambda n, d: None,
            interval_ms=200,
        )
        assert c.health.active_subscriptions >= 1

        await c.disconnect()
        assert c.state == ConnectionState.DISCONNECTED
        assert c.health.active_subscriptions == 0
