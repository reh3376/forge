"""Forge IMS Adapter — ingests asset lifecycle events, compliance records,
and inventory data from the Forge Inventory Management System.

Forge IMS is a Go gRPC core + Python intelligence sidecar that tracks
aerospace assets through three-dimensional state (disposition, system_state,
asset_state) with an append-only transaction event log.

This adapter implements the contract defined in forge-ims-adapter.facts.json:
read + subscribe + backfill + discover (no write).
"""

from forge_ims.adapter import ForgeImsAdapter

__all__ = ["ForgeImsAdapter"]
