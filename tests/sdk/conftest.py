"""Shared fixtures for Module Builder SDK tests."""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure src/ is importable
_src = Path(__file__).resolve().parent.parent.parent / "src"
if str(_src) not in sys.path:
    sys.path.insert(0, str(_src))
