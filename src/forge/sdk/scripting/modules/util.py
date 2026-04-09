"""forge.util — General utilities SDK module.

Replaces Ignition's ``system.util.*`` functions that don't have a
dedicated forge.* module (logging → forge.log, HTTP → forge.net, etc.).

This module covers:
    - JSON encode/decode (replaces system.util.jsonEncode/jsonDecode)
    - Project/environment info (replaces system.util.getProjectName, etc.)
    - Async task execution (replaces system.util.invokeAsynchronous)
    - Global variable storage (replaces system.util.getGlobals)
    - Message sending (replaces system.util.sendMessage)

Usage in scripts::

    import forge

    data = forge.util.json_decode('{"key": "value"}')
    text = forge.util.json_encode(data)
    project = forge.util.get_project_name()
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Callable

logger = logging.getLogger("forge.util")


# ---------------------------------------------------------------------------
# UtilModule
# ---------------------------------------------------------------------------


class UtilModule:
    """The forge.util SDK module — general utilities."""

    def __init__(self) -> None:
        self._project_name: str = "forge"
        self._module_name: str = ""
        self._globals: dict[str, Any] = {}
        self._message_handlers: dict[str, list[Callable]] = {}
        self._scope: str = "GATEWAY"  # GATEWAY, CLIENT, DESIGNER

    def bind(
        self,
        project_name: str = "forge",
        module_name: str = "",
        scope: str = "GATEWAY",
    ) -> None:
        """Bind utility configuration.

        Args:
            project_name: The Forge project/module name.
            module_name: The specific module name.
            scope: Execution scope ("GATEWAY", "CLIENT", "DESIGNER").
        """
        self._project_name = project_name
        self._module_name = module_name
        self._scope = scope
        logger.debug("forge.util bound (project=%s, scope=%s)", project_name, scope)

    # ------------------------------------------------------------------
    # JSON
    # ------------------------------------------------------------------

    def json_encode(self, obj: Any, *, indent: int | None = None) -> str:
        """Encode a Python object to a JSON string.

        Replaces: ``system.util.jsonEncode(obj)``
        """
        return json.dumps(obj, default=str, indent=indent)

    def json_decode(self, text: str) -> Any:
        """Decode a JSON string to a Python object.

        Replaces: ``system.util.jsonDecode(jsonString)``
        """
        return json.loads(text)

    # ------------------------------------------------------------------
    # Project / environment info
    # ------------------------------------------------------------------

    def get_project_name(self) -> str:
        """Get the current project name.

        Replaces: ``system.util.getProjectName()`` and
        ``system.project.getProjectName()``
        """
        return self._project_name

    def get_module_name(self) -> str:
        """Get the current module name."""
        return self._module_name

    def get_scope(self) -> str:
        """Get the execution scope.

        Returns one of "GATEWAY", "CLIENT", "DESIGNER".

        Replaces: ``system.util.getSystemFlags()``
        """
        return self._scope

    def is_gateway(self) -> bool:
        """True if running in gateway scope.

        Replaces: checking ``system.util.getSystemFlags() & system.util.GATEWAY``
        """
        return self._scope == "GATEWAY"

    def get_property(self, name: str, default: str = "") -> str:
        """Get a system property.

        Replaces: ``system.util.getProperty(name)``
        """
        import os
        return os.environ.get(name, default)

    # ------------------------------------------------------------------
    # Globals
    # ------------------------------------------------------------------

    def get_globals(self) -> dict[str, Any]:
        """Get the global variable dictionary.

        Replaces: ``system.util.getGlobals()``

        Note: In Forge, global state is scoped per-engine (not truly global).
        Prefer explicit state management over global variables.
        """
        return self._globals

    def set_global(self, key: str, value: Any) -> None:
        """Set a global variable."""
        self._globals[key] = value

    def get_global(self, key: str, default: Any = None) -> Any:
        """Get a global variable."""
        return self._globals.get(key, default)

    # ------------------------------------------------------------------
    # Async execution
    # ------------------------------------------------------------------

    def invoke_async(self, func: Callable, *args: Any) -> asyncio.Task:
        """Run a function asynchronously.

        Replaces: ``system.util.invokeAsynchronous(func)``

        Note: In Forge, all script handlers are already async.
        This is primarily for backward compatibility with scripts
        that explicitly spawn background tasks.
        """
        if asyncio.iscoroutinefunction(func):
            return asyncio.create_task(func(*args))
        else:
            loop = asyncio.get_event_loop()
            return loop.run_in_executor(None, func, *args)  # type: ignore

    # ------------------------------------------------------------------
    # Message passing
    # ------------------------------------------------------------------

    async def send_message(
        self,
        handler: str,
        payload: dict[str, Any] | None = None,
        *,
        scope: str = "gateway",
    ) -> bool:
        """Send an internal message to registered handlers.

        Replaces: ``system.util.sendMessage(project, handler, payload, scope)``
        """
        handlers = self._message_handlers.get(handler, [])
        if not handlers:
            logger.debug("No handlers for message: %s", handler)
            return False

        for h in handlers:
            try:
                if asyncio.iscoroutinefunction(h):
                    await h(payload or {})
                else:
                    h(payload or {})
            except Exception as exc:
                logger.error("Message handler %s failed: %s", handler, exc)

        return True

    def register_message_handler(self, handler_name: str, func: Callable) -> None:
        """Register a handler for internal messages."""
        if handler_name not in self._message_handlers:
            self._message_handlers[handler_name] = []
        self._message_handlers[handler_name].append(func)

    async def send_request(
        self,
        project: str,
        handler: str,
        payload: dict[str, Any] | None = None,
        *,
        timeout_ms: int = 5000,
    ) -> Any:
        """Send a request and wait for a response.

        Replaces: ``system.util.sendRequest(project, handler, payload)``
        """
        # In Forge, this delegates to the event bus (when wired).
        # For now, treat as a synchronous message with response.
        handlers = self._message_handlers.get(handler, [])
        if not handlers:
            raise RuntimeError(f"No handler registered for request: {handler!r}")

        h = handlers[0]
        if asyncio.iscoroutinefunction(h):
            return await asyncio.wait_for(
                h(payload or {}),
                timeout=timeout_ms / 1000,
            )
        return h(payload or {})


# Module-level singleton
_instance = UtilModule()

json_encode = _instance.json_encode
json_decode = _instance.json_decode
get_project_name = _instance.get_project_name
get_module_name = _instance.get_module_name
get_scope = _instance.get_scope
is_gateway = _instance.is_gateway
get_property = _instance.get_property
get_globals = _instance.get_globals
set_global = _instance.set_global
get_global = _instance.get_global
invoke_async = _instance.invoke_async
send_message = _instance.send_message
register_message_handler = _instance.register_message_handler
send_request = _instance.send_request
bind = _instance.bind
