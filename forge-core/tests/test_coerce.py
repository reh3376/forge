"""The one boolean rule for flags and settings (CLAUDE.md; FB-291).

Every accepted word in every letter case and with surrounding spaces reads as its value;
``0`` and ``1`` and real booleans read as themselves; everything else is refused by name,
never read as false.
"""

from __future__ import annotations

import itertools

import pytest

from forge_core.coerce import FALSE_WORDS, TRUE_WORDS, AmbiguousValueError, boolean, env_boolean


def _spellings(word: str) -> set[str]:
    cases = {"".join(c) for c in itertools.product(*((ch.lower(), ch.upper()) for ch in word))}
    return {f"{pad}{w}{pad2}" for w in cases for pad in ("", " ", "\t") for pad2 in ("", " ", "\n")}


@pytest.mark.parametrize("word", sorted(TRUE_WORDS | FALSE_WORDS))
def test_every_spelling_of_a_word_reads_as_its_value(word: str) -> None:
    for spelling in _spellings(word):
        assert boolean(spelling, name="X") is (word in TRUE_WORDS), repr(spelling)


@pytest.mark.parametrize(("value", "want"), [(True, True), (False, False), (1, True), (0, False)])
def test_booleans_and_zero_and_one_read_as_themselves(value: object, want: bool) -> None:
    assert boolean(value, name="X") is want


AMBIGUOUS = [
    "",
    " ",
    "tru",
    "truee",
    "t",
    "f",
    "y",
    "n",
    "2",
    "-1",
    "01",
    "1.0",
    "none",
    "null",
    "enabled",
    "disabled",
    "true false",
    "yes please",
    2,
    -1,
    0.0,
    1.0,
    None,
    [],
    {},
]


@pytest.mark.parametrize("value", AMBIGUOUS, ids=repr)
def test_anything_else_is_refused_by_name(value: object) -> None:
    with pytest.raises(AmbiguousValueError, match="FORGE_X"):
        boolean(value, name="FORGE_X")


def test_an_unset_or_empty_flag_takes_its_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FORGE_X", raising=False)
    assert env_boolean("FORGE_X", True) is True
    monkeypatch.setenv("FORGE_X", "  ")
    assert env_boolean("FORGE_X", False) is False
    monkeypatch.setenv("FORGE_X", "On")
    assert env_boolean("FORGE_X", False) is True
    monkeypatch.setenv("FORGE_X", "maybe")
    with pytest.raises(AmbiguousValueError):
        env_boolean("FORGE_X", False)
