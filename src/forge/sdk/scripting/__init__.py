"""Forge Scripting SDK — Python 3.12+ scripting engine for Forge modules.

Replaces Ignition's Jython 2.7 scripting with modern, typed, async-capable
Python.  Any Forge module can embed the scripting engine to allow users to
define event-driven scripts using ``@forge.*`` decorators.

Architecture
────────────

    ScriptEngine        Discovers .py files, parses decorators, registers handlers
    Sandbox             Import allowlist, CPU/memory limits, audit trail
    TriggerRegistry     Decorator → handler mapping for tag_change, timer, event, alarm, api

    forge.tag           Tag read/write/browse/subscribe  (→ TagRegistry)
    forge.db            SQL query/named_query/transaction (→ connection pool)
    forge.net           HTTP client (async, typed)
    forge.log           Structured JSON logging
    forge.alarm         ISA-18.2 alarm interface

Usage (in a module's startup)::

    from forge.sdk.scripting import ScriptEngine

    engine = ScriptEngine(scripts_dir="scripts/", module_name="ot")
    await engine.discover()
    await engine.start()

Usage (in a user script)::

    import forge

    @forge.on_tag_change("WH/WHK01/Distillery01/*/Out_PV")
    async def on_temp_change(event):
        if event.new_value > 170.0:
            forge.log.warning(f"High temp: {event.tag_path} = {event.new_value}")
            await forge.alarm.trigger("HIGH_TEMP", tag_path=event.tag_path)
"""

from forge.sdk.scripting.engine import ScriptEngine
from forge.sdk.scripting.sandbox import ScriptSandbox
from forge.sdk.scripting.triggers import TriggerRegistry

__all__ = ["ScriptEngine", "ScriptSandbox", "TriggerRegistry"]
