"""Integration test: Script engine + RBAC + audit trail.

Tests the full script lifecycle: load script → dispatch event →
handler invoked with execution context → audit trail records operation.
"""

import pytest
from pathlib import Path

from forge.sdk.scripting.engine import ScriptEngine
from forge.sdk.scripting.rbac import ScriptRBAC, ScriptPermission
from forge.sdk.scripting.audit import (
    ScriptAuditTrail,
    get_execution_context,
    clear_execution_context,
)


def _write_script(scripts_dir: Path, name: str, content: str) -> Path:
    path = scripts_dir / f"{name}.py"
    path.write_text(content)
    return path


OWNER_SCRIPT = """\
__forge_owner__ = "commissioning"

from forge.sdk.scripting.triggers import on_tag_change

received_contexts = []

@on_tag_change("WH/WHK01/Distillery01/*/Out_PV")
async def on_temp_change(event):
    # Record the context that was set before handler invocation
    from forge.sdk.scripting.audit import get_execution_context
    ctx = get_execution_context()
    received_contexts.append({
        "script_name": ctx.script_name,
        "script_owner": ctx.script_owner,
        "handler_name": ctx.handler_name,
        "trigger_type": ctx.trigger_type,
        "trigger_detail": ctx.trigger_detail,
    })
"""

DEFAULT_OWNER_SCRIPT = """\
from forge.sdk.scripting.triggers import on_event

received = []

@on_event("startup")
async def on_startup(event):
    received.append(event.event_type)
"""


class TestScriptWithRBAC:
    """Integration: script loading extracts __forge_owner__."""

    @pytest.mark.asyncio
    async def test_owner_extracted_from_script(self, tmp_path):
        scripts = tmp_path / "scripts"
        scripts.mkdir()
        _write_script(scripts, "temp_monitor", OWNER_SCRIPT)

        rbac = ScriptRBAC()
        rbac.grant(ScriptPermission(
            owner="commissioning",
            area_pattern="Distillery01",
            tag_pattern="WH/WHK01/Distillery01/**",
        ))

        engine = ScriptEngine(
            scripts_dir=scripts, module_name="test",
            rbac=rbac, default_owner="system",
        )
        await engine.start()

        info = engine._scripts["temp_monitor"]
        assert info.owner == "commissioning"

        # Verify RBAC check would pass for this owner
        result = rbac.check_tag_write(
            "commissioning",
            "WH/WHK01/Distillery01/TIT/Out_PV",
            area="Distillery01",
        )
        assert result.allowed is True

        await engine.stop()

    @pytest.mark.asyncio
    async def test_default_owner_when_not_specified(self, tmp_path):
        scripts = tmp_path / "scripts"
        scripts.mkdir()
        _write_script(scripts, "startup_handler", DEFAULT_OWNER_SCRIPT)

        engine = ScriptEngine(
            scripts_dir=scripts, module_name="test",
            default_owner="system",
        )
        await engine.start()

        info = engine._scripts["startup_handler"]
        assert info.owner == "system"

        await engine.stop()


class TestScriptExecutionContext:
    """Integration: dispatch sets execution context for handlers."""

    @pytest.mark.asyncio
    async def test_tag_change_sets_context(self, tmp_path):
        scripts = tmp_path / "scripts"
        scripts.mkdir()
        _write_script(scripts, "temp_monitor", OWNER_SCRIPT)

        engine = ScriptEngine(
            scripts_dir=scripts, module_name="test",
            default_owner="system",
        )
        await engine.start()

        count = await engine.dispatch_tag_change(
            tag_path="WH/WHK01/Distillery01/TIT_2010/Out_PV",
            old_value=77.0,
            new_value=78.4,
            quality="GOOD",
            timestamp="2026-04-08T12:00:00Z",
        )
        assert count == 1

        # Verify the handler captured the execution context
        mod = engine._scripts["temp_monitor"].module
        assert len(mod.received_contexts) == 1
        ctx = mod.received_contexts[0]
        assert ctx["script_name"] == "temp_monitor"
        assert ctx["script_owner"] == "commissioning"
        assert ctx["handler_name"] == "on_temp_change"
        assert ctx["trigger_type"] == "tag_change"
        assert "WH/WHK01/Distillery01/TIT_2010/Out_PV" in ctx["trigger_detail"]

        # Context should be cleared after handler
        current = get_execution_context()
        assert current.script_name == ""

        await engine.stop()

    @pytest.mark.asyncio
    async def test_lifecycle_event_sets_context(self, tmp_path):
        scripts = tmp_path / "scripts"
        scripts.mkdir()

        script = """\
from forge.sdk.scripting.triggers import on_event
from forge.sdk.scripting.audit import get_execution_context

captured = []

@on_event("startup")
async def on_startup(event):
    ctx = get_execution_context()
    captured.append(ctx.trigger_type)
"""
        _write_script(scripts, "lifecycle", script)

        engine = ScriptEngine(scripts_dir=scripts, module_name="test")
        await engine.start()

        await engine.dispatch_lifecycle_event("startup")

        mod = engine._scripts["lifecycle"].module
        assert mod.captured == ["event"]

        await engine.stop()

    @pytest.mark.asyncio
    async def test_alarm_dispatch_sets_context(self, tmp_path):
        scripts = tmp_path / "scripts"
        scripts.mkdir()

        script = """\
from forge.sdk.scripting.triggers import on_alarm
from forge.sdk.scripting.audit import get_execution_context

captured = []

@on_alarm(priorities=["CRITICAL"])
async def on_critical(event):
    ctx = get_execution_context()
    captured.append({
        "trigger_type": ctx.trigger_type,
        "trigger_detail": ctx.trigger_detail,
    })
"""
        _write_script(scripts, "alarm_handler", script)

        engine = ScriptEngine(scripts_dir=scripts, module_name="test")
        await engine.start()

        await engine.dispatch_alarm_event(
            alarm_id="a1", alarm_name="HIGH_TEMP",
            state="ACTIVE_UNACK", priority="CRITICAL",
            tag_path="WH/TIT/Out_PV", value=185.0, setpoint=180.0,
            timestamp="2026-04-08T12:00:00Z",
        )

        mod = engine._scripts["alarm_handler"].module
        assert len(mod.captured) == 1
        assert mod.captured[0]["trigger_type"] == "alarm"
        assert mod.captured[0]["trigger_detail"] == "HIGH_TEMP"

        await engine.stop()


class TestScriptWithAuditTrail:
    """Integration: audit trail records operations from script context."""

    @pytest.mark.asyncio
    async def test_audit_records_with_script_context(self, tmp_path):
        scripts = tmp_path / "scripts"
        scripts.mkdir()

        script = """\
__forge_owner__ = "commissioning"
from forge.sdk.scripting.triggers import on_tag_change

@on_tag_change("WH/**")
async def handler(event):
    # Simulate a tag write that would be audited
    from forge.sdk.scripting.audit import get_execution_context
    ctx = get_execution_context()
    # Store for test verification
    import sys
    sys.modules[__name__]._last_ctx = ctx
"""
        _write_script(scripts, "audited_script", script)

        audit = ScriptAuditTrail()
        engine = ScriptEngine(
            scripts_dir=scripts, module_name="test",
            audit=audit, default_owner="system",
        )
        await engine.start()

        await engine.dispatch_tag_change(
            tag_path="WH/WHK01/TIT/Out_PV",
            old_value=77.0, new_value=78.4,
            quality="GOOD", timestamp="2026-04-08T12:00:00Z",
        )

        # The handler stored the context; now simulate what forge.tag.write() would do
        mod = engine._scripts["audited_script"].module
        ctx = mod._last_ctx

        # Record an audit entry as if forge.tag.write() was called
        from forge.sdk.scripting.audit import set_execution_context, clear_execution_context
        set_execution_context(ctx)
        entry = audit.record_tag_write(
            "WH/WHK01/TIT/Setpoint", old_value=80.0, new_value=82.0,
        )
        clear_execution_context()

        assert entry.script_name == "audited_script"
        assert entry.script_owner == "commissioning"
        assert entry.handler_name == "handler"
        assert entry.trigger_type == "tag_change"
        assert audit.total_entries == 1

        await engine.stop()
