"""Forge WMS Adapter — ingests barrel, lot, and event data from the
Forge Warehouse Management System.

This adapter implements the contract defined in forge-wms.facts.json:
read + subscribe + backfill + discover (no write).
"""

from forge_wms.adapter import ForgeWmsAdapter

__all__ = ["ForgeWmsAdapter"]
