"""WHK NMS Adapter — network infrastructure monitoring for manufacturing.

Integrates the Whiskey House Network Management System with Forge via
REST API polling and WebSocket event streaming.
"""

from __future__ import annotations

from forge.adapters.whk_nms.adapter import WhkNmsAdapter

__all__ = ["WhkNmsAdapter"]
