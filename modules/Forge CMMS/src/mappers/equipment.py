"""Map CMMS equipment entities → Forge ManufacturingUnit and metadata.

CMMS Asset represents equipment in an ISA-95 hierarchy:
    Asset (parent) → Asset (child) → ... (leaf asset)

Each asset has:
    - assetPath: Full hierarchical path (e.g., "Distillery01.Utility01.Neutralization01")
    - assetType: Equipment type (Pump, Tank, HeatExchanger, etc.)
    - assetMake: Manufacturer
    - assetModel: Model number
    - inServiceDate / outOfServiceDate: Lifecycle tracking
    - oemManufacturer: Original equipment manufacturer

Forge equivalents:
    Asset → ManufacturingUnit (assetPath → tag_path, assetType → unit_type, hierarchical)
    WorkOrderType → dict (metadata for work order classification)
    WorkRequestType → dict (metadata for maintenance request classification)
"""

from __future__ import annotations

import logging
from typing import Any

from forge.core.models.manufacturing.manufacturing_unit import ManufacturingUnit

logger = logging.getLogger(__name__)

_SOURCE_SYSTEM = "whk-cmms"


def map_asset(raw: dict[str, Any]) -> ManufacturingUnit | None:
    """Map a CMMS Asset to a Forge ManufacturingUnit."""
    global_id = raw.get("globalId") or raw.get("global_id") or raw.get("id")
    asset_path = raw.get("assetPath") or raw.get("asset_path")

    if not global_id or not asset_path:
        logger.warning("Asset missing globalId or assetPath — skipping: %s", raw)
        return None

    return ManufacturingUnit(
        source_system=_SOURCE_SYSTEM,
        source_id=str(global_id),
        unit_type=_str_or_none(raw.get("assetType") or raw.get("asset_type")) or "equipment",
        metadata={
            **_build_metadata(raw),
            "asset_path": asset_path,  # ISA-95 hierarchy path
            "parent_asset_id": _str_or_none(raw.get("parentAssetId") or raw.get("parent_asset_id")),
            "external_ids": _build_external_ids(raw),
            "is_active": raw.get("active", True),
            "asset_make": raw.get("assetMake") or raw.get("asset_make"),
            "asset_model": raw.get("assetModel") or raw.get("asset_model"),
            "oem_manufacturer": raw.get("oemManufacturer") or raw.get("oem_manufacturer"),
            "in_service_date": raw.get("inServiceDate") or raw.get("in_service_date"),
            "out_of_service_date": raw.get("outOfServiceDate") or raw.get("out_of_service_date"),
        },
    )


def map_work_order_type(raw: dict[str, Any]) -> dict[str, Any]:
    """Map a CMMS WorkOrderType to metadata dict for classification.

    WorkOrderTypes define work order categories (Preventive, Corrective, Predictive, etc.)
    These are primarily used as reference data for filtering and classification,
    not as standalone entities. Returned as metadata for embedding in WorkOrder records.
    """
    global_id = raw.get("globalId") or raw.get("global_id") or raw.get("id")
    type_name = raw.get("typeName") or raw.get("type_name")

    if not global_id or not type_name:
        logger.warning("WorkOrderType missing globalId or typeName — skipping: %s", raw)
        return {}

    return {
        "entity_type": "work_order_type",
        "type_id": str(global_id),
        "type_name": str(type_name),
        "type_description": _str_or_none(raw.get("typeDescription") or raw.get("type_description")),
        "external_ids": _build_external_ids(raw),
        **_build_metadata(raw),
    }


def map_work_request_type(raw: dict[str, Any]) -> dict[str, Any]:
    """Map a CMMS WorkRequestType to metadata dict for classification.

    WorkRequestTypes define work request categories (Emergency, Routine, Improvement, etc.)
    These are primarily used as reference data for filtering and classification,
    not as standalone entities. Returned as metadata for embedding in WorkRequest records.
    """
    global_id = raw.get("globalId") or raw.get("global_id") or raw.get("id")
    type_name = raw.get("typeName") or raw.get("type_name")

    if not global_id or not type_name:
        logger.warning("WorkRequestType missing globalId or typeName — skipping: %s", raw)
        return {}

    return {
        "entity_type": "work_request_type",
        "type_id": str(global_id),
        "type_name": str(type_name),
        "type_description": _str_or_none(raw.get("typeDescription") or raw.get("type_description")),
        "external_ids": _build_external_ids(raw),
        **_build_metadata(raw),
    }


def _build_external_ids(raw: dict[str, Any]) -> dict[str, str]:
    ids: dict[str, str] = {}
    if raw.get("globalId"):
        ids["global"] = str(raw["globalId"])
    if raw.get("id"):
        ids["cmms"] = str(raw["id"])
    return ids


def _build_metadata(raw: dict[str, Any]) -> dict[str, Any]:
    meta: dict[str, Any] = {}
    for key in ("createdAt", "updatedAt", "created_at", "updated_at"):
        val = raw.get(key)
        if val is not None:
            meta[key] = val
    return meta


def _str_or_none(val: Any) -> str | None:
    return str(val) if val else None
