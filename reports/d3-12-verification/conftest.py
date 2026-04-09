"""Shared fixtures for D3.12 production verification tests.

Provides pre-built adapter instances, sample WMS events, manifest dicts,
FACTS specs, and infrastructure wiring — all in-memory, no Docker.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest

# ── Path setup ────────────────────────────────────────────────────
SRC_ROOT = Path(__file__).resolve().parents[2] / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

# ── Python 3.10 compat shims ─────────────────────────────────────
import forge._compat  # noqa: F401, E402 — registers StrEnum/UTC shims


# ── Sample WMS barrel event ──────────────────────────────────────

@pytest.fixture()
def barrel_event() -> dict[str, Any]:
    """A realistic WMS barrel transfer event."""
    return {
        "id": str(uuid4()),
        "eventType": "BARREL_TRANSFER",
        "barrelId": "B-2026-04-001",
        "barrelType": "BOURBON",
        "capacity": 53,
        "warehouseId": "WH-01",
        "warehouseName": "Rickhouse Alpha",
        "site": "Rickhouse Alpha",
        "bay": "A",
        "tier": "3",
        "position": "12",
        "lotId": "LOT-2026-04-001",
        "mashbill": "CORN-75/RYE-13/MALT-12",
        "customerId": "CUST-001",
        "customerName": "Premium Brands LLC",
        "equipment_id": "WH-01-A-3-12",
        "batch_id": "B-2026-04-001",
        "lot_id": "LOT-2026-04-001",
        "entity_type": "barrel",
        "source_type": "graphql",
        "operating_mode": "PRODUCTION",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "operator_id": "jdoe",
    }


@pytest.fixture()
def barrel_events(barrel_event: dict) -> list[dict[str, Any]]:
    """Multiple barrel events for batch testing."""
    events = [barrel_event]
    # Add a second event with different context
    event2 = json.loads(json.dumps(barrel_event))
    event2["id"] = str(uuid4())
    event2["eventType"] = "BARREL_FILL"
    event2["barrelId"] = "B-2026-04-002"
    event2["bay"] = "B"
    event2["lotId"] = "LOT-2026-04-002"
    event2["batch_id"] = "B-2026-04-002"
    event2["lot_id"] = "LOT-2026-04-002"
    event2["operator_id"] = "asmith"
    events.append(event2)
    return events


@pytest.fixture()
def whk_wms_spec() -> dict[str, Any]:
    """Load the WHK WMS FACTS spec from the governance directory."""
    spec_path = (
        SRC_ROOT / "forge" / "governance" / "facts" / "specs" / "whk-wms.facts.json"
    )
    return json.loads(spec_path.read_text())


@pytest.fixture()
def facts_schema_path() -> Path:
    """Path to the FACTS JSON Schema."""
    return SRC_ROOT / "forge" / "governance" / "facts" / "schema" / "facts.schema.json"
