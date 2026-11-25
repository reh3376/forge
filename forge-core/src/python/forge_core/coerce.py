"""Coerce a value from outside to its declared type, once, and refuse an ambiguous one.

CLAUDE.md: the value checked is the value acted on. A value from outside (an environment
variable, a request, a file) is coerced once to its declared type and refused when it is
ambiguous; no truthiness. Before this, the hub read its flags by comparing a lowered string
with ``"true"``, so ``FORGE_AUTH_ENABLED=1``, ``yes`` or ``on`` turned authentication off and
made every caller an anonymous administrator (FB-291). The forge-ot write path keeps its own
rule for a tag's value (FB-215); this one is for flags and settings.
"""

from __future__ import annotations

import os

#: The words for a boolean, compared after trimming spaces and ignoring case.
TRUE_WORDS = frozenset({"true", "yes", "on", "1"})
FALSE_WORDS = frozenset({"false", "no", "off", "0"})


class AmbiguousValueError(ValueError):
    """A value that is not one of the type's accepted spellings; it names what was given."""


def boolean(value: object, *, name: str) -> bool:
    """A boolean, ``0`` or ``1``, or a word for one; anything else is refused by name."""
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    if isinstance(value, str):
        word = value.strip().lower()
        if word in TRUE_WORDS:
            return True
        if word in FALSE_WORDS:
            return False
    msg = (
        f"{name}={value!r} is not a boolean: use true or false "
        "(yes/no, on/off and 1/0 are read the same way)"
    )
    raise AmbiguousValueError(msg)


def env_boolean(name: str, default: bool) -> bool:
    """An environment flag through :func:`boolean`; unset or empty takes the default."""
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return boolean(raw, name=name)
