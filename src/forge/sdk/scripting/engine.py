"""ScriptEngine — discovers, loads, and manages user scripts.

The engine is the runtime host for Forge scripts.  It:
    1. Discovers .py files in a configured scripts directory
    2. Imports each file as a Python module
    3. Collects handler registrations (via TriggerRegistry)
    4. Wires handlers to runtime event sources (tag changes, timers, etc.)
    5. Monitors the scripts directory for changes (hot-reload)

Design decisions:
    D1: Scripts are plain .py files — no compilation, no bytecode caching.
        This keeps the DX simple: edit a file, save, see the change.
    D2: Each script is imported as a unique module using importlib.
        Module names are derived from file paths to avoid collisions.
    D3: Hot-reload is atomic: unregister all old handlers from a script,
        re-import the module, register new handlers.  No partial state.
    D4: The engine does NOT depend on the OT module specifically.  Any
        Forge module can instantiate a ScriptEngine with its own event
        sources.
"""

from __future__ import annotations

import asyncio
import importlib.util
import logging
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from types import ModuleType
from typing import Any, Callable

from forge.sdk.scripting.audit import (
    ScriptAuditTrail,
    ScriptExecutionContext,
    set_execution_context,
    clear_execution_context,
)
from forge.sdk.scripting.rbac import ScriptRBAC
from forge.sdk.scripting.sandbox import ScriptSandbox, SandboxConfig
from forge.sdk.scripting.triggers import (
    HandlerRegistration,
    TriggerRegistry,
    TriggerType,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Script metadata
# ---------------------------------------------------------------------------


@dataclass
class ScriptInfo:
    """Metadata about a loaded script file."""

    name: str
    path: Path
    module: ModuleType | None = None
    owner: str = ""  # From __forge_owner__ attribute or default
    handler_count: int = 0
    load_time: float = 0.0
    last_loaded: float = 0.0
    last_modified: float = 0.0
    errors: list[str] = field(default_factory=list)

    @property
    def is_loaded(self) -> bool:
        return self.module is not None

    @property
    def is_stale(self) -> bool:
        """True if the file has been modified since last load."""
        if not self.path.exists():
            return False
        return self.path.stat().st_mtime > self.last_modified


# ---------------------------------------------------------------------------
# ScriptEngine
# ---------------------------------------------------------------------------


class ScriptEngine:
    """Discovers, loads, and manages Forge user scripts.

    Args:
        scripts_dir: Path to the directory containing .py script files.
        module_name: Name of the owning module (for namespacing).
        sandbox_config: Optional sandbox configuration.
        trigger_registry: Optional shared TriggerRegistry (created if None).
    """

    def __init__(
        self,
        scripts_dir: str | Path,
        module_name: str = "default",
        sandbox_config: SandboxConfig | None = None,
        trigger_registry: TriggerRegistry | None = None,
        rbac: ScriptRBAC | None = None,
        audit: ScriptAuditTrail | None = None,
        default_owner: str = "system",
    ) -> None:
        self._scripts_dir = Path(scripts_dir)
        self._module_name = module_name
        self._sandbox = ScriptSandbox(sandbox_config)
        self._registry = trigger_registry or TriggerRegistry()
        self._rbac = rbac or ScriptRBAC()
        self._audit = audit or ScriptAuditTrail()
        self._default_owner = default_owner
        self._scripts: dict[str, ScriptInfo] = {}
        self._started = False
        self._watcher_task: asyncio.Task | None = None

        # Timer tasks managed by the engine
        self._timer_tasks: dict[str, asyncio.Task] = {}

        # External event sources wired by the consuming module
        self._tag_change_callback: Callable | None = None
        self._lifecycle_callback: Callable | None = None

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def scripts_dir(self) -> Path:
        return self._scripts_dir

    @property
    def module_name(self) -> str:
        return self._module_name

    @property
    def registry(self) -> TriggerRegistry:
        return self._registry

    @property
    def sandbox(self) -> ScriptSandbox:
        return self._sandbox

    @property
    def rbac(self) -> ScriptRBAC:
        return self._rbac

    @property
    def audit(self) -> ScriptAuditTrail:
        return self._audit

    @property
    def script_count(self) -> int:
        return len(self._scripts)

    @property
    def loaded_scripts(self) -> list[ScriptInfo]:
        return [s for s in self._scripts.values() if s.is_loaded]

    @property
    def is_started(self) -> bool:
        return self._started

    # ------------------------------------------------------------------
    # Discovery
    # ------------------------------------------------------------------

    def discover(self) -> list[str]:
        """Scan the scripts directory for .py files.

        Returns list of discovered script names (without .py extension).
        Does not load the scripts — call ``load_all()`` or ``start()`` for that.
        """
        if not self._scripts_dir.exists():
            logger.warning("Scripts directory does not exist: %s", self._scripts_dir)
            return []

        discovered = []
        for py_file in sorted(self._scripts_dir.glob("*.py")):
            if py_file.name.startswith("_"):
                continue  # Skip __init__.py, __pycache__, etc.
            name = py_file.stem
            if name not in self._scripts:
                self._scripts[name] = ScriptInfo(
                    name=name,
                    path=py_file,
                    last_modified=py_file.stat().st_mtime,
                )
            discovered.append(name)

        logger.info(
            "Discovered %d scripts in %s", len(discovered), self._scripts_dir
        )
        return discovered

    # ------------------------------------------------------------------
    # Loading
    # ------------------------------------------------------------------

    def load_script(self, name: str) -> ScriptInfo:
        """Load (or reload) a single script by name.

        Steps:
            1. Unregister old handlers (if reloading)
            2. Import the .py file as a Python module
            3. Collect handler registrations from decorators
            4. Update ScriptInfo metadata
        """
        info = self._scripts.get(name)
        if info is None:
            raise ValueError(f"Unknown script: {name!r}. Call discover() first.")

        # Step 1: Unregister old handlers
        if info.is_loaded:
            removed = self._registry.clear_script(name)
            logger.debug("Unregistered %d old handlers from %s", removed, name)

        # Step 2: Import
        start = time.monotonic()
        try:
            module = self._import_script(info.path, name)
        except Exception as exc:
            info.errors.append(str(exc))
            info.module = None
            info.handler_count = 0
            logger.error("Failed to load script %s: %s", name, exc)
            return info

        # Step 3: Collect handlers
        handler_count = self._registry.collect_from_module(
            module, script_name=name, script_path=str(info.path)
        )

        # Step 3b: Extract owner from script module
        info.owner = getattr(module, "__forge_owner__", self._default_owner)

        # Step 4: Update metadata
        elapsed = time.monotonic() - start
        info.module = module
        info.handler_count = handler_count
        info.load_time = elapsed
        info.last_loaded = time.time()
        info.last_modified = info.path.stat().st_mtime
        info.errors.clear()

        logger.info(
            "Loaded script %s (%d handlers, %.1fms)",
            name, handler_count, elapsed * 1000,
        )
        return info

    def load_all(self) -> dict[str, ScriptInfo]:
        """Load all discovered scripts.  Returns name → ScriptInfo."""
        for name in list(self._scripts.keys()):
            self.load_script(name)
        return dict(self._scripts)

    def _import_script(self, path: Path, name: str) -> ModuleType:
        """Import a .py file as a module using importlib."""
        module_name = f"forge_scripts.{self._module_name}.{name}"

        # Remove stale module from sys.modules (for reload)
        sys.modules.pop(module_name, None)

        spec = importlib.util.spec_from_file_location(module_name, path)
        if spec is None or spec.loader is None:
            raise ImportError(f"Cannot create module spec for {path}")

        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
        return module

    # ------------------------------------------------------------------
    # Start / Stop
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Discover, load all scripts, and start timer tasks."""
        self.discover()
        self.load_all()
        self._start_timers()
        self._started = True
        logger.info(
            "ScriptEngine started: %d scripts, %d handlers",
            self.script_count,
            self._registry.count,
        )

    async def stop(self) -> None:
        """Stop all timer tasks and the file watcher."""
        self._stop_timers()
        if self._watcher_task and not self._watcher_task.done():
            self._watcher_task.cancel()
            try:
                await self._watcher_task
            except asyncio.CancelledError:
                pass
        self._started = False
        logger.info("ScriptEngine stopped")

    # ------------------------------------------------------------------
    # Timer management
    # ------------------------------------------------------------------

    def _start_timers(self) -> None:
        """Create asyncio tasks for all @forge.timer handlers."""
        for reg in self._registry.get_by_type(TriggerType.TIMER):
            if reg.interval is None:
                continue
            task_key = f"{reg.script_name}:{reg.handler_name}"
            if task_key in self._timer_tasks:
                self._timer_tasks[task_key].cancel()
            task = asyncio.create_task(
                self._run_timer(reg), name=f"forge-timer-{task_key}"
            )
            self._timer_tasks[task_key] = task

    def _stop_timers(self) -> None:
        """Cancel all running timer tasks."""
        for task in self._timer_tasks.values():
            task.cancel()
        self._timer_tasks.clear()

    async def _run_timer(self, reg: HandlerRegistration) -> None:
        """Run a timer handler on the configured interval."""
        interval = reg.interval.total_seconds() if reg.interval else 1.0
        while True:
            try:
                await asyncio.sleep(interval)
                script_info = self._scripts.get(reg.script_name)
                owner = script_info.owner if script_info else self._default_owner
                ctx = ScriptExecutionContext(
                    script_name=reg.script_name,
                    script_owner=owner,
                    handler_name=reg.handler_name,
                    trigger_type="timer",
                    trigger_detail=f"{interval}s",
                )
                set_execution_context(ctx)
                try:
                    if asyncio.iscoroutinefunction(reg.handler):
                        await reg.handler()
                    else:
                        reg.handler()
                finally:
                    clear_execution_context()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error(
                    "Timer handler %s.%s failed: %s",
                    reg.script_name, reg.handler_name, exc,
                )

    # ------------------------------------------------------------------
    # Hot reload
    # ------------------------------------------------------------------

    async def check_for_changes(self) -> list[str]:
        """Check for modified scripts and reload them.

        Returns list of script names that were reloaded.
        """
        reloaded = []
        for name, info in self._scripts.items():
            if info.is_stale:
                logger.info("Script %s modified, reloading...", name)
                self.load_script(name)
                reloaded.append(name)

        # Check for new files
        if self._scripts_dir.exists():
            for py_file in self._scripts_dir.glob("*.py"):
                if py_file.name.startswith("_"):
                    continue
                name = py_file.stem
                if name not in self._scripts:
                    self._scripts[name] = ScriptInfo(
                        name=name,
                        path=py_file,
                        last_modified=py_file.stat().st_mtime,
                    )
                    self.load_script(name)
                    reloaded.append(name)

        if reloaded:
            # Restart timers to pick up new/changed timer handlers
            self._stop_timers()
            self._start_timers()

        return reloaded

    async def start_watcher(self, poll_interval: float = 2.0) -> None:
        """Start a background task that polls for script changes.

        For production use, consider watchfiles for inotify-based watching.
        This polling approach is simple and works everywhere.
        """
        self._watcher_task = asyncio.create_task(
            self._watch_loop(poll_interval), name="forge-script-watcher"
        )

    async def _watch_loop(self, interval: float) -> None:
        """Polling loop for script changes."""
        while True:
            try:
                await asyncio.sleep(interval)
                await self.check_for_changes()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Script watcher error: %s", exc)

    # ------------------------------------------------------------------
    # Event dispatch
    # ------------------------------------------------------------------

    async def dispatch_tag_change(
        self,
        tag_path: str,
        old_value: Any,
        new_value: Any,
        quality: str,
        timestamp: str,
        area: str | None = None,
        equipment_id: str | None = None,
    ) -> int:
        """Dispatch a tag change event to matching handlers.

        Returns the number of handlers invoked.
        """
        from forge.sdk.scripting.triggers import TagChangeEvent

        event = TagChangeEvent(
            tag_path=tag_path,
            old_value=old_value,
            new_value=new_value,
            quality=quality,
            timestamp=timestamp,
            area=area,
            equipment_id=equipment_id,
        )

        handlers = self._registry.get_tag_change_handlers(tag_path)
        invoked = 0
        for reg in handlers:
            script_info = self._scripts.get(reg.script_name)
            owner = script_info.owner if script_info else self._default_owner
            ctx = ScriptExecutionContext(
                script_name=reg.script_name,
                script_owner=owner,
                handler_name=reg.handler_name,
                trigger_type="tag_change",
                trigger_detail=tag_path,
            )
            set_execution_context(ctx)
            try:
                if asyncio.iscoroutinefunction(reg.handler):
                    await reg.handler(event)
                else:
                    reg.handler(event)
                invoked += 1
            except Exception as exc:
                logger.error(
                    "Tag change handler %s.%s failed for %s: %s",
                    reg.script_name, reg.handler_name, tag_path, exc,
                )
            finally:
                clear_execution_context()
        return invoked

    async def dispatch_lifecycle_event(self, event_type: str, detail: dict[str, Any] | None = None) -> int:
        """Dispatch a lifecycle event to matching handlers.

        Returns the number of handlers invoked.
        """
        from forge.sdk.scripting.triggers import LifecycleEvent

        event = LifecycleEvent(event_type=event_type, detail=detail or {})
        handlers = self._registry.get_by_type(TriggerType.EVENT)
        invoked = 0
        for reg in handlers:
            if reg.event_types and event_type not in reg.event_types:
                continue
            script_info = self._scripts.get(reg.script_name)
            owner = script_info.owner if script_info else self._default_owner
            ctx = ScriptExecutionContext(
                script_name=reg.script_name,
                script_owner=owner,
                handler_name=reg.handler_name,
                trigger_type="event",
                trigger_detail=event_type,
            )
            set_execution_context(ctx)
            try:
                if asyncio.iscoroutinefunction(reg.handler):
                    await reg.handler(event)
                else:
                    reg.handler(event)
                invoked += 1
            except Exception as exc:
                logger.error(
                    "Lifecycle handler %s.%s failed for %s: %s",
                    reg.script_name, reg.handler_name, event_type, exc,
                )
            finally:
                clear_execution_context()
        return invoked

    async def dispatch_alarm_event(
        self,
        alarm_id: str,
        alarm_name: str,
        state: str,
        priority: str,
        tag_path: str,
        value: Any,
        setpoint: Any,
        timestamp: str,
        area: str | None = None,
        equipment_id: str | None = None,
    ) -> int:
        """Dispatch an alarm event to matching handlers.

        Returns the number of handlers invoked.
        """
        from forge.sdk.scripting.triggers import AlarmEvent

        event = AlarmEvent(
            alarm_id=alarm_id,
            alarm_name=alarm_name,
            state=state,
            priority=priority,
            tag_path=tag_path,
            value=value,
            setpoint=setpoint,
            timestamp=timestamp,
            area=area,
            equipment_id=equipment_id,
        )

        handlers = self._registry.get_alarm_handlers(
            priority=priority, area=area or "", name=alarm_name
        )
        invoked = 0
        for reg in handlers:
            script_info = self._scripts.get(reg.script_name)
            owner = script_info.owner if script_info else self._default_owner
            ctx = ScriptExecutionContext(
                script_name=reg.script_name,
                script_owner=owner,
                handler_name=reg.handler_name,
                trigger_type="alarm",
                trigger_detail=alarm_name,
            )
            set_execution_context(ctx)
            try:
                if asyncio.iscoroutinefunction(reg.handler):
                    await reg.handler(event)
                else:
                    reg.handler(event)
                invoked += 1
            except Exception as exc:
                logger.error(
                    "Alarm handler %s.%s failed for %s: %s",
                    reg.script_name, reg.handler_name, alarm_name, exc,
                )
            finally:
                clear_execution_context()
        return invoked

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    def get_status(self) -> dict[str, Any]:
        """Return engine status for monitoring/API."""
        return {
            "started": self._started,
            "scripts_dir": str(self._scripts_dir),
            "module_name": self._module_name,
            "total_scripts": self.script_count,
            "loaded_scripts": len(self.loaded_scripts),
            "total_handlers": self._registry.count,
            "active_timers": len(self._timer_tasks),
            "sandbox_active": self._sandbox.is_active,
            "scripts": {
                name: {
                    "loaded": info.is_loaded,
                    "handlers": info.handler_count,
                    "load_time_ms": round(info.load_time * 1000, 1),
                    "errors": info.errors,
                }
                for name, info in self._scripts.items()
            },
        }
