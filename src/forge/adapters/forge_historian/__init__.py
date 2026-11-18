"""Forge Historian adapter for the Forge platform.

Connects to the Forge Historian Rust time-series historian via its REST+SSE
API to bring process tag data into the Forge pipeline. This is the
first HISTORIAN-tier adapter and the first cross-language spoke
(Python adapter ↔ Rust backend).

Data flow:
    Forge Historian REST API ──HTTP──► Adapter.collect() ──►
    ContextualRecord ──► Hub Pipeline
"""

from forge.adapters.forge_historian.adapter import ForgeHistorianAdapter

__all__ = ["ForgeHistorianAdapter"]
