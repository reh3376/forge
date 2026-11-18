"""FMTS — Forge Module Test Specification.

What every Forge module declares before a hub admits it: its kind, the
name and alias, the baseline it claims (M-1 to M-11), its time contract with every
counterpart, references to its other specs (FACTS, FVTS, roles) and the
waivers the owner has approved. Decided in
``docs/decisions/forge-module-requirements.md`` (D-12, signed 2026-11-17).

Schema:  ``fmts/schema/fmts.schema.json``
Specs:   ``fmts/specs/<module>.fmts.json``
Runner:  ``fmts/runners/fmts_runner.py`` (BACKLOG FB-135)
"""

from pathlib import Path

SCHEMA_PATH = Path(__file__).parent / "schema" / "fmts.schema.json"
SPECS_DIR = Path(__file__).parent / "specs"
REPO_ROOT = Path(__file__).resolve().parents[4]
