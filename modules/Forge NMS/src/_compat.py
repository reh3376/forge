"""Python 3.10 compatibility shims.

Forge targets Python 3.12+, but we keep these shims during development
so tests can run on 3.10 sandboxes. Once CI enforces 3.12+, delete this
module and revert to stdlib imports.

Shims provided:
- StrEnum: ``enum.StrEnum`` (3.11+) → ``str, Enum`` fallback
- UTC:     ``datetime.UTC`` (3.11+) → ``datetime.timezone.utc`` alias
"""

from __future__ import annotations

import sys

# ── StrEnum shim ──────────────────────────────────────────────

if sys.version_info >= (3, 11):
    from enum import StrEnum  # noqa: F401
else:
    from enum import Enum

    class StrEnum(str, Enum):
        """Minimal backport of enum.StrEnum for Python 3.10."""

        @staticmethod
        def _generate_next_value_(
            name: str, start: int, count: int, last_values: list
        ) -> str:
            return name

# ── UTC alias ─────────────────────────────────────────────────

from datetime import timezone  # noqa: E402

UTC = timezone.utc
