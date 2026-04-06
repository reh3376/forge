"""WHK MES Adapter — ingests production, batch, recipe, and equipment
data from the Whiskey House Manufacturing Execution System.

This adapter implements the contract defined in whk-mes.facts.json:
read + write + subscribe + backfill + discover.
"""

from forge.adapters.whk_mes.adapter import WhkMesAdapter

__all__ = ["WhkMesAdapter"]
