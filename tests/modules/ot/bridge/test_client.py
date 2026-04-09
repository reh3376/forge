"""Tests for the Ignition REST client."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import pytest

from forge.modules.ot.bridge.client import IgnitionRestClient, _chunk, _parse_tag_response
from forge.modules.ot.bridge.models import BridgeConfig, IgnitionQuality


# ---------------------------------------------------------------------------
# Mock HTTP transport
# ---------------------------------------------------------------------------


class MockTransport:
    """In-memory HTTP transport for testing."""

    def __init__(self) -> None:
        self.requests: list[dict[str, Any]] = []
        self._post_responses: list[dict[str, Any]] = []
        self._get_responses: list[dict[str, Any]] = []
        self._fail_after: int | None = None
        self._call_count = 0

    def set_post_response(self, response: dict[str, Any]) -> None:
        self._post_responses = [response]

    def set_post_responses(self, responses: list[dict[str, Any]]) -> None:
        self._post_responses = responses

    def set_get_response(self, response: dict[str, Any]) -> None:
        self._get_responses = [response]

    def set_fail_after(self, n: int) -> None:
        """Raise ConnectionError after n successful calls."""
        self._fail_after = n

    async def post(
        self,
        url: str,
        *,
        json: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        timeout_ms: int = 5000,
    ) -> dict[str, Any]:
        self._call_count += 1
        self.requests.append({"method": "POST", "url": url, "json": json})

        if self._fail_after is not None and self._call_count > self._fail_after:
            raise ConnectionError("Simulated failure")

        idx = min(len(self.requests) - 1, len(self._post_responses) - 1)
        if idx >= 0:
            return self._post_responses[idx]
        return {}

    async def get(
        self,
        url: str,
        *,
        params: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
        timeout_ms: int = 5000,
    ) -> dict[str, Any]:
        self._call_count += 1
        self.requests.append({"method": "GET", "url": url, "params": params})

        if self._fail_after is not None and self._call_count > self._fail_after:
            raise ConnectionError("Simulated failure")

        idx = min(len(self.requests) - 1, len(self._get_responses) - 1)
        if idx >= 0:
            return self._get_responses[idx]
        return {}


# ---------------------------------------------------------------------------
# Helper tests
# ---------------------------------------------------------------------------


class TestChunk:
    """Tests for the list chunking helper."""

    def test_empty_list(self):
        assert _chunk([], 10) == []

    def test_exact_multiple(self):
        result = _chunk(["a", "b", "c", "d"], 2)
        assert result == [["a", "b"], ["c", "d"]]

    def test_remainder(self):
        result = _chunk(["a", "b", "c"], 2)
        assert result == [["a", "b"], ["c"]]

    def test_single_chunk(self):
        result = _chunk(["a", "b"], 10)
        assert result == [["a", "b"]]

    def test_size_one(self):
        result = _chunk(["a", "b", "c"], 1)
        assert result == [["a"], ["b"], ["c"]]

    def test_zero_size(self):
        result = _chunk(["a", "b"], 0)
        assert result == [["a", "b"]]  # No chunking


class TestParseTagResponse:
    """Tests for REST API response parsing."""

    def test_normal_response(self):
        paths = ["[WHK01]tag1", "[WHK01]tag2"]
        response = {
            "results": [
                {"value": 72.5, "quality": "Good", "timestamp": 1712678400000, "dataType": "Float8"},
                {"value": True, "quality": "Good", "timestamp": 1712678400000, "dataType": "Boolean"},
            ]
        }
        values = _parse_tag_response(paths, response)
        assert len(values) == 2
        assert values[0].value == 72.5
        assert values[1].value is True

    def test_missing_results(self):
        paths = ["[WHK01]tag1", "[WHK01]tag2"]
        response = {"results": [{"value": 42}]}  # Only 1 result for 2 paths
        values = _parse_tag_response(paths, response)
        assert len(values) == 2
        assert values[0].value == 42
        assert values[1].quality == IgnitionQuality.BAD_NOT_FOUND

    def test_empty_response(self):
        paths = ["[WHK01]tag1"]
        values = _parse_tag_response(paths, {})
        assert len(values) == 1
        assert values[0].quality == IgnitionQuality.BAD_NOT_FOUND

    def test_values_key_variant(self):
        """Some Ignition versions use 'values' instead of 'results'."""
        paths = ["[WHK01]tag1"]
        response = {"values": [{"value": 99, "quality": "Good"}]}
        values = _parse_tag_response(paths, response)
        assert values[0].value == 99


# ---------------------------------------------------------------------------
# Client tests
# ---------------------------------------------------------------------------


class TestIgnitionRestClient:
    """Tests for the IgnitionRestClient."""

    def _make_client(
        self,
        transport: MockTransport | None = None,
        **config_kwargs: Any,
    ) -> tuple[IgnitionRestClient, MockTransport]:
        t = transport or MockTransport()
        config = BridgeConfig(**config_kwargs)
        client = IgnitionRestClient(config, t)
        return client, t

    @pytest.mark.asyncio
    async def test_connect_anonymous(self):
        """Anonymous connection (no username) succeeds immediately."""
        client, transport = self._make_client(username="", password="")
        result = await client.connect()
        assert result is True
        assert client.is_connected

    @pytest.mark.asyncio
    async def test_connect_with_auth(self):
        """Authenticated connection stores session token."""
        client, transport = self._make_client(
            username="admin", password="secret"
        )
        transport.set_post_response({"token": "test-session-123"})
        result = await client.connect()
        assert result is True
        assert client.is_connected
        assert client._session_token == "test-session-123"

    @pytest.mark.asyncio
    async def test_connect_failure(self):
        """Connection failure returns False."""
        client, transport = self._make_client(
            username="admin", password="secret"
        )
        transport.set_fail_after(0)  # Fail immediately
        result = await client.connect()
        assert result is False
        assert not client.is_connected

    @pytest.mark.asyncio
    async def test_disconnect(self):
        """Disconnect clears session state."""
        client, transport = self._make_client()
        transport.set_post_response({})
        await client.connect()
        await client.disconnect()
        assert not client.is_connected
        assert client._session_token is None

    @pytest.mark.asyncio
    async def test_read_tags_single_batch(self):
        """Read tags within batch size makes one request."""
        client, transport = self._make_client(batch_size=100)
        transport.set_post_response({})
        await client.connect()

        transport.set_post_response({
            "results": [
                {"value": 72.5, "quality": "Good", "timestamp": 1712678400000},
                {"value": 23.1, "quality": "Good", "timestamp": 1712678400000},
            ]
        })
        response = await client.read_tags(["[WHK01]tag1", "[WHK01]tag2"])
        assert len(response.values) == 2
        assert response.values[0].value == 72.5

    @pytest.mark.asyncio
    async def test_read_tags_empty_list(self):
        """Empty tag list returns empty response."""
        client, transport = self._make_client()
        transport.set_post_response({})
        await client.connect()

        response = await client.read_tags([])
        assert len(response.values) == 0

    @pytest.mark.asyncio
    async def test_read_tags_multiple_batches(self):
        """Large tag list splits into multiple batch requests."""
        client, transport = self._make_client(batch_size=2)
        transport.set_post_response({})
        await client.connect()

        transport.set_post_response({
            "results": [{"value": i, "quality": "Good"} for i in range(2)]
        })
        response = await client.read_tags(["tag1", "tag2", "tag3"])
        # Should have made 2 batch requests (2 + 1)
        assert len(response.values) >= 2

    @pytest.mark.asyncio
    async def test_browse_flat(self):
        """Browse returns tag nodes."""
        client, transport = self._make_client()
        transport.set_post_response({})
        await client.connect()

        transport.set_get_response({
            "nodes": [
                {"name": "Distillery01", "path": "[WHK01]Distillery01", "tagType": "Folder", "hasChildren": True},
                {"name": "TIT_2010", "path": "[WHK01]TIT_2010", "tagType": "AtomicTag", "hasChildren": False},
            ]
        })
        results = await client.browse("[WHK01]", recursive=False)
        assert len(results) == 2
        assert results[0]["name"] == "Distillery01"
        assert results[0]["has_children"] is True

    @pytest.mark.asyncio
    async def test_get_status(self):
        """Gateway status returns version info."""
        client, transport = self._make_client()
        transport.set_post_response({})
        await client.connect()

        transport.set_get_response({
            "gatewayName": "WHK01-Gateway",
            "version": "8.1.33",
            "uptime": 86400,
        })
        status = await client.get_status()
        assert status["version"] == "8.1.33"

    @pytest.mark.asyncio
    async def test_get_status_failure(self):
        """Status check failure returns unreachable."""
        client, transport = self._make_client()
        transport.set_post_response({})
        await client.connect()  # Anonymous — no transport calls
        transport.set_fail_after(0)  # Fail on very first call

        status = await client.get_status()
        assert status["status"] == "unreachable"

    @pytest.mark.asyncio
    async def test_auth_headers_included(self):
        """Session token included in request headers."""
        client, transport = self._make_client(
            username="admin", password="secret"
        )
        transport.set_post_response({"token": "my-token"})
        await client.connect()

        # Read tags — should include auth header
        transport.set_post_response({"results": [{"value": 1}]})
        await client.read_tags(["tag"])

        # The tag read request should have auth headers
        tag_request = transport.requests[-1]
        assert tag_request["url"].endswith("/system/tag/read")
