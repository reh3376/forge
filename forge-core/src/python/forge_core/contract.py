"""Where the contract lives: the proto files, the framework schemas, the governed lists.

The contract is forge-core's language-neutral part (D-17 §5): Python and Go read the same
files. In a checkout it is the folder ``forge-core/contract``. In a built package it is
included as ``forge_core/_contract`` (the manifest's ``force-include``). ``CONTRACT_ROOT`` is
whichever exists, and everything that needs a contract file builds its path from here.
"""

from __future__ import annotations

from pathlib import Path

_PACKAGE = Path(__file__).resolve().parent
_PACKAGED = _PACKAGE / "_contract"
# forge-core/src/python/forge_core/contract.py -> forge-core/contract
_CHECKOUT = _PACKAGE.parents[2] / "contract"

CONTRACT_ROOT: Path = _PACKAGED if _PACKAGED.is_dir() else _CHECKOUT
PROTO_DIR: Path = CONTRACT_ROOT / "proto"
LISTS_DIR: Path = CONTRACT_ROOT / "lists"
FXTS_SCHEMAS: Path = CONTRACT_ROOT / "fxts"


def schema_dir(framework: str) -> Path:
    """The folder of a framework's schema, its released versions and its registry."""
    return FXTS_SCHEMAS / framework.lower() / "schema"


def schema_path(framework: str) -> Path:
    """A framework's current schema file."""
    return schema_dir(framework) / f"{framework.lower()}.schema.json"


__all__ = [
    "CONTRACT_ROOT",
    "FXTS_SCHEMAS",
    "LISTS_DIR",
    "PROTO_DIR",
    "schema_dir",
    "schema_path",
]
