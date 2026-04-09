"""Ignition Bridge Adapter — temporary migration shim for parallel operation.

This package implements a **read-only** adapter that polls Ignition's REST API
for tag values and converts them to ContextualRecords.  It exists solely to
enable side-by-side validation during the OT Module migration:

    ┌──────────────┐          ┌──────────────┐
    │  Ignition    │  REST    │   Bridge     │   ContextualRecord
    │  Gateway     │────────►│   Adapter    │──────────────────►  Hub
    └──────────────┘          └──────────────┘
                                     ▲
                                     │  compare
                                     ▼
    ┌──────────────┐          ┌──────────────┐
    │  Allen-Bradley│ OPC-UA  │  OT Module   │   ContextualRecord
    │  PLCs        │────────►│  (direct)    │──────────────────►  Hub
    └──────────────┘          └──────────────┘

The bridge adapter:
  - Polls Ignition REST API (`/system/tag/read`) for tag values
  - Converts Ignition bracket-notation paths to Forge-normalized paths
  - Emits ContextualRecords with ``source.system="ignition-bridge"``
  - Provides tag discovery via Ignition tag browse
  - Is **read-only** — no writes flow through the bridge

Phase 5 components:
  - ``models.py``       — Bridge configuration and response models
  - ``client.py``       — Async HTTP client for Ignition REST API
  - ``tag_mapper.py``   — Ignition ↔ Forge tag path mapping with filtering
  - ``adapter.py``      — IgnitionBridgeAdapter (AdapterBase + DiscoveryProvider)
  - ``dual_write.py``   — Dual-write data consistency validation
  - ``health.py``       — Side-by-side health dashboard model

Lifecycle:
  - This package is imported ONLY during migration.
  - Once Gate 5 passes (<1% discrepancy), the bridge is removed (Phase 7.3).
"""

# Epic 5.1: Bridge Adapter
from forge.modules.ot.bridge.models import (
    BridgeConfig,
    BridgeHealth,
    IgnitionTagResponse,
    IgnitionTagValue,
    TagMapping,
    TagMappingRule,
)
from forge.modules.ot.bridge.client import IgnitionRestClient
from forge.modules.ot.bridge.tag_mapper import TagMapper
from forge.modules.ot.bridge.adapter import IgnitionBridgeAdapter

# Epic 5.2: Parallel Operation Validation
from forge.modules.ot.bridge.dual_write import (
    ComparisonResult,
    ConsistencyReport,
    DualWriteValidator,
)
from forge.modules.ot.bridge.health import BridgeHealthDashboard

__all__ = [
    # Models
    "BridgeConfig",
    "BridgeHealth",
    "IgnitionTagResponse",
    "IgnitionTagValue",
    "TagMapping",
    "TagMappingRule",
    # Client
    "IgnitionRestClient",
    # Mapping
    "TagMapper",
    # Adapter
    "IgnitionBridgeAdapter",
    # Validation
    "ComparisonResult",
    "ConsistencyReport",
    "DualWriteValidator",
    # Health
    "BridgeHealthDashboard",
]
