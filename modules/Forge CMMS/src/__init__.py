"""WHK CMMS Adapter — hybrid GraphQL + RabbitMQ ingestion for maintenance management.

This adapter implements the contract defined in whk-cmms.facts.json:
read + subscribe + backfill + discover (no write).

Primary data source: GraphQL polling of CMMS maintenance entities
(assets, work orders, work requests, kits, etc.).

Secondary data source: RabbitMQ subscription to ERPI master data topics
(item, vendor) for inventory and cost tracking.

The CMMS is the system of record for all maintenance work and equipment
state in the WHK manufacturing operation.
"""

from forge.adapters.whk_cmms.adapter import WhkCmmsAdapter

__all__ = ["WhkCmmsAdapter"]
