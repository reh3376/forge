"""Tests for the Alarm REST API handler.

Covers:
- Active alarm queries (with area/priority filters)
- History queries
- Config CRUD (register, get, list, delete)
- Alarm actions (ack, shelve, unshelve, suppress, reset)
- Stats endpoint
- Error responses for nonexistent alarms/configs
"""

import pytest

from forge.modules.ot.alarming.engine import AlarmEngine
from forge.modules.ot.alarming.api import AlarmApiHandler


@pytest.fixture
def engine() -> AlarmEngine:
    return AlarmEngine()


@pytest.fixture
def api(engine: AlarmEngine) -> AlarmApiHandler:
    return AlarmApiHandler(engine)


# ---------------------------------------------------------------------------
# Active alarms
# ---------------------------------------------------------------------------


class TestGetActive:
    @pytest.mark.asyncio
    async def test_empty_initial(self, api: AlarmApiHandler):
        result = await api.get_active()
        assert result["success"] is True
        assert result["data"] == []

    @pytest.mark.asyncio
    async def test_returns_active_alarms(self, engine: AlarmEngine, api: AlarmApiHandler):
        await engine.trigger_alarm(name="A1", tag_path="t1", priority="HIGH", area="X")
        result = await api.get_active()
        assert len(result["data"]) == 1

    @pytest.mark.asyncio
    async def test_filter_by_area(self, engine: AlarmEngine, api: AlarmApiHandler):
        await engine.trigger_alarm(name="A1", tag_path="t1", priority="HIGH", area="X")
        await engine.trigger_alarm(name="A2", tag_path="t2", priority="HIGH", area="Y")

        result = await api.get_active(area="X")
        assert len(result["data"]) == 1
        assert result["data"][0]["area"] == "X"

    @pytest.mark.asyncio
    async def test_filter_by_priority(self, engine: AlarmEngine, api: AlarmApiHandler):
        await engine.trigger_alarm(name="A1", tag_path="t1", priority="HIGH")
        await engine.trigger_alarm(name="A2", tag_path="t2", priority="LOW")

        result = await api.get_active(priority="HIGH")
        assert len(result["data"]) == 1


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------


class TestGetHistory:
    @pytest.mark.asyncio
    async def test_empty_initial(self, api: AlarmApiHandler):
        result = await api.get_history()
        assert result["success"] is True
        assert result["data"] == []

    @pytest.mark.asyncio
    async def test_returns_events(self, engine: AlarmEngine, api: AlarmApiHandler):
        await engine.trigger_alarm(name="H1", tag_path="t", priority="HIGH")
        result = await api.get_history()
        assert len(result["data"]) == 1


# ---------------------------------------------------------------------------
# Config CRUD
# ---------------------------------------------------------------------------


class TestConfigCrud:
    @pytest.mark.asyncio
    async def test_register_and_get(self, api: AlarmApiHandler):
        req = {
            "tag_path": "test/tag",
            "area": "A1",
            "thresholds": [
                {"alarm_type": "HI", "setpoint": 100.0, "priority": "HIGH"},
            ],
        }
        result = await api.register_config(req)
        assert result["success"] is True

        result = await api.get_config("test/tag")
        assert result["success"] is True
        assert result["data"]["tag_path"] == "test/tag"
        assert len(result["data"]["thresholds"]) == 1

    @pytest.mark.asyncio
    async def test_get_all(self, api: AlarmApiHandler):
        await api.register_config({"tag_path": "t1", "thresholds": []})
        await api.register_config({"tag_path": "t2", "thresholds": []})

        result = await api.get_all_configs()
        assert len(result["data"]) == 2

    @pytest.mark.asyncio
    async def test_delete(self, api: AlarmApiHandler):
        await api.register_config({"tag_path": "t1", "thresholds": []})
        result = await api.delete_config("t1")
        assert result["success"] is True

        result = await api.get_config("t1")
        assert result["success"] is False

    @pytest.mark.asyncio
    async def test_delete_nonexistent(self, api: AlarmApiHandler):
        result = await api.delete_config("nope")
        assert result["success"] is False

    @pytest.mark.asyncio
    async def test_get_nonexistent(self, api: AlarmApiHandler):
        result = await api.get_config("nope")
        assert result["success"] is False

    @pytest.mark.asyncio
    async def test_register_invalid(self, api: AlarmApiHandler):
        result = await api.register_config({})  # Missing tag_path
        assert result["success"] is False


# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------


class TestActions:
    @pytest.mark.asyncio
    async def test_acknowledge(self, engine: AlarmEngine, api: AlarmApiHandler):
        alarm_id = await engine.trigger_alarm(name="A1", tag_path="t", priority="HIGH")
        result = await api.acknowledge(alarm_id, operator="op1")
        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_acknowledge_nonexistent(self, api: AlarmApiHandler):
        result = await api.acknowledge("nope")
        assert result["success"] is False

    @pytest.mark.asyncio
    async def test_shelve(self, engine: AlarmEngine, api: AlarmApiHandler):
        alarm_id = await engine.trigger_alarm(name="A1", tag_path="t", priority="HIGH")
        result = await api.shelve(alarm_id, duration_minutes=30, reason="maint")
        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_unshelve(self, engine: AlarmEngine, api: AlarmApiHandler):
        alarm_id = await engine.trigger_alarm(name="A1", tag_path="t", priority="HIGH")
        await engine.shelve_alarm(alarm_id)
        result = await api.unshelve(alarm_id)
        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_suppress(self, engine: AlarmEngine, api: AlarmApiHandler):
        alarm_id = await engine.trigger_alarm(name="A1", tag_path="t", priority="HIGH")
        result = await api.suppress(alarm_id, reason="flood")
        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_reset(self, engine: AlarmEngine, api: AlarmApiHandler):
        alarm_id = await engine.trigger_alarm(name="A1", tag_path="t", priority="HIGH")
        result = await api.reset(alarm_id, operator="admin")
        assert result["success"] is True


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------


class TestStats:
    @pytest.mark.asyncio
    async def test_stats(self, engine: AlarmEngine, api: AlarmApiHandler):
        await engine.trigger_alarm(name="S1", tag_path="t", priority="HIGH")
        result = await api.get_stats()
        assert result["success"] is True
        assert result["data"]["total_triggered"] == 1
