# ruff: noqa: E402, UP017, UP042
"""Shared fixtures for Module Builder SDK tests."""

from __future__ import annotations

import datetime as _dt_mod
import enum
import sys
from pathlib import Path

# Python 3.10 compat patches (sandbox is 3.10, code targets 3.12+)
if not hasattr(_dt_mod, "UTC"):
    _dt_mod.UTC = _dt_mod.timezone.utc

if not hasattr(enum, "StrEnum"):
    class StrEnum(str, enum.Enum):
        pass
    enum.StrEnum = StrEnum

# Ensure src/ is importable
_src = Path(__file__).resolve().parent.parent.parent / "src"
if str(_src) not in sys.path:
    sys.path.insert(0, str(_src))
