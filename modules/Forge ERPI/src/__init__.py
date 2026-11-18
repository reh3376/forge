"""Forge ERP Interface Adapter — ingests cross-system entity data from the
Forge ERP Interface service.

This adapter implements the contract defined in forge-erpi.facts.json:
read + subscribe + backfill + discover (no write).

Primary data source: 33 RabbitMQ fanout exchanges following the
wh.whk01.distillery01.* UNS pattern. The adapter binds its own
durable queues without affecting existing ERPI consumers.
"""

from forge.adapters.forge_erpi.adapter import ForgeErpiAdapter

__all__ = ["ForgeErpiAdapter"]
