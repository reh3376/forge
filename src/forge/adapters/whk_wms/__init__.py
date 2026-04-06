"""WHK WMS Adapter — ingests barrel, lot, and event data from the
Whiskey House Warehouse Management System.

This adapter implements the contract defined in whk-wms.facts.json:
read + subscribe + backfill + discover (no write).
"""

from forge.adapters.whk_wms.adapter import WhkWmsAdapter

__all__ = ["WhkWmsAdapter"]
