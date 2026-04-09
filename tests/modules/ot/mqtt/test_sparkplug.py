"""Tests for SparkplugB encoding — topic/payload generation."""

import pytest
from datetime import datetime, timezone

from forge.modules.ot.mqtt.sparkplug import (
    SparkplugDataType,
    SparkplugEncoder,
    SparkplugMetric,
    SparkplugPayload,
    infer_sparkplug_type,
)


# ---------------------------------------------------------------------------
# Data type inference
# ---------------------------------------------------------------------------


class TestDataTypeInference:

    def test_bool(self):
        assert infer_sparkplug_type(True) == SparkplugDataType.BOOLEAN
        assert infer_sparkplug_type(False) == SparkplugDataType.BOOLEAN

    def test_int_small(self):
        assert infer_sparkplug_type(42) == SparkplugDataType.INT8

    def test_int_medium(self):
        assert infer_sparkplug_type(1000) == SparkplugDataType.INT16

    def test_int_large(self):
        assert infer_sparkplug_type(100_000) == SparkplugDataType.INT32

    def test_int_huge(self):
        assert infer_sparkplug_type(3_000_000_000) == SparkplugDataType.INT64

    def test_float(self):
        assert infer_sparkplug_type(78.4) == SparkplugDataType.DOUBLE

    def test_string(self):
        assert infer_sparkplug_type("hello") == SparkplugDataType.STRING

    def test_bytes(self):
        assert infer_sparkplug_type(b"\x00\x01") == SparkplugDataType.BYTES

    def test_datetime(self):
        assert infer_sparkplug_type(datetime.now()) == SparkplugDataType.DATETIME

    def test_unknown(self):
        assert infer_sparkplug_type(object()) == SparkplugDataType.UNKNOWN


# ---------------------------------------------------------------------------
# Metric
# ---------------------------------------------------------------------------


class TestSparkplugMetric:

    def test_to_dict(self):
        m = SparkplugMetric(name="temp", value=78.4, timestamp=1000)
        d = m.to_dict()
        assert d["name"] == "temp"
        assert d["value"] == 78.4
        assert d["datatype"] == int(SparkplugDataType.DOUBLE)

    def test_historical_flag(self):
        m = SparkplugMetric(name="temp", is_historical=True)
        d = m.to_dict()
        assert d["is_historical"] is True


# ---------------------------------------------------------------------------
# Payload
# ---------------------------------------------------------------------------


class TestSparkplugPayload:

    def test_to_dict(self):
        p = SparkplugPayload(
            timestamp=1000, seq=5,
            metrics=[SparkplugMetric(name="temp", value=78.4)],
        )
        d = p.to_dict()
        assert d["timestamp"] == 1000
        assert d["seq"] == 5
        assert len(d["metrics"]) == 1


# ---------------------------------------------------------------------------
# Encoder — topics
# ---------------------------------------------------------------------------


class TestEncoderTopics:

    def test_node_birth_topic(self):
        enc = SparkplugEncoder(group_id="WHK", edge_node_id="OT-Module-01")
        topic, _ = enc.build_node_birth()
        assert topic == "spBv1.0/WHK/NBIRTH/OT-Module-01"

    def test_node_death_topic(self):
        enc = SparkplugEncoder(group_id="WHK", edge_node_id="OT-Module-01")
        topic, _ = enc.build_node_death()
        assert topic == "spBv1.0/WHK/NDEATH/OT-Module-01"

    def test_device_birth_topic(self):
        enc = SparkplugEncoder(group_id="WHK", edge_node_id="OT-01")
        topic, _ = enc.build_device_birth("Distillery01")
        assert topic == "spBv1.0/WHK/DBIRTH/OT-01/Distillery01"

    def test_device_data_topic(self):
        enc = SparkplugEncoder(group_id="WHK", edge_node_id="OT-01")
        topic, _ = enc.build_device_data("Distillery01")
        assert topic == "spBv1.0/WHK/DDATA/OT-01/Distillery01"

    def test_device_death_topic(self):
        enc = SparkplugEncoder(group_id="WHK", edge_node_id="OT-01")
        topic, _ = enc.build_device_death("Distillery01")
        assert topic == "spBv1.0/WHK/DDEATH/OT-01/Distillery01"


# ---------------------------------------------------------------------------
# Encoder — payloads
# ---------------------------------------------------------------------------


class TestEncoderPayloads:

    def test_node_birth_resets_seq(self):
        enc = SparkplugEncoder()
        # Burn some sequences
        enc.build_device_data("dev", [SparkplugMetric(name="x")])
        enc.build_device_data("dev", [SparkplugMetric(name="x")])
        # Birth resets
        _, payload = enc.build_node_birth()
        assert payload["seq"] == 0

    def test_node_birth_assigns_aliases(self):
        metrics = [
            SparkplugMetric(name="temp", value=78.4),
            SparkplugMetric(name="pressure", value=14.7),
        ]
        enc = SparkplugEncoder()
        _, payload = enc.build_node_birth(metrics)
        aliases = [m["alias"] for m in payload["metrics"]]
        assert len(set(aliases)) == 2  # Each has a unique alias

    def test_node_death_has_bdseq(self):
        enc = SparkplugEncoder()
        _, payload = enc.build_node_death()
        assert len(payload["metrics"]) == 1
        assert payload["metrics"][0]["name"] == "bdSeq"

    def test_device_data_increments_seq(self):
        enc = SparkplugEncoder()
        enc.build_node_birth()  # seq=0
        _, p1 = enc.build_device_data("dev", [SparkplugMetric(name="x")])
        _, p2 = enc.build_device_data("dev", [SparkplugMetric(name="x")])
        assert p1["seq"] == 1
        assert p2["seq"] == 2

    def test_seq_wraps_at_256(self):
        enc = SparkplugEncoder()
        enc._seq = 255
        _, p = enc.build_device_data("dev", [SparkplugMetric(name="x")])
        assert p["seq"] == 255
        _, p2 = enc.build_device_data("dev", [SparkplugMetric(name="x")])
        assert p2["seq"] == 0  # Wrapped

    def test_device_data_has_timestamp(self):
        enc = SparkplugEncoder()
        _, payload = enc.build_device_data("dev", [
            SparkplugMetric(name="temp", value=78.4),
        ])
        assert payload["timestamp"] > 0
        assert payload["metrics"][0]["timestamp"] > 0
