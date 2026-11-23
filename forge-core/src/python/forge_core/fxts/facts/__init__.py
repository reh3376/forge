"""FACTS — Forge Adapter Conformance Test Specification.

Spec-first governance for adapter conformance.
Specs define what every adapter must provide.
The FACTS runner enforces conformance against the adapter manifest.

Schema: ``facts/schema/facts.schema.json``
Specs:  ``facts/specs/<adapter_id>.facts.json``
Runner: ``facts/runners/facts_runner.py`` (Sprint 4)
"""

from pathlib import Path

SCHEMA_PATH = Path(__file__).parent / "schema" / "facts.schema.json"
