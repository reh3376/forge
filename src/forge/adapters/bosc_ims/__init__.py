"""BOSC IMS Adapter — ingests asset lifecycle events, compliance records,
and inventory data from the BOSC Inventory Management System.

BOSC IMS is a Go gRPC core + Python intelligence sidecar that tracks
aerospace assets through three-dimensional state (disposition, system_state,
asset_state) with an append-only transaction event log.

This adapter implements the contract defined in bosc-ims-adapter.facts.json:
read + subscribe + backfill + discover (no write).
"""

from forge.adapters.bosc_ims.adapter import BoscImsAdapter

__all__ = ["BoscImsAdapter"]
