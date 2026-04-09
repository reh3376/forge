"""Tests for the forge.perspective SDK module."""

import pytest

from forge.sdk.scripting.modules.perspective import PerspectiveModule, SessionInfo


# ---------------------------------------------------------------------------
# Mock event bus
# ---------------------------------------------------------------------------


class MockEventBus:
    """In-memory event bus for testing."""

    def __init__(self):
        self.published: list[tuple[str, dict]] = []

    async def publish(self, topic: str, message: dict) -> None:
        self.published.append((topic, message))


# ---------------------------------------------------------------------------
# PerspectiveModule
# ---------------------------------------------------------------------------


class TestPerspectiveModule:
    """Tests for the PerspectiveModule."""

    def setup_method(self):
        self.pm = PerspectiveModule()
        self.bus = MockEventBus()
        self.pm.bind(event_bus=self.bus)

    @pytest.mark.asyncio
    async def test_send_message(self):
        result = await self.pm.send_message("notify", {"text": "Hello"})
        assert result is True
        assert len(self.bus.published) == 1
        topic, msg = self.bus.published[0]
        assert topic == "hmi.message"
        assert msg["handler"] == "notify"
        assert msg["payload"]["text"] == "Hello"

    @pytest.mark.asyncio
    async def test_send_message_no_bus(self):
        pm = PerspectiveModule()  # No bind
        result = await pm.send_message("notify", {"text": "Hello"})
        assert result is False

    @pytest.mark.asyncio
    async def test_send_message_scope(self):
        await self.pm.send_message("refresh", scope="session")
        _, msg = self.bus.published[0]
        assert msg["scope"] == "session"

    @pytest.mark.asyncio
    async def test_navigate(self):
        result = await self.pm.navigate("/distillery/overview")
        assert result is True
        topic, msg = self.bus.published[0]
        assert topic == "hmi.navigate"
        assert msg["page"] == "/distillery/overview"

    @pytest.mark.asyncio
    async def test_navigate_no_bus(self):
        pm = PerspectiveModule()
        result = await pm.navigate("/test")
        assert result is False

    @pytest.mark.asyncio
    async def test_open_popup(self):
        result = await self.pm.open_popup(
            "batch-popup",
            "views/batch_detail",
            params={"batchId": "123"},
            title="Batch Detail",
        )
        assert result is True
        _, msg = self.bus.published[0]
        assert msg["popup_id"] == "batch-popup"
        assert msg["view_path"] == "views/batch_detail"
        assert msg["params"]["batchId"] == "123"

    @pytest.mark.asyncio
    async def test_close_popup(self):
        result = await self.pm.close_popup("batch-popup")
        assert result is True
        _, msg = self.bus.published[0]
        assert msg["type"] == "perspective.popup.close"
        assert msg["popup_id"] == "batch-popup"

    @pytest.mark.asyncio
    async def test_get_sessions_empty(self):
        sessions = await self.pm.get_sessions()
        assert sessions == []

    @pytest.mark.asyncio
    async def test_download(self):
        result = await self.pm.download("report.csv", b"a,b\n1,2")
        assert result is True
        _, msg = self.bus.published[0]
        assert msg["filename"] == "report.csv"
        assert msg["content_length"] == 7

    @pytest.mark.asyncio
    async def test_print_page(self):
        result = await self.pm.print_page()
        assert result is True
        _, msg = self.bus.published[0]
        assert msg["type"] == "perspective.print"

    @pytest.mark.asyncio
    async def test_navigation_history_tracked(self):
        await self.pm.navigate("/page1")
        await self.pm.navigate("/page2")
        assert self.pm._navigation_history == ["/page1", "/page2"]
