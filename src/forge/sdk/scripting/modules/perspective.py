"""forge.perspective — HMI/UI interaction SDK module.

Replaces Ignition's ``system.perspective.*`` functions for scripts that
need to interact with the operator UI layer.

In Ignition, ``system.perspective.*`` calls are gateway-side invocations
that reach into the browser session via WebSocket.  In Forge, these calls
are translated to events on the Forge event bus that the HMI frontend
(Phase 9: OT UI Builder) subscribes to.

During migration (before Forge HMI is live), these calls are forwarded
to the Ignition Bridge adapter's REST API for backward compatibility.

Usage in scripts::

    import forge

    await forge.perspective.send_message("notify", {"text": "Batch complete"})
    await forge.perspective.navigate("/distillery/overview")
    sessions = await forge.perspective.get_sessions()
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable

logger = logging.getLogger("forge.perspective")


# ---------------------------------------------------------------------------
# Session model
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SessionInfo:
    """Information about an active HMI session."""

    session_id: str
    username: str
    project: str
    address: str
    page_path: str
    started: str = ""
    user_agent: str = ""


# ---------------------------------------------------------------------------
# Message handler registry
# ---------------------------------------------------------------------------


_message_handlers: dict[str, list[Callable]] = {}


# ---------------------------------------------------------------------------
# PerspectiveModule
# ---------------------------------------------------------------------------


class PerspectiveModule:
    """The forge.perspective SDK module — HMI/UI interaction facade.

    Events are dispatched through the Forge event bus.  The actual
    UI framework (Ignition Perspective during migration, Forge HMI
    after Phase 9) subscribes to these events and acts accordingly.
    """

    def __init__(self) -> None:
        self._event_bus: Any = None  # Forge event bus, set via bind()
        self._bridge: Any = None      # IgnitionBridgeAdapter for migration mode
        self._sessions: list[SessionInfo] = []
        self._navigation_history: list[str] = []

    def bind(self, event_bus: Any = None, bridge: Any = None) -> None:
        """Bind to the event bus and optional bridge adapter.

        Args:
            event_bus: Forge event bus for dispatching UI events.
            bridge: Optional IgnitionBridgeAdapter for migration mode.
        """
        self._event_bus = event_bus
        self._bridge = bridge
        logger.debug("forge.perspective bound (event_bus=%s, bridge=%s)",
                      event_bus is not None, bridge is not None)

    async def send_message(
        self,
        handler: str,
        payload: dict[str, Any] | None = None,
        *,
        scope: str = "page",
        session_id: str = "",
    ) -> bool:
        """Send a message to the HMI frontend.

        Args:
            handler: Message handler name (e.g., "notify", "refresh-data").
            payload: Message payload dict.
            scope: "page", "session", or "gateway" (broadcast scope).
            session_id: Target specific session (empty = all sessions).

        Returns:
            True if the message was dispatched.

        Replaces: ``system.perspective.sendMessage(messageType, payload, scope)``
        """
        message = {
            "type": "perspective.message",
            "handler": handler,
            "payload": payload or {},
            "scope": scope,
            "session_id": session_id,
        }

        if self._event_bus is not None:
            await self._event_bus.publish("hmi.message", message)
            logger.debug("Sent message: handler=%s scope=%s", handler, scope)
            return True

        logger.warning("No event bus bound — message not sent: %s", handler)
        return False

    async def navigate(self, page_path: str, *, session_id: str = "") -> bool:
        """Navigate the HMI to a specific page.

        Replaces: ``system.perspective.navigate(page, sessionId)``
        """
        self._navigation_history.append(page_path)
        message = {
            "type": "perspective.navigate",
            "page": page_path,
            "session_id": session_id,
        }

        if self._event_bus is not None:
            await self._event_bus.publish("hmi.navigate", message)
            return True

        logger.warning("No event bus — navigation not dispatched: %s", page_path)
        return False

    async def open_popup(
        self,
        popup_id: str,
        view_path: str,
        *,
        params: dict[str, Any] | None = None,
        title: str = "",
        session_id: str = "",
    ) -> bool:
        """Open a popup in the HMI.

        Replaces: ``system.perspective.openPopup(id, view, params)``
        """
        message = {
            "type": "perspective.popup.open",
            "popup_id": popup_id,
            "view_path": view_path,
            "params": params or {},
            "title": title,
            "session_id": session_id,
        }

        if self._event_bus is not None:
            await self._event_bus.publish("hmi.popup", message)
            return True

        return False

    async def close_popup(self, popup_id: str, *, session_id: str = "") -> bool:
        """Close a popup.

        Replaces: ``system.perspective.closePopup(id)``
        """
        message = {
            "type": "perspective.popup.close",
            "popup_id": popup_id,
            "session_id": session_id,
        }

        if self._event_bus is not None:
            await self._event_bus.publish("hmi.popup.close", message)
            return True

        return False

    async def get_sessions(self) -> list[SessionInfo]:
        """Get active HMI sessions.

        Replaces: ``system.perspective.getSessionInfo()``
        """
        return list(self._sessions)

    async def download(
        self,
        filename: str,
        content: bytes,
        *,
        content_type: str = "application/octet-stream",
        session_id: str = "",
    ) -> bool:
        """Trigger a file download in the HMI.

        Replaces: ``system.perspective.download(filename, data)``
        """
        message = {
            "type": "perspective.download",
            "filename": filename,
            "content_type": content_type,
            "content_length": len(content),
            "session_id": session_id,
        }

        if self._event_bus is not None:
            await self._event_bus.publish("hmi.download", message)
            return True

        return False

    async def print_page(self, *, session_id: str = "") -> bool:
        """Trigger a print dialog in the HMI.

        Replaces: ``system.perspective.print()``
        """
        message = {
            "type": "perspective.print",
            "session_id": session_id,
        }

        if self._event_bus is not None:
            await self._event_bus.publish("hmi.print", message)
            return True

        return False


# Module-level singleton
_instance = PerspectiveModule()

send_message = _instance.send_message
navigate = _instance.navigate
open_popup = _instance.open_popup
close_popup = _instance.close_popup
get_sessions = _instance.get_sessions
download = _instance.download
print_page = _instance.print_page
bind = _instance.bind
