"""Map ERPI Vendor/Customer → Forge BusinessEntity.

ERPI fields (from Prisma schema):
    Vendor: id, globalId, name, transactionInitiator, transactionStatus, transactionType
    Customer: id, globalId, name, transactionInitiator, transactionStatus, transactionType

Forge BusinessEntity fields:
    entity_type, name, parent_id, external_ids, contact_info, location, is_active
"""

from __future__ import annotations

import logging
from typing import Any

from forge.core.models.manufacturing.business_entity import BusinessEntity
from forge.core.models.manufacturing.enums import EntityType

logger = logging.getLogger(__name__)

_SOURCE_SYSTEM = "whk-erpi"


def map_vendor(raw: dict[str, Any]) -> BusinessEntity | None:
    """Map an ERPI Vendor dict to a Forge BusinessEntity."""
    global_id = raw.get("globalId") or raw.get("global_id")
    name = raw.get("name")
    if not global_id or not name:
        logger.warning("Vendor missing globalId or name — skipping: %s", raw)
        return None

    return BusinessEntity(
        source_system=_SOURCE_SYSTEM,
        source_id=str(raw.get("id", global_id)),
        entity_type=EntityType.VENDOR,
        name=str(name),
        external_ids=_build_external_ids(raw),
        is_active=True,
        metadata=_build_metadata(raw),
    )


def map_customer(raw: dict[str, Any]) -> BusinessEntity | None:
    """Map an ERPI Customer dict to a Forge BusinessEntity."""
    global_id = raw.get("globalId") or raw.get("global_id")
    name = raw.get("name")
    if not global_id or not name:
        logger.warning("Customer missing globalId or name — skipping: %s", raw)
        return None

    return BusinessEntity(
        source_system=_SOURCE_SYSTEM,
        source_id=str(raw.get("id", global_id)),
        entity_type=EntityType.CUSTOMER,
        name=str(name),
        parent_id=_str_or_none(
            raw.get("parentCustomerId") or raw.get("parent_customer_id")
        ),
        external_ids=_build_external_ids(raw),
        is_active=True,
        metadata=_build_metadata(raw),
    )


def _build_external_ids(raw: dict[str, Any]) -> dict[str, str]:
    """Build cross-system ID map from ERPI fields."""
    ids: dict[str, str] = {}
    if raw.get("globalId"):
        ids["global"] = str(raw["globalId"])
    if raw.get("id"):
        ids["erpi"] = str(raw["id"])
    return ids


def _build_metadata(raw: dict[str, Any]) -> dict[str, Any]:
    """Extract ERPI transaction metadata for audit trail."""
    meta: dict[str, Any] = {}
    for key in ("transactionInitiator", "transactionStatus", "transactionType", "schemaVersion"):
        val = raw.get(key)
        if val is not None:
            meta[key] = val
    return meta


def _str_or_none(val: Any) -> str | None:
    return str(val) if val else None
