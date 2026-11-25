"""No flag is read by comparing a string (FB-291; CLAUDE.md: no truthiness).

``os.getenv("X", "false").lower() == "true"`` reads ``1``, ``yes`` and ``on`` as false; it
once turned the hub's authentication off. Every flag goes through
``forge_core.coerce.env_boolean``. This fails, naming the line, if the idiom comes back.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IDIOM = re.compile(
    r"""(getenv|environ\.get)\([^)]*\)\s*\.\s*(lower|strip|casefold)\(\)[^\n]*(==|!=|\bin\b)"""
)


def test_no_flag_is_read_by_comparing_a_string() -> None:
    found = []
    for base in ("forge-core/src", "forge-hub/src"):
        for path in (ROOT / base).rglob("*.py"):
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                if IDIOM.search(line):
                    found.append(f"{path.relative_to(ROOT)}:{number}: {line.strip()}")
    assert found == [], "read these through forge_core.coerce.env_boolean:\n" + "\n".join(found)


def test_the_check_sees_the_idiom() -> None:
    assert IDIOM.search('enabled = os.getenv("FORGE_AUTH_ENABLED", "false").lower() == "true"')
    assert not IDIOM.search('enabled = env_boolean("FORGE_AUTH_ENABLED", False)')
