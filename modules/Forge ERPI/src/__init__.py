"""WHK ERPI Adapter — ingests cross-system entity data from the
Whiskey House ERP Integration service.

This adapter implements the contract defined in whk-erpi.facts.json:
read + subscribe + backfill + discover (no write).

Primary data source: 33 RabbitMQ fanout exchanges following the
wh.whk01.distillery01.* UNS pattern. The adapter binds its own
durable queues without affecting existing ERPI consumers.
"""

from forge.adapters.whk_erpi.adapter import WhkErpiAdapter

__all__ = ["WhkErpiAdapter"]
