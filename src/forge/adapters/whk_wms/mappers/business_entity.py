"""Map WMS Customer / Vendor → Forge BusinessEntity.

WMS Customer fields (from Prisma schema):
    id, globalId, data (JSON — name, location, contacts),
    parentCustomerId, status

WMS Vendor fields:
    id, globalId, data (JSON — name, contacts), status

Forge BusinessEntity fields:
    entity_type, name, parent_id, external_ids, contact_info,
    location, is_active + provenance envelope
"""

from __future__ import annotations

import logging
from typing import Any

from forge.core.models.manufacturing.business_entity import BusinessEntity
from forge.core.models.manufacturing.enums import EntityType

logger = logging.getLogger(__name__)

_SOURCE_SYSTEM = "whk-wms"


def map_customer(raw: dict[str, Any]) -> BusinessEntity | None:
    """Map a WMS Customer dict to a Forge BusinessEntity.

    WMS stores customer details in a nested `data` JSON field.
    Returns None if the id is missing.
    """
    cust_id = raw.get("id") or raw.get("customer_id")
    if not cust_id:
        logger.warning("Customer missing id — skipping: %s", raw)
        return None

    # WMS embeds customer info in a 'data' JSON blob
    data = raw.get("data", {}) or {}
    if isinstance(data, str):
        import json

        try:
            data = json.loads(data)
        except (json.JSONDecodeError, TypeError):
            data = {}

    name = (
        data.get("name")
        or raw.get("name")
        or f"Customer-{cust_id}"
    )

    external_ids: dict[str, str] = {}
    global_id = raw.get("globalId") or raw.get("global_id")
    if global_id:
        external_ids["global"] = str(global_id)
    erp_id = data.get("erpId") or data.get("erp_id")
    if erp_id:
        external_ids["erp"] = str(erp_id)

    contact_info: dict[str, str] = {}
    for key in ("email", "phone", "address"):
        val = data.get(key)
        if val:
            contact_info[key] = str(val)

    return BusinessEntity(
        source_system=_SOURCE_SYSTEM,
        source_id=str(cust_id),
        entity_type=EntityType.CUSTOMER,
        name=str(name),
        parent_id=_str_or_none(
            raw.get("parentCustomerId") or raw.get("parent_customer_id")
        ),
        external_ids=external_ids,
        contact_info=contact_info,
        location=data.get("location") or raw.get("location"),
        is_active=raw.get("status", "ACTIVE") != "INACTIVE",
    )


def map_vendor(raw: dict[str, Any]) -> BusinessEntity | None:
    """Map a WMS Vendor dict to a Forge BusinessEntity.

    Returns None if the id is missing.
    """
    vendor_id = raw.get("id") or raw.get("vendor_id")
    if not vendor_id:
        logger.warning("Vendor missing id — skipping: %s", raw)
        return None

    data = raw.get("data", {}) or {}
    if isinstance(data, str):
        import json

        try:
            data = json.loads(data)
        except (json.JSONDecodeError, TypeError):
            data = {}

    name = (
        data.get("name")
        or raw.get("name")
        or f"Vendor-{vendor_id}"
    )

    external_ids: dict[str, str] = {}
    global_id = raw.get("globalId") or raw.get("global_id")
    if global_id:
        external_ids["global"] = str(global_id)

    contact_info: dict[str, str] = {}
    for key in ("email", "phone", "address"):
        val = data.get(key)
        if val:
            contact_info[key] = str(val)

    return BusinessEntity(
        source_system=_SOURCE_SYSTEM,
        source_id=str(vendor_id),
        entity_type=EntityType.VENDOR,
        name=str(name),
        parent_id=None,
        external_ids=external_ids,
        contact_info=contact_info,
        location=data.get("location") or raw.get("location"),
        is_active=raw.get("status", "ACTIVE") != "INACTIVE",
    )


def _str_or_none(val: Any) -> str | None:
    return str(val) if val else None
