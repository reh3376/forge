"""Where the hub's own governed files are (D-17 §10.3, A-3; BACKLOG FB-200).

A spec lives with what it describes. The hub's own specs are in ``forge-hub/fxts``, one
folder per framework (``fats/`` holds the specs of its API). The folder is outside the
Python package, like forge-core's contract; a built package carries it as
``forge_hub/_fxts`` and this module finds it in either place.

forge-core's frameworks are handed these folders by the hub's ``forge governance``
command. forge-core never looks for them: it imports nothing of the hub (S-1).
"""

from __future__ import annotations

from pathlib import Path

_PACKAGED = Path(__file__).resolve().parent / "_fxts"
_CHECKOUT = Path(__file__).resolve().parents[3] / "fxts"

#: ``forge-hub/fxts`` in a checkout and in the image; ``forge_hub/_fxts`` in a built package.
FXTS_DIR = _PACKAGED if _PACKAGED.is_dir() else _CHECKOUT


def specs_dir(framework: str) -> Path:
    """The folder of the hub's own specs of one framework (it may not exist)."""
    return FXTS_DIR / framework
