"""Compatibility re-exports kept for the call sites of the former Python 3.10 shims.

Forge requires Python 3.12 (``pyproject.toml``), so ``StrEnum`` and ``UTC`` come
straight from the standard library. BACKLOG FB-026 retires this module and
points the importers at ``enum`` / ``datetime`` directly.
"""

from datetime import UTC
from enum import StrEnum

__all__ = ["UTC", "StrEnum"]
