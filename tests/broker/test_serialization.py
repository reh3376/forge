"""Tests for broker message serialization."""

import json
from dataclasses import dataclass
from datetime import UTC, datetime

import pytest

from forge.broker.serialization import deserialize_record, serialize_record


class TestSerializeRecord:
    def test_serialize_dict(self):
        data = {"adapter_id": "erpi-01", "value": 42.0}
        result = serialize_record(data)
        assert isinstance(result, bytes)
        parsed = json.loads(result)
        assert parsed["adapter_id"] == "erpi-01"
        assert parsed["value"] == 42.0

    def test_serialize_dict_with_datetime(self):
        data = {"timestamp": datetime(2026, 4, 12, tzinfo=UTC)}
        result = serialize_record(data)
        parsed = json.loads(result)
        assert "2026-04-12" in parsed["timestamp"]

    def test_serialize_dataclass(self):
        @dataclass
        class Sample:
            name: str
            value: float

        record = Sample(name="temp", value=98.6)
        result = serialize_record(record)
        parsed = json.loads(result)
        assert parsed["name"] == "temp"
        assert parsed["value"] == 98.6

    def test_serialize_unsupported_type(self):
        with pytest.raises(TypeError):
            serialize_record(42)

    def test_compact_json(self):
        data = {"key": "value"}
        result = serialize_record(data)
        # Compact JSON: no spaces
        assert b" " not in result


class TestDeserializeRecord:
    def test_basic_roundtrip(self):
        original = {"adapter_id": "mes-01", "records": [1, 2, 3]}
        serialized = serialize_record(original)
        deserialized = deserialize_record(serialized)
        assert deserialized == original

    def test_deserialize_utf8(self):
        data = json.dumps({"name": "température"}).encode("utf-8")
        result = deserialize_record(data)
        assert result["name"] == "température"

    def test_deserialize_empty_object(self):
        data = b"{}"
        result = deserialize_record(data)
        assert result == {}
