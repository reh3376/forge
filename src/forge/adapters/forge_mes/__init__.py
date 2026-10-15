"""Forge MES Adapter — ingests production, batch, recipe, and equipment
data from the Forge Manufacturing Execution System.

This adapter implements the contract defined in forge-mes.facts.json:
read + write + subscribe + backfill + discover.
"""

from forge.adapters.forge_mes.adapter import ForgeMesAdapter

__all__ = ["ForgeMesAdapter"]
