"""FVTS — Forge View Test Specification.

Spec-first governance for the module ↔ forge-display contract: what a
module lets a renderer show (points, history, alarms), do (actions,
settings) and where (surfaces, render profiles). Modules describe,
forge-display renders; safety behaviour is declared once here and
enforced in forge-core.

Schema:   ``fvts/schema/fvts.schema.json``
Specs:    ``fvts/specs/<module>.fvts.json``
Runner:   ``fvts/runners/fvts_runner.py`` (BACKLOG FB-077)
Baseline: ``fvts/profiles.py`` — the normative render-profile table
Renderer: ``fvts/renderer.py`` — the reference renderer golden messages run through
"""

from pathlib import Path

SCHEMA_PATH = Path(__file__).parent / "schema" / "fvts.schema.json"
SPECS_DIR = Path(__file__).parent / "specs"
REPO_ROOT = Path(__file__).resolve().parents[4]
