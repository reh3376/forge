"""i3X-Compliant Browse API — CESMII-shaped endpoints for the tag engine.

Implements the CESMII i3X REST API pattern adapted to FxTS governance:
    /namespaces     — PLC connections as i3X namespaces
    /objecttypes    — Equipment types (from tag templates)
    /objects        — Browsable tag/folder hierarchy
    /objects/value  — Live value preview
    /subscriptions  — SSE stream for real-time changes
    /discover       — Auto-create tags from PLC address space
"""

from forge.modules.ot.i3x.router import create_i3x_router
from forge.modules.ot.i3x.models import (
    I3xNamespace,
    I3xObjectType,
    I3xObject,
    I3xValue,
    I3xBrowseResponse,
)

__all__ = [
    "create_i3x_router",
    "I3xNamespace",
    "I3xObjectType",
    "I3xObject",
    "I3xValue",
    "I3xBrowseResponse",
]
