"""Map MES Customer + Vendor -> Forge BusinessEntity.

MES Customer fields (from Prisma schema):
    id, globalId, name, location, contactInfo (JSON)
MES Vendor fields (from Prisma schema):
    id, globalId, erpId, name, contactInfo (JSON)

These are structurally simpler than WMS's versions (no nested
JSON data blob). Both map to Forge BusinessEntity with different
EntityType values.

Forge BusinessEntity fields:
    entity_type, name, parent_id, external_ids, contact_info,
    location, is_active + provenance envelope
"""

from __future__ import annotations

import json
import logging
from typing import Any

from forge.core.models.manufacturing.business_entity import BusinessEntity
from forge.core.models.manufacturing.enums import EntityType

logger = logging.getLogger(__name__)

_SOURCE_SYSTEM = "whk-mes"


def map_customer(raw: dict[str, Any]) -> BusinessEntity | None:
    """Map an MES Customer dict to a Forge BusinessEntity.

    Returns None if the customer id or name is missing.
    """
    cust_id = raw.get("id") or raw.get("customer_id") or raw.get("customerId")
    name = raw.get("name") or raw.get("customerName") or raw.get("customer_name")
    if not cust_id or not name:
        logger.warning("Customer dict missing id or name -- skipping: %s", raw)
        return None

    external_ids: dict[str, str] = {}
    global_id = raw.get("globalId") or raw.get("global_id")
    if global_id:
        external_ids["global"] = str(global_id)
    erp_id = raw.get("erpId") or raw.get("erp_id")
    if erp_id:
        external_ids["erp"] = str(erp_id)

    contact_info = _parse_contact_info(raw.get("contactInfo") or raw.get("contact_info"))

    return BusinessEntity(
        source_system=_SOURCE_SYSTEM,
        source_id=str(cust_id),
        entity_type=EntityType.CUSTOMER,
        name=str(name),
        parent_id=_str_or_none(raw.get("parentId") or raw.get("parent_id")),
        external_ids=external_ids,
        contact_info=contact_info,
        location=raw.get("location"),
        is_active=raw.get("isActive", True) if "isActive" in raw else raw.get("is_active", True),
    )


def map_vendor(raw: dict[str, Any]) -> BusinessEntity | None:
    """Map an MES Vendor dict to a Forge BusinessEntity.

    Returns None if the vendor id or name is missing.
    """
    vendor_id = raw.get("id") or raw.get("vendor_id") or raw.get("vendorId")
    name = raw.get("name") or raw.get("vendorName") or raw.get("vendor_name")
    if not vendor_id or not name:
        logger.warning("Vendor dict missing id or name -- skipping: %s", raw)
        return None

    external_ids: dict[str, str] = {}
    global_id = raw.get("globalId") or raw.get("global_id")
    if global_id:
        external_ids["global"] = str(global_id)
    erp_id = raw.get("erpId") or raw.get("erp_id")
    if erp_id:
        external_ids["erp"] = str(erp_id)

    contact_info = _parse_contact_info(raw.get("contactInfo") or raw.get("contact_info"))

    return BusinessEntity(
        source_system=_SOURCE_SYSTEM,
        source_id=str(vendor_id),
        entity_type=EntityType.VENDOR,
        name=str(name),
        external_ids=external_ids,
        contact_info=contact_info,
        location=raw.get("location"),
        is_active=raw.get("isActive", True) if "isActive" in raw else raw.get("is_active", True),
    )


def _parse_contact_info(val: Any) -> dict[str, str]:
    """Parse contact info from string JSON or dict."""
    if val is None:
        return {}
    if isinstance(val, dict):
        return {k: str(v) for k, v in val.items() if v is not None}
    if isinstance(val, str):
        try:
            parsed = json.loads(val)
            if isinstance(parsed, dict):
                return {k: str(v) for k, v in parsed.items() if v is not None}
        except (json.JSONDecodeError, TypeError):
            pass
    return {}


def _str_or_none(val: Any) -> str | None:
    return str(val) if val else None
