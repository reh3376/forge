"""Test configuration for WHK CMMS adapter tests."""

import sys
from pathlib import Path

# Ensure src/ is on sys.path for all test modules
SRC_ROOT = Path(__file__).resolve().parents[3] / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))
