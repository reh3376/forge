"""Tests for the forge.util SDK module."""

import asyncio

import pytest

from forge.sdk.scripting.modules.util import UtilModule


# ---------------------------------------------------------------------------
# JSON
# ---------------------------------------------------------------------------


class TestJSON:
    """Tests for JSON encode/decode."""

    def setup_method(self):
        self.um = UtilModule()

    def test_json_encode(self):
        result = self.um.json_encode({"key": "value"})
        assert '"key"' in result
        assert '"value"' in result

    def test_json_encode_with_indent(self):
        result = self.um.json_encode({"a": 1}, indent=2)
        assert "\n" in result

    def test_json_decode(self):
        result = self.um.json_decode('{"key": "value"}')
        assert result == {"key": "value"}

    def test_json_decode_array(self):
        result = self.um.json_decode('[1, 2, 3]')
        assert result == [1, 2, 3]

    def test_json_roundtrip(self):
        original = {"name": "TIT_2010", "value": 72.5, "tags": ["a", "b"]}
        encoded = self.um.json_encode(original)
        decoded = self.um.json_decode(encoded)
        assert decoded == original


# ---------------------------------------------------------------------------
# Project / environment
# ---------------------------------------------------------------------------


class TestEnvironment:
    """Tests for project and environment functions."""

    def test_default_project_name(self):
        um = UtilModule()
        assert um.get_project_name() == "forge"

    def test_custom_project_name(self):
        um = UtilModule()
        um.bind(project_name="whk-ot")
        assert um.get_project_name() == "whk-ot"

    def test_get_scope_default(self):
        um = UtilModule()
        assert um.get_scope() == "GATEWAY"

    def test_is_gateway(self):
        um = UtilModule()
        um.bind(scope="GATEWAY")
        assert um.is_gateway() is True

    def test_is_not_gateway(self):
        um = UtilModule()
        um.bind(scope="CLIENT")
        assert um.is_gateway() is False

    def test_get_property_from_env(self):
        import os
        os.environ["FORGE_TEST_VAR"] = "test_value"
        um = UtilModule()
        assert um.get_property("FORGE_TEST_VAR") == "test_value"
        del os.environ["FORGE_TEST_VAR"]

    def test_get_property_default(self):
        um = UtilModule()
        assert um.get_property("NONEXISTENT_VAR", "default") == "default"


# ---------------------------------------------------------------------------
# Globals
# ---------------------------------------------------------------------------


class TestGlobals:
    """Tests for global variable storage."""

    def test_get_globals_empty(self):
        um = UtilModule()
        assert um.get_globals() == {}

    def test_set_and_get_global(self):
        um = UtilModule()
        um.set_global("counter", 42)
        assert um.get_global("counter") == 42

    def test_get_global_default(self):
        um = UtilModule()
        assert um.get_global("missing", "default") == "default"

    def test_globals_dict_reference(self):
        um = UtilModule()
        um.set_global("key", "value")
        globals_dict = um.get_globals()
        assert globals_dict["key"] == "value"


# ---------------------------------------------------------------------------
# Message passing
# ---------------------------------------------------------------------------


class TestMessages:
    """Tests for message passing."""

    @pytest.mark.asyncio
    async def test_send_message_no_handler(self):
        um = UtilModule()
        result = await um.send_message("nonexistent")
        assert result is False

    @pytest.mark.asyncio
    async def test_send_message_with_handler(self):
        um = UtilModule()
        received = []

        def handler(payload):
            received.append(payload)

        um.register_message_handler("test", handler)
        result = await um.send_message("test", {"data": 42})
        assert result is True
        assert len(received) == 1
        assert received[0]["data"] == 42

    @pytest.mark.asyncio
    async def test_send_message_async_handler(self):
        um = UtilModule()
        received = []

        async def handler(payload):
            received.append(payload)

        um.register_message_handler("test", handler)
        await um.send_message("test", {"async": True})
        assert len(received) == 1

    @pytest.mark.asyncio
    async def test_send_request(self):
        um = UtilModule()

        async def handler(payload):
            return {"result": payload.get("x", 0) * 2}

        um.register_message_handler("double", handler)
        result = await um.send_request("forge", "double", {"x": 21})
        assert result == {"result": 42}

    @pytest.mark.asyncio
    async def test_send_request_no_handler(self):
        um = UtilModule()
        with pytest.raises(RuntimeError, match="No handler"):
            await um.send_request("forge", "missing")

    @pytest.mark.asyncio
    async def test_multiple_handlers(self):
        um = UtilModule()
        received = []

        um.register_message_handler("multi", lambda p: received.append("a"))
        um.register_message_handler("multi", lambda p: received.append("b"))

        await um.send_message("multi")
        assert received == ["a", "b"]
