"""Tests for OPC-UA type system (types.py).

Covers all Pydantic models, enumerations, validators, and parsing logic.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

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


# ---------------------------------------------------------------------------
# QualityCode
# ---------------------------------------------------------------------------


class TestQualityCode:
    """QualityCode enum and StatusCode mapping."""

    def test_values(self) -> None:
        assert QualityCode.GOOD.value == "GOOD"
        assert QualityCode.UNCERTAIN.value == "UNCERTAIN"
        assert QualityCode.BAD.value == "BAD"
        assert QualityCode.NOT_AVAILABLE.value == "NOT_AVAILABLE"

    def test_from_status_code_good(self) -> None:
        # Bits 30-31 = 00 → Good
        assert QualityCode.from_status_code(0x00000000) == QualityCode.GOOD
        assert QualityCode.from_status_code(0x00000001) == QualityCode.GOOD

    def test_from_status_code_uncertain(self) -> None:
        # Bits 30-31 = 01 → Uncertain
        assert QualityCode.from_status_code(0x40000000) == QualityCode.UNCERTAIN
        assert QualityCode.from_status_code(0x40000001) == QualityCode.UNCERTAIN

    def test_from_status_code_bad(self) -> None:
        # Bits 30-31 = 10 → Bad
        assert QualityCode.from_status_code(0x80000000) == QualityCode.BAD
        # Bits 30-31 = 11 → also Bad
        assert QualityCode.from_status_code(0xC0000000) == QualityCode.BAD

    def test_from_status_code_none(self) -> None:
        assert QualityCode.from_status_code(None) == QualityCode.NOT_AVAILABLE

    def test_is_string_enum(self) -> None:
        # QualityCode is str enum — usable in JSON serialization
        assert isinstance(QualityCode.GOOD, str)
        assert f"{QualityCode.GOOD}" == "GOOD"


# ---------------------------------------------------------------------------
# DataType
# ---------------------------------------------------------------------------


class TestDataType:
    """DataType enum for CIP types."""

    def test_cip_integer_types(self) -> None:
        assert DataType.SBYTE.value == "SByte"  # CIP SINT
        assert DataType.INT16.value == "Int16"  # CIP INT
        assert DataType.INT32.value == "Int32"  # CIP DINT
        assert DataType.INT64.value == "Int64"  # CIP LINT

    def test_cip_float_types(self) -> None:
        assert DataType.FLOAT.value == "Float"  # CIP REAL
        assert DataType.DOUBLE.value == "Double"  # CIP LREAL

    def test_structural_types(self) -> None:
        assert DataType.EXTENSION_OBJECT.value == "ExtensionObject"
        assert DataType.VARIANT.value == "Variant"


# ---------------------------------------------------------------------------
# AccessLevel
# ---------------------------------------------------------------------------


class TestAccessLevel:
    """AccessLevel bitfield flags."""

    def test_individual_flags(self) -> None:
        assert AccessLevel.CURRENT_READ == 1
        assert AccessLevel.CURRENT_WRITE == 2
        assert AccessLevel.HISTORY_READ == 4

    def test_flag_combination(self) -> None:
        rw = AccessLevel.CURRENT_READ | AccessLevel.CURRENT_WRITE
        assert bool(rw & AccessLevel.CURRENT_READ)
        assert bool(rw & AccessLevel.CURRENT_WRITE)
        assert not bool(rw & AccessLevel.HISTORY_READ)

    def test_none_flag(self) -> None:
        assert AccessLevel.NONE == 0
        assert not bool(AccessLevel.NONE & AccessLevel.CURRENT_READ)


# ---------------------------------------------------------------------------
# NodeId
# ---------------------------------------------------------------------------


class TestNodeId:
    """NodeId model — parsing, serialization, hashing."""

    def test_parse_string_identifier(self) -> None:
        nid = NodeId.parse("ns=2;s=Fermentation/TIT_2010")
        assert nid.namespace == 2
        assert nid.identifier == "Fermentation/TIT_2010"

    def test_parse_numeric_identifier(self) -> None:
        nid = NodeId.parse("ns=0;i=85")
        assert nid.namespace == 0
        assert nid.identifier == 85

    def test_parse_default_namespace(self) -> None:
        nid = NodeId.parse("s=MyTag")
        assert nid.namespace == 0
        assert nid.identifier == "MyTag"

    def test_parse_numeric_default_namespace(self) -> None:
        nid = NodeId.parse("i=2253")
        assert nid.namespace == 0
        assert nid.identifier == 2253

    def test_parse_guid(self) -> None:
        nid = NodeId.parse("ns=1;g=12345678-1234-1234-1234-123456789012")
        assert nid.namespace == 1
        assert nid.identifier == "12345678-1234-1234-1234-123456789012"

    def test_parse_opaque(self) -> None:
        nid = NodeId.parse("ns=3;b=AQID")
        assert nid.namespace == 3
        assert nid.identifier == "AQID"

    def test_to_string_string_id(self) -> None:
        nid = NodeId(namespace=2, identifier="Program:MainProgram.MyTag")
        assert nid.to_string() == "ns=2;s=Program:MainProgram.MyTag"

    def test_to_string_numeric_id(self) -> None:
        nid = NodeId(namespace=0, identifier=85)
        assert nid.to_string() == "ns=0;i=85"

    def test_str_method(self) -> None:
        nid = NodeId(namespace=2, identifier="Tag1")
        assert str(nid) == "ns=2;s=Tag1"

    def test_round_trip(self) -> None:
        original = "ns=2;s=Fermentation/TIT_2010/Out_PV"
        nid = NodeId.parse(original)
        assert nid.to_string() == original

    def test_hashable(self) -> None:
        nid1 = NodeId(namespace=2, identifier="Tag1")
        nid2 = NodeId(namespace=2, identifier="Tag1")
        nid3 = NodeId(namespace=2, identifier="Tag2")
        assert hash(nid1) == hash(nid2)
        assert hash(nid1) != hash(nid3)
        # Usable as dict key
        d = {nid1: "value1"}
        assert d[nid2] == "value1"

    def test_default_namespace(self) -> None:
        nid = NodeId(identifier="test")
        assert nid.namespace == 0

    def test_namespace_validation(self) -> None:
        with pytest.raises(Exception):
            NodeId(namespace=-1, identifier="test")


# ---------------------------------------------------------------------------
# DataValue
# ---------------------------------------------------------------------------


class TestDataValue:
    """DataValue model — the fundamental tag value carrier."""

    def test_defaults(self) -> None:
        dv = DataValue()
        assert dv.value is None
        assert dv.data_type == DataType.VARIANT
        assert dv.quality == QualityCode.NOT_AVAILABLE
        assert dv.status_code == 0
        assert dv.source_timestamp.tzinfo is not None
        assert dv.server_timestamp.tzinfo is not None

    def test_with_value(self) -> None:
        dv = DataValue(
            value=72.5,
            data_type=DataType.DOUBLE,
            quality=QualityCode.GOOD,
            status_code=0,
        )
        assert dv.value == 72.5
        assert dv.data_type == DataType.DOUBLE
        assert dv.quality == QualityCode.GOOD

    def test_naive_timestamp_gets_utc(self) -> None:
        """Naive timestamps should be forced to UTC by the validator."""
        naive_dt = datetime(2026, 1, 15, 12, 0, 0)
        dv = DataValue(source_timestamp=naive_dt, server_timestamp=naive_dt)
        assert dv.source_timestamp.tzinfo == timezone.utc
        assert dv.server_timestamp.tzinfo == timezone.utc

    def test_aware_timestamp_preserved(self) -> None:
        """Timestamps with tzinfo should be preserved as-is."""
        aware_dt = datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        dv = DataValue(source_timestamp=aware_dt, server_timestamp=aware_dt)
        assert dv.source_timestamp == aware_dt


# ---------------------------------------------------------------------------
# BrowseResult
# ---------------------------------------------------------------------------


class TestBrowseResult:
    """BrowseResult model — child nodes from Browse service."""

    def test_variable_node(self) -> None:
        br = BrowseResult(
            node_id=NodeId(namespace=2, identifier="TIT_2010/Out_PV"),
            browse_name="Out_PV",
            node_class=NodeClass.VARIABLE,
            data_type=DataType.DOUBLE,
            access_level=int(AccessLevel.CURRENT_READ | AccessLevel.CURRENT_WRITE),
        )
        assert br.is_variable
        assert br.is_readable
        assert br.is_writable

    def test_object_node(self) -> None:
        br = BrowseResult(
            node_id=NodeId(namespace=2, identifier="Fermentation"),
            browse_name="Fermentation",
            node_class=NodeClass.OBJECT,
        )
        assert not br.is_variable
        assert br.is_readable  # default is CURRENT_READ
        assert not br.is_writable

    def test_read_only_variable(self) -> None:
        br = BrowseResult(
            node_id=NodeId(namespace=2, identifier="ReadOnly"),
            browse_name="ReadOnly",
            node_class=NodeClass.VARIABLE,
            data_type=DataType.INT32,
            access_level=AccessLevel.CURRENT_READ,
        )
        assert br.is_readable
        assert not br.is_writable


# ---------------------------------------------------------------------------
# Subscription / MonitoredItem
# ---------------------------------------------------------------------------


class TestSubscription:
    """Subscription and MonitoredItem models."""

    def test_empty_subscription(self) -> None:
        sub = Subscription(subscription_id=1)
        assert sub.node_count == 0
        assert sub.is_active

    def test_subscription_with_items(self) -> None:
        items = [
            MonitoredItem(
                item_id=i,
                node_id=NodeId(namespace=2, identifier=f"Tag{i}"),
            )
            for i in range(5)
        ]
        sub = Subscription(
            subscription_id=42,
            publishing_interval_ms=250.0,
            monitored_items=items,
        )
        assert sub.node_count == 5
        assert sub.publishing_interval_ms == 250.0

    def test_monitored_item_defaults(self) -> None:
        mi = MonitoredItem(
            item_id=1,
            node_id=NodeId(namespace=2, identifier="Test"),
        )
        assert mi.sampling_interval_ms == 500.0
        assert mi.queue_size == 10
        assert mi.discard_oldest is True


# ---------------------------------------------------------------------------
# OpcUaEndpoint
# ---------------------------------------------------------------------------


class TestOpcUaEndpoint:
    """OpcUaEndpoint configuration model."""

    def test_minimal(self) -> None:
        ep = OpcUaEndpoint(url="opc.tcp://10.4.2.10:4840")
        assert ep.url == "opc.tcp://10.4.2.10:4840"
        assert ep.security_policy == "None"
        assert ep.session_timeout_ms == 60_000
        assert ep.reconnect_interval_ms == 1000

    def test_full_config(self) -> None:
        ep = OpcUaEndpoint(
            url="opc.tcp://10.4.2.20:4840",
            name="plc200",
            security_policy="Basic256Sha256",
            certificate_path="/certs/client.pem",
            private_key_path="/certs/client.key",
            session_timeout_ms=120_000,
            request_timeout_ms=5_000,
            reconnect_interval_ms=2000,
            max_reconnect_attempts=10,
        )
        assert ep.name == "plc200"
        assert ep.max_reconnect_attempts == 10


# ---------------------------------------------------------------------------
# ConnectionHealth
# ---------------------------------------------------------------------------


class TestConnectionHealth:
    """ConnectionHealth snapshot model."""

    def test_defaults(self) -> None:
        ch = ConnectionHealth(endpoint_url="opc.tcp://10.4.2.10:4840")
        assert ch.state == ConnectionState.DISCONNECTED
        assert ch.reconnect_count == 0
        assert ch.active_subscriptions == 0
        assert ch.latency_ms is None

    def test_healthy_connection(self) -> None:
        ch = ConnectionHealth(
            endpoint_url="opc.tcp://10.4.2.10:4840",
            connection_name="plc200",
            state=ConnectionState.CONNECTED,
            connected_since=datetime.now(timezone.utc),
            reconnect_count=0,
            active_subscriptions=3,
            monitored_items_count=150,
            latency_ms=2.5,
        )
        assert ch.state == ConnectionState.CONNECTED
        assert ch.latency_ms == 2.5
