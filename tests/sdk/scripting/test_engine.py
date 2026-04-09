"""Tests for the ScriptEngine — discovery, loading, dispatch, hot-reload."""

import asyncio
import pytest
import time
from pathlib import Path

from forge.sdk.scripting.engine import ScriptEngine, ScriptInfo
from forge.sdk.scripting.triggers import TriggerRegistry, TriggerType


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _write_script(scripts_dir: Path, name: str, content: str) -> Path:
    """Write a script file to the scripts directory."""
    path = scripts_dir / f"{name}.py"
    path.write_text(content)
    return path


BASIC_SCRIPT = """\
from forge.sdk.scripting.triggers import on_tag_change, timer, on_event

@on_tag_change("WH/WHK01/Distillery01/*/Out_PV")
async def on_temp_change(event):
    pass

@timer("30s")
async def check_temps():
    pass

@on_event("startup")
async def on_startup(event):
    pass
"""

ALARM_SCRIPT = """\
from forge.sdk.scripting.triggers import on_alarm

@on_alarm(priorities=["CRITICAL", "HIGH"])
async def on_critical(event):
    pass
"""

ERROR_SCRIPT = """\
raise RuntimeError("Script load failure!")
"""


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------


class TestDiscovery:

    def test_discover_finds_scripts(self, tmp_path):
        scripts = tmp_path / "scripts"
        scripts.mkdir()
        _write_script(scripts, "temp_monitor", BASIC_SCRIPT)
        _write_script(scripts, "alarm_handler", ALARM_SCRIPT)

        engine = ScriptEngine(scripts_dir=scripts, module_name="test")
        discovered = engine.discover()
        assert sorted(discovered) == ["alarm_handler", "temp_monitor"]

    def test_discover_skips_underscore_files(self, tmp_path):
        scripts = tmp_path / "scripts"
        scripts.mkdir()
        _write_script(scripts, "_private", BASIC_SCRIPT)
        _write_script(scripts, "__init__", "")
        _write_script(scripts, "public", BASIC_SCRIPT)

        engine = ScriptEngine(scripts_dir=scripts, module_name="test")
        discovered = engine.discover()
        assert discovered == ["public"]

    def test_discover_missing_dir_returns_empty(self, tmp_path):
        engine = ScriptEngine(scripts_dir=tmp_path / "nonexistent", module_name="test")
        discovered = engine.discover()
        assert discovered == []

    def test_discover_empty_dir(self, tmp_path):
        scripts = tmp_path / "scripts"
        scripts.mkdir()
        engine = ScriptEngine(scripts_dir=scripts, module_name="test")
        discovered = engine.discover()
        assert discovered == []


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------


class TestLoading:

    def test_load_script_registers_handlers(self, tmp_path):
        scripts = tmp_path / "scripts"
        scripts.mkdir()
        _write_script(scripts, "temp_monitor", BASIC_SCRIPT)

        engine = ScriptEngine(scripts_dir=scripts, module_name="test")
        engine.discover()
        info = engine.load_script("temp_monitor")

        assert info.is_loaded
        assert info.handler_count == 3
        assert info.errors == []
        assert engine.registry.count == 3

    def test_load_script_error_records_error(self, tmp_path):
        scripts = tmp_path / "scripts"
        scripts.mkdir()
        _write_script(scripts, "broken", ERROR_SCRIPT)

        engine = ScriptEngine(scripts_dir=scripts, module_name="test")
        engine.discover()
        info = engine.load_script("broken")

        assert not info.is_loaded
        assert info.handler_count == 0
        assert len(info.errors) == 1
        assert "Script load failure" in info.errors[0]

    def test_load_all(self, tmp_path):
        scripts = tmp_path / "scripts"
        scripts.mkdir()
        _write_script(scripts, "temp_monitor", BASIC_SCRIPT)
        _write_script(scripts, "alarm_handler", ALARM_SCRIPT)

        engine = ScriptEngine(scripts_dir=scripts, module_name="test")
        engine.discover()
        result = engine.load_all()

        assert len(result) == 2
        assert engine.registry.count == 4  # 3 from basic + 1 from alarm

    def test_load_unknown_script_raises(self, tmp_path):
        engine = ScriptEngine(scripts_dir=tmp_path, module_name="test")
        with pytest.raises(ValueError, match="Unknown script"):
            engine.load_script("nonexistent")


# ---------------------------------------------------------------------------
# Reload
# ---------------------------------------------------------------------------


class TestReload:

    def test_reload_replaces_handlers(self, tmp_path):
        scripts = tmp_path / "scripts"
        scripts.mkdir()
        _write_script(scripts, "monitor", BASIC_SCRIPT)

        engine = ScriptEngine(scripts_dir=scripts, module_name="test")
        engine.discover()
        engine.load_script("monitor")
        assert engine.registry.count == 3

        # Modify: remove one handler, add alarm handler
        updated = """\
from forge.sdk.scripting.triggers import on_tag_change

@on_tag_change("WH/**")
async def simplified(event):
    pass
"""
        _write_script(scripts, "monitor", updated)
        engine.load_script("monitor")

        assert engine.registry.count == 1
        regs = engine.registry.get_by_type(TriggerType.TAG_CHANGE)
        assert len(regs) == 1
        assert regs[0].handler_name == "simplified"


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------


class TestDispatch:

    @pytest.mark.asyncio
    async def test_dispatch_tag_change(self, tmp_path):
        scripts = tmp_path / "scripts"
        scripts.mkdir()

        # Script that records calls
        script = """\
from forge.sdk.scripting.triggers import on_tag_change

received = []

@on_tag_change("WH/WHK01/Distillery01/*/Out_PV")
async def handler(event):
    received.append(event)
"""
        _write_script(scripts, "recorder", script)

        engine = ScriptEngine(scripts_dir=scripts, module_name="test")
        await engine.start()

        count = await engine.dispatch_tag_change(
            tag_path="WH/WHK01/Distillery01/TIT_2010/Out_PV",
            old_value=77.0,
            new_value=78.4,
            quality="GOOD",
            timestamp="2026-04-08T12:00:00Z",
        )
        assert count == 1

        # Verify the handler received the event
        mod = engine._scripts["recorder"].module
        assert len(mod.received) == 1
        assert mod.received[0].new_value == 78.4

        await engine.stop()

    @pytest.mark.asyncio
    async def test_dispatch_tag_change_no_match(self, tmp_path):
        scripts = tmp_path / "scripts"
        scripts.mkdir()
        _write_script(scripts, "monitor", BASIC_SCRIPT)

        engine = ScriptEngine(scripts_dir=scripts, module_name="test")
        await engine.start()

        count = await engine.dispatch_tag_change(
            tag_path="WH/WHK01/Granary01/FIT_1010/Out_PV",
            old_value=0, new_value=1, quality="GOOD", timestamp="",
        )
        assert count == 0
        await engine.stop()

    @pytest.mark.asyncio
    async def test_dispatch_lifecycle_event(self, tmp_path):
        scripts = tmp_path / "scripts"
        scripts.mkdir()

        script = """\
from forge.sdk.scripting.triggers import on_event

started = False

@on_event("startup")
async def handler(event):
    global started
    started = True
"""
        _write_script(scripts, "lifecycle", script)

        engine = ScriptEngine(scripts_dir=scripts, module_name="test")
        await engine.start()

        count = await engine.dispatch_lifecycle_event("startup")
        assert count == 1

        mod = engine._scripts["lifecycle"].module
        assert mod.started is True
        await engine.stop()

    @pytest.mark.asyncio
    async def test_dispatch_alarm_event(self, tmp_path):
        scripts = tmp_path / "scripts"
        scripts.mkdir()

        script = """\
from forge.sdk.scripting.triggers import on_alarm

received = []

@on_alarm(priorities=["CRITICAL"])
async def handler(event):
    received.append(event)
"""
        _write_script(scripts, "alarm_handler", script)

        engine = ScriptEngine(scripts_dir=scripts, module_name="test")
        await engine.start()

        count = await engine.dispatch_alarm_event(
            alarm_id="a1", alarm_name="HIGH_TEMP",
            state="ACTIVE_UNACK", priority="CRITICAL",
            tag_path="WH/TIT/Out_PV", value=185.0, setpoint=180.0,
            timestamp="2026-04-08T12:00:00Z",
        )
        assert count == 1

        mod = engine._scripts["alarm_handler"].module
        assert len(mod.received) == 1
        await engine.stop()


# ---------------------------------------------------------------------------
# Hot reload detection
# ---------------------------------------------------------------------------


class TestHotReload:

    @pytest.mark.asyncio
    async def test_check_for_changes_detects_modified(self, tmp_path):
        scripts = tmp_path / "scripts"
        scripts.mkdir()
        path = _write_script(scripts, "monitor", BASIC_SCRIPT)

        engine = ScriptEngine(scripts_dir=scripts, module_name="test")
        await engine.start()
        assert engine.registry.count == 3

        # Simulate file modification
        time.sleep(0.05)  # Ensure mtime changes
        path.write_text(ALARM_SCRIPT)

        reloaded = await engine.check_for_changes()
        assert "monitor" in reloaded
        # Should now have 1 alarm handler instead of 3 basic handlers
        assert engine.registry.count == 1

        await engine.stop()

    @pytest.mark.asyncio
    async def test_check_for_changes_detects_new_file(self, tmp_path):
        scripts = tmp_path / "scripts"
        scripts.mkdir()
        _write_script(scripts, "existing", BASIC_SCRIPT)

        engine = ScriptEngine(scripts_dir=scripts, module_name="test")
        await engine.start()
        assert engine.script_count == 1

        # Add new file
        _write_script(scripts, "new_script", ALARM_SCRIPT)
        reloaded = await engine.check_for_changes()
        assert "new_script" in reloaded
        assert engine.script_count == 2

        await engine.stop()


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------


class TestStatus:

    @pytest.mark.asyncio
    async def test_get_status(self, tmp_path):
        scripts = tmp_path / "scripts"
        scripts.mkdir()
        _write_script(scripts, "monitor", BASIC_SCRIPT)

        engine = ScriptEngine(scripts_dir=scripts, module_name="test")
        await engine.start()

        status = engine.get_status()
        assert status["started"] is True
        assert status["total_scripts"] == 1
        assert status["loaded_scripts"] == 1
        assert status["total_handlers"] == 3
        assert "monitor" in status["scripts"]
        assert status["scripts"]["monitor"]["loaded"] is True
        assert status["scripts"]["monitor"]["handlers"] == 3

        await engine.stop()
