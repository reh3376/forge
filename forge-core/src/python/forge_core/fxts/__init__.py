"""The FxTS frameworks: one package per framework, with its schema, runner and gate.

``FXTS_ROOT`` is this folder. Code and tests that need a framework's files build the path
from it, never from the layout of the repository.
"""

from pathlib import Path

FXTS_ROOT = Path(__file__).resolve().parent

__all__ = ["FXTS_ROOT"]
