"""FUTS — Forge UI Test Specification.

What a screen is made of (`docs/decisions/forge-display.md`, D-16, Q-12 and Q-13). Two
kinds of spec in one framework:

* a **widget spec** says what one widget accepts: its properties, what can be bound to
  it, the actions and events it offers, and that it shows quality and staleness;
* a **view document** is a laid-out screen: a tree of containers and widget instances
  with their properties, bindings, actions and event handlers. It is data, built in the
  designer, and is checked against the widget specs of the widgets it uses and against
  the view spec (FVTS) of the module whose data it shows.

Schema:  ``futs/schema/futs.schema.json``
Specs:   ``futs/specs/<widget>.widget.futs.json`` and ``futs/specs/<view>.view.futs.json``
Runner:  ``futs/runners/futs_runner.py`` (BACKLOG FB-176)
"""

from pathlib import Path

SCHEMA_PATH = Path(__file__).parent / "schema" / "futs.schema.json"
SPECS_DIR = Path(__file__).parent / "specs"
REPO_ROOT = Path(__file__).resolve().parents[6]
