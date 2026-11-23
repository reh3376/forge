"""The gates' keywords are defined once and mean one thing (the owner, 2026-11-23).

The owner answers a gate with keywords (``+design+arena``, ``go``). They are defined in
``.claude/skills/gates/SKILL.md``; ``CLAUDE.md`` points there and a gate message prints the
tables from it. This holds the file to its own rules, so a keyword cannot be added in one
place and forgotten in another.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SKILL = (REPO / ".claude" / "skills" / "gates" / "SKILL.md").read_text(encoding="utf-8")
CLAUDE = (REPO / "CLAUDE.md").read_text(encoding="utf-8")
ROW = re.compile(r"^\| `(\+?[a-z]+)` \| (.*?) \| ([a-z]+)[^|]*\|$", re.MULTILINE)


def _section(title: str) -> str:
    start = SKILL.index(f"## {title}")
    end = SKILL.find("\n## ", start + 1)
    return SKILL[start : end if end > 0 else len(SKILL)]


def _keywords(title: str) -> dict[str, str]:
    return {keyword: runs for keyword, runs, _ in ROW.findall(_section(title))}


DESIGN = _keywords("Keywords at gate 1 (design)")
SHIP = _keywords("Keywords at gate 2 (ship)")


def test_each_gate_has_its_keywords() -> None:
    assert set(DESIGN) == {
        "go", "+standard", "+problem", "+ground", "+sharpen", "+shape", "+arena", "+cases",
        "+attack", "+laws", "+chart", "+design",
    }  # fmt: skip
    assert set(SHIP) == {"go", "+blast", "+verify", "+attack", "+prove", "+ship"}


def test_each_gate_has_a_plain_go_and_a_standard_answer() -> None:
    """The owner, 2026-11-23: the design gate needs a standard option like the ship gate's."""
    for gate in (DESIGN, SHIP):
        assert next(iter(gate)) == "go", "go is the first row of each gate's table"
    assert re.findall(r"\+[a-z]+", DESIGN["+standard"]) == ["+problem", "+ground", "+cases"]
    assert re.findall(r"\+[a-z]+", SHIP["+ship"]) == ["+blast", "+verify", "+prove"]


def test_a_composite_names_only_keywords_of_its_own_gate() -> None:
    for gate, composite in ((DESIGN, "+design"), (DESIGN, "+standard"), (SHIP, "+ship")):
        parts = re.findall(r"\+[a-z]+", gate[composite])
        assert parts, composite
        assert set(parts) <= set(gate) - {composite}, f"{composite} names an unknown keyword"
    assert "+arena" not in DESIGN["+design"], "the costly one is only run on the owner's word"


def test_every_keyword_says_what_it_runs_and_what_it_costs() -> None:
    for title in ("Keywords at gate 1 (design)", "Keywords at gate 2 (ship)"):
        for keyword, runs, cost in ROW.findall(_section(title)):
            composite = keyword in {"+design", "+ship"}
            assert composite or len(runs) > 20, keyword
            assert cost in {"none", "low", "medium", "high"}, f"{keyword}: cost {cost!r}"


def test_the_list_of_cases_is_numbered_and_whole() -> None:
    cases = re.findall(r"^(\d+)\. \*\*", _section("The cases of `+cases`"), re.MULTILINE)
    assert cases == [str(n) for n in range(1, 11)]


def test_the_workflow_points_at_the_one_place() -> None:
    assert ".claude/skills/gates/SKILL.md" in CLAUDE
    assert "Gate 1, before building" in CLAUDE and "Gate 2, before pushing" in CLAUDE
    # CLAUDE.md names keywords only as examples; none it names is unknown to the skill
    named = set(re.findall(r"`(\+[a-z]+)(?:\+[a-z]+)*`", CLAUDE))
    assert named <= set(DESIGN) | set(SHIP), named - set(DESIGN) - set(SHIP)


def test_go_and_the_unknown_keyword_are_defined() -> None:
    either = _section("At either gate")
    assert "| `go` |" in either and "never guesses" in either
