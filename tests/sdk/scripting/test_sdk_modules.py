"""Tests for forge.* SDK modules (tag, db, net, log, alarm)."""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from forge.sdk.scripting.modules.alarm import AlarmInfo, AlarmModule
from forge.sdk.scripting.modules.db import DbModule, QueryResult, register_named_query
from forge.sdk.scripting.modules.log import ForgeLogger, LogModule
from forge.sdk.scripting.modules.net import HttpResponse
from forge.sdk.scripting.modules.tag import BrowseNode, TagModule, TagReadResult

# ===========================================================================
# forge.tag
# ===========================================================================


class TestTagModule:

    @pytest.fixture
    def mock_registry(self):
        reg = MagicMock()
        reg.get_tag_and_value = AsyncMock()
        reg.get_definition = AsyncMock()
        reg.update_value = AsyncMock(return_value=True)
        reg.browse = AsyncMock(return_value=[])
        return reg

    @pytest.fixture
    def tag_mod(self, mock_registry):
        mod = TagModule()
        mod.bind(mock_registry)
        return mod

    @pytest.mark.asyncio
    async def test_read_returns_result(self, tag_mod, mock_registry):
        mock_tag = MagicMock()
        mock_tag.engineering_units = "degF"
        mock_value = MagicMock()
        mock_value.value = 78.4
        mock_value.quality.value = "GOOD"
        mock_value.timestamp.isoformat.return_value = "2026-04-08T12:00:00Z"
        mock_registry.get_tag_and_value.return_value = (mock_tag, mock_value)

        result = await tag_mod.read("WH/WHK01/TIT/Out_PV")
        assert isinstance(result, TagReadResult)
        assert result.value == 78.4
        assert result.quality == "GOOD"

    @pytest.mark.asyncio
    async def test_read_missing_tag_raises(self, tag_mod, mock_registry):
        mock_registry.get_tag_and_value.return_value = None
        with pytest.raises(KeyError, match="Tag not found"):
            await tag_mod.read("nonexistent/tag")

    @pytest.mark.asyncio
    async def test_write(self, tag_mod, mock_registry):
        result = await tag_mod.write("WH/WHK01/TIT/Setpoint", 80.0)
        assert result is True
        mock_registry.update_value.assert_awaited_once_with("WH/WHK01/TIT/Setpoint", 80.0)

    @pytest.mark.asyncio
    async def test_browse(self, tag_mod, mock_registry):
        mock_registry.browse.return_value = [
            {
                "path": "WH/WHK01/Distillery01",
                "name": "Distillery01",
                "is_folder": True,
                "has_children": True,
            },
        ]
        nodes = await tag_mod.browse("WH/WHK01")
        assert len(nodes) == 1
        assert isinstance(nodes[0], BrowseNode)
        assert nodes[0].is_folder is True

    @pytest.mark.asyncio
    async def test_exists_true(self, tag_mod, mock_registry):
        mock_registry.get_definition.return_value = MagicMock()
        assert await tag_mod.exists("WH/WHK01/TIT/Out_PV") is True

    @pytest.mark.asyncio
    async def test_exists_false(self, tag_mod, mock_registry):
        mock_registry.get_definition.return_value = None
        assert await tag_mod.exists("nonexistent") is False

    @pytest.mark.asyncio
    async def test_unbound_raises(self):
        mod = TagModule()
        with pytest.raises(RuntimeError, match="not bound"):
            await mod.read("some/path")

    @pytest.mark.asyncio
    async def test_read_multiple(self, tag_mod, mock_registry):
        mock_tag = MagicMock()
        mock_tag.engineering_units = "degF"
        mock_value = MagicMock()
        mock_value.value = 78.4
        mock_value.quality.value = "GOOD"
        mock_value.timestamp.isoformat.return_value = "2026-04-08T12:00:00Z"

        # First exists, second doesn't
        mock_registry.get_tag_and_value.side_effect = [
            (mock_tag, mock_value),
            None,
        ]
        results = await tag_mod.read_multiple(["tag/a", "tag/b"])
        assert len(results) == 2
        assert results[0].value == 78.4
        assert results[1].quality == "NOT_AVAILABLE"


# ===========================================================================
# forge.db
# ===========================================================================


class TestDbModule:

    def test_query_result_to_dicts(self):
        qr = QueryResult(
            columns=["name", "value"],
            rows=[["temp", 78.4], ["pressure", 14.7]],
            row_count=2,
        )
        dicts = qr.to_dicts()
        assert len(dicts) == 2
        assert dicts[0] == {"name": "temp", "value": 78.4}

    def test_query_result_scalar(self):
        qr = QueryResult(columns=["count"], rows=[[42]], row_count=1)
        assert qr.scalar() == 42

    def test_query_result_scalar_empty(self):
        qr = QueryResult(columns=["count"], rows=[], row_count=0)
        assert qr.scalar() is None

    def test_unbound_raises(self):
        mod = DbModule()
        with pytest.raises(RuntimeError, match="No database pool"):
            mod._get_pool()

    def test_named_query_registration(self):
        register_named_query("active_batches", "SELECT * FROM batches WHERE active = true")
        from forge.sdk.scripting.modules.db import _named_queries
        assert "active_batches" in _named_queries


# ===========================================================================
# forge.net
# ===========================================================================


class TestNetModule:

    def test_http_response_ok(self):
        resp = HttpResponse(status_code=200, headers={}, body='{"key": "value"}')
        assert resp.ok is True

    def test_http_response_not_ok(self):
        resp = HttpResponse(status_code=500, headers={}, body="error")
        assert resp.ok is False

    def test_http_response_json(self):
        resp = HttpResponse(status_code=200, headers={}, body='{"key": "value"}')
        assert resp.json() == {"key": "value"}

    def test_http_response_json_data_cached(self):
        resp = HttpResponse(
            status_code=200, headers={}, body="",
            json_data={"already": "parsed"},
        )
        assert resp.json() == {"already": "parsed"}


# ===========================================================================
# forge.log
# ===========================================================================


class TestLogModule:

    def test_get_creates_logger(self):
        mod = LogModule()
        log = mod.get("my_script")
        assert isinstance(log, ForgeLogger)
        assert log.name == "my_script"

    def test_get_returns_same_instance(self):
        mod = LogModule()
        log1 = mod.get("test")
        log2 = mod.get("test")
        assert log1 is log2

    def test_logger_writes_json(self, capsys):
        mod = LogModule()
        log = mod.get("test_json")
        log.info("Temperature reading", tag="TIT_2010", value=78.4)

        captured = capsys.readouterr()
        line = captured.err.strip()
        data = json.loads(line)
        assert data["level"] == "INFO"
        assert data["message"] == "Temperature reading"
        assert data["tag"] == "TIT_2010"
        assert data["value"] == 78.4

    def test_convenience_methods(self, capsys):
        mod = LogModule()
        mod.info("test info")
        mod.warning("test warning")
        mod.error("test error")
        mod.debug("test debug")

        lines = capsys.readouterr().err.strip().split("\n")
        assert len(lines) == 4
        for line in lines:
            data = json.loads(line)
            assert "timestamp" in data


# ===========================================================================
# forge.alarm
# ===========================================================================


class TestAlarmModule:

    def test_unbound_raises(self):
        mod = AlarmModule()
        with pytest.raises(RuntimeError, match="not bound"):
            import asyncio
            asyncio.run(mod.get_active())

    @pytest.mark.asyncio
    async def test_get_active(self):
        mock_engine = MagicMock()
        mock_engine.get_active_alarms = AsyncMock(return_value=[
            {"alarm_id": "a1", "name": "HIGH_TEMP", "state": "ACTIVE_UNACK",
             "priority": "HIGH", "tag_path": "WH/TIT/Out_PV"},
        ])
        mod = AlarmModule()
        mod.bind(mock_engine)

        alarms = await mod.get_active()
        assert len(alarms) == 1
        assert isinstance(alarms[0], AlarmInfo)
        assert alarms[0].alarm_id == "a1"
        assert alarms[0].priority == "HIGH"

    @pytest.mark.asyncio
    async def test_ack(self):
        mock_engine = MagicMock()
        mock_engine.acknowledge_alarm = AsyncMock(return_value=True)
        mod = AlarmModule()
        mod.bind(mock_engine)

        result = await mod.ack("a1", operator="jsmith")
        assert result is True
        mock_engine.acknowledge_alarm.assert_awaited_once_with("a1", operator="jsmith")

    @pytest.mark.asyncio
    async def test_trigger(self):
        mock_engine = MagicMock()
        mock_engine.trigger_alarm = AsyncMock(return_value="alarm-uuid-123")
        mod = AlarmModule()
        mod.bind(mock_engine)

        alarm_id = await mod.trigger(
            "HIGH_TEMP", tag_path="WH/TIT/Out_PV", priority="HIGH",
            value=185.0, setpoint=180.0,
        )
        assert alarm_id == "alarm-uuid-123"
