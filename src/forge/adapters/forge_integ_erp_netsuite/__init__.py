"""Forge NetSuite ERP Integration Adapter — ingests cross-system entity data from the
Forge NetSuite ERP Integration service.

This adapter implements the contract defined in forge-integ-erp-netsuite.facts.json:
read + subscribe + backfill + discover (no write).

Primary data source: 33 RabbitMQ fanout exchanges following the
wh.whk01.distillery01.* UNS pattern. The adapter binds its own
durable queues without affecting existing ERPI consumers.
"""

from forge.adapters.forge_integ_erp_netsuite.adapter import ForgeIntegErpNetsuiteAdapter

__all__ = ["ForgeIntegErpNetsuiteAdapter"]
