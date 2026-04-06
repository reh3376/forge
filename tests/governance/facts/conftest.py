"""Test configuration for FACTS governance tests.

Applies Python 3.10 compatibility patches for code targeting 3.12+.
These patches are ONLY needed in the test sandbox — production code
correctly uses datetime.UTC and StrEnum on Python 3.12.
"""
# ruff: noqa: UP017, UP042

import datetime
import enum
import sys
from pathlib import Path

# Monkey-patch datetime.UTC for Python < 3.11
if not hasattr(datetime, "UTC"):
    datetime.UTC = datetime.timezone.utc

# Monkey-patch enum.StrEnum for Python < 3.11
if not hasattr(enum, "StrEnum"):
    class StrEnum(str, enum.Enum):
        pass
    enum.StrEnum = StrEnum

# Ensure src/ is on sys.path for all test modules
SRC_ROOT = Path(__file__).resolve().parents[3] / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))
