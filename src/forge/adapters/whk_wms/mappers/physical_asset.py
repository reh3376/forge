"""Map WMS StorageLocation / Warehouse → Forge PhysicalAsset.

WMS StorageLocation fields (from Prisma schema):
    id, warehouseId, buildingId, floor, rick, position, tier,
    status, capacity

WMS Warehouse fields:
    id, name, type, floors, tiers, isActive

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

_SOURCE_SYSTEM = "whk-wms"


def map_storage_location(raw: dict[str, Any]) -> PhysicalAsset | None:
    """Map a WMS StorageLocation dict to a Forge PhysicalAsset.

    Composes the location_path from warehouse topology fields:
    {warehouse}/{building}/F{floor}/R{rick}/P{position}

    Returns None if the id is missing.
    """
    loc_id = raw.get("id") or raw.get("storage_location_id")
    if not loc_id:
        logger.warning("StorageLocation missing id — skipping: %s", raw)
        return None

    # Build location path from topology fields
    path_parts: list[str] = []
    warehouse = raw.get("warehouseName") or raw.get("warehouse_name") or raw.get("warehouse")
    if warehouse:
        path_parts.append(str(warehouse))
    building = raw.get("buildingName") or raw.get("building_name") or raw.get("building")
    if building:
        path_parts.append(str(building))
    floor_val = raw.get("floor") or raw.get("floor_number")
    if floor_val is not None:
        path_parts.append(f"F{floor_val}")
    rick = raw.get("rick") or raw.get("rick_number")
    if rick is not None:
        path_parts.append(f"R{rick}")
    position = raw.get("position") or raw.get("position_number")
    if position is not None:
        path_parts.append(f"P{position}")

    location_path = "/".join(path_parts) if path_parts else None
    name = location_path or f"Location-{loc_id}"

    # Operational state from WMS status
    status = str(raw.get("status", "")).upper()
    op_state = _STATUS_TO_OP_STATE.get(status)

    return PhysicalAsset(
        source_system=_SOURCE_SYSTEM,
        source_id=str(loc_id),
        asset_type=AssetType.STORAGE_POSITION,
        name=name,
        parent_id=_str_or_none(raw.get("warehouseId") or raw.get("warehouse_id")),
        location_path=location_path,
        operational_state=op_state,
        capacity=_float_or_none(raw.get("capacity")),
        capacity_unit="barrels" if raw.get("capacity") else None,
        metadata={
            k: v
            for k, v in {
                "tier": raw.get("tier"),
                "floor": raw.get("floor"),
                "rick": raw.get("rick"),
                "position": raw.get("position"),
            }.items()
            if v is not None
        },
    )


def map_warehouse(raw: dict[str, Any]) -> PhysicalAsset | None:
    """Map a WMS Warehouse dict to a Forge PhysicalAsset.

    Returns None if the id is missing.
    """
    wh_id = raw.get("id") or raw.get("warehouse_id")
    if not wh_id:
        logger.warning("Warehouse missing id — skipping: %s", raw)
        return None

    name = raw.get("name") or f"Warehouse-{wh_id}"
    is_active = raw.get("isActive", True)

    return PhysicalAsset(
        source_system=_SOURCE_SYSTEM,
        source_id=str(wh_id),
        asset_type=AssetType.SITE,
        name=str(name),
        parent_id=None,
        location_path=str(name),
        operational_state=(
            AssetOperationalState.IDLE if is_active
            else AssetOperationalState.OFFLINE
        ),
        capacity=_float_or_none(raw.get("totalCapacity") or raw.get("total_capacity")),
        capacity_unit="barrels" if raw.get("totalCapacity") else None,
        metadata={
            k: v
            for k, v in {
                "warehouse_type": raw.get("type") or raw.get("warehouse_type"),
                "floors": raw.get("floors"),
                "tiers": raw.get("tiers"),
            }.items()
            if v is not None
        },
    )


_STATUS_TO_OP_STATE: dict[str, AssetOperationalState] = {
    "ACTIVE": AssetOperationalState.IDLE,
    "AVAILABLE": AssetOperationalState.IDLE,
    "IN_USE": AssetOperationalState.RUNNING,
    "MAINTENANCE": AssetOperationalState.MAINTENANCE,
    "OFFLINE": AssetOperationalState.OFFLINE,
    "DECOMMISSIONED": AssetOperationalState.OFFLINE,
}


def _str_or_none(val: Any) -> str | None:
    return str(val) if val else None


def _float_or_none(val: Any) -> float | None:
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None
