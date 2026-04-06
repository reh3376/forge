"""Map MES Asset -> Forge PhysicalAsset.

MES Asset fields (from Prisma schema):
    id, name, assetType, status, operationalState, parentId,
    assetPath, description, capacity

MES follows an ISA-88/ISA-95 equipment hierarchy:
    Site -> Area -> Work Center -> Equipment -> Sub-Equipment

The parentId + assetPath fields encode this hierarchy. Forge's
PhysicalAsset captures this via parent_id and location_path.

Forge PhysicalAsset fields:
    asset_type, name, parent_id, location_path, operational_state,
    capacity, capacity_unit + provenance envelope
"""

from __future__ import annotations

import logging
from typing import Any

from forge.core.models.manufacturing.enums import (
    AssetOperationalState,
    AssetType,
)
from forge.core.models.manufacturing.physical_asset import PhysicalAsset

logger = logging.getLogger(__name__)

_SOURCE_SYSTEM = "whk-mes"

# MES asset type string -> Forge AssetType
_ASSET_TYPE_MAP: dict[str, AssetType] = {
    "SITE": AssetType.SITE,
    "AREA": AssetType.AREA,
    "WORK_CENTER": AssetType.WORK_CENTER,
    "WORK_UNIT": AssetType.WORK_UNIT,
    "EQUIPMENT": AssetType.EQUIPMENT,
    "LINE": AssetType.WORK_CENTER,
    "CELL": AssetType.WORK_UNIT,
    "STORAGE": AssetType.STORAGE_ZONE,
    "STAGING": AssetType.STAGING_AREA,
}

# MES operational state -> Forge AssetOperationalState
_OP_STATE_MAP: dict[str, AssetOperationalState] = {
    "IDLE": AssetOperationalState.IDLE,
    "RUNNING": AssetOperationalState.RUNNING,
    "ACTIVE": AssetOperationalState.RUNNING,
    "MAINTENANCE": AssetOperationalState.MAINTENANCE,
    "CHANGEOVER": AssetOperationalState.CHANGEOVER,
    "OFFLINE": AssetOperationalState.OFFLINE,
    "DISABLED": AssetOperationalState.OFFLINE,
    "FAULTED": AssetOperationalState.FAULTED,
    "ERROR": AssetOperationalState.FAULTED,
}


def map_asset(raw: dict[str, Any]) -> PhysicalAsset | None:
    """Map an MES Asset dict to a Forge PhysicalAsset.

    Returns None if the asset id or name is missing.
    """
    asset_id = raw.get("id") or raw.get("asset_id") or raw.get("assetId")
    name = raw.get("name") or raw.get("asset_name") or raw.get("assetName")
    if not asset_id or not name:
        logger.warning("Asset dict missing id or name -- skipping: %s", raw)
        return None

    asset_type_raw = str(raw.get("assetType") or raw.get("asset_type") or "EQUIPMENT").upper()
    op_state_raw = str(
        raw.get("operationalState") or raw.get("operational_state") or ""
    ).upper()

    return PhysicalAsset(
        source_system=_SOURCE_SYSTEM,
        source_id=str(asset_id),
        asset_type=_ASSET_TYPE_MAP.get(asset_type_raw, AssetType.EQUIPMENT),
        name=str(name),
        parent_id=_str_or_none(raw.get("parentId") or raw.get("parent_id")),
        location_path=raw.get("assetPath") or raw.get("asset_path"),
        operational_state=_OP_STATE_MAP.get(op_state_raw),
        capacity=_float_or_none(raw.get("capacity")),
        capacity_unit=raw.get("capacityUnit") or raw.get("capacity_unit"),
        metadata={
            k: v
            for k, v in {
                "status": raw.get("status"),
                "description": raw.get("description"),
                "class_id": raw.get("classIdId") or raw.get("class_id"),
            }.items()
            if v is not None
        },
    )


def _str_or_none(val: Any) -> str | None:
    return str(val) if val else None


def _float_or_none(val: Any) -> float | None:
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None
