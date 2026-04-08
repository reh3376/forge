"""Context builder for the NextTrend Historian adapter.

Transforms NextTrend tag value responses into Forge RecordContext
objects. Historian records are simpler than transactional events —
each carries a tag name, value, timestamp, quality code, and
optional engineering units.
"""

from __future__ import annotations

from typing import Any

from forge.core.models.contextual_record import RecordContext

# ── Quality code mapping ─────────────────────────────────────────
# NextTrend uses OPC UA quality codes (u8):
#   192 = GOOD, 64 = UNCERTAIN, 0 = BAD
_QUALITY_MAP: dict[int, str] = {
    192: "GOOD",
    64: "UNCERTAIN",
    0: "BAD",
}


def _quality_label(code: int | None) -> str:
    """Map an OPC UA quality code to a human-readable label."""
    if code is None:
        return "UNKNOWN"
    return _QUALITY_MAP.get(code, f"OPC_{code}")


def build_record_context(
    tag_meta: dict[str, Any],
    value_point: dict[str, Any] | None = None,
) -> RecordContext:
    """Build a RecordContext from NextTrend tag metadata and value.

    Args:
        tag_meta: Tag metadata dict from GET /tags or /tags/browse.
            Expected keys: id, name, data_type, unit, description,
            source, retention_tier, asset_id.
        value_point: Optional single value point from history or SSE.
            Expected keys: ts, value, quality.

    Returns:
        A RecordContext with historian-specific fields.
    """
    tag_name = tag_meta.get("name", "")
    tag_id = tag_meta.get("id", "")
    data_type = tag_meta.get("data_type", "")
    unit = tag_meta.get("unit") or tag_meta.get("engineering_units") or ""

    quality_code = None
    if value_point:
        quality_code = value_point.get("quality")

    extra: dict[str, Any] = {
        "tag_name": tag_name,
        "tag_id": tag_id,
        "data_type": data_type,
        "quality": _quality_label(quality_code),
        "quality_code": quality_code if quality_code is not None else -1,
    }

    if unit:
        extra["unit"] = unit

    if tag_meta.get("source"):
        extra["source"] = tag_meta["source"]

    if tag_meta.get("retention_tier"):
        extra["retention_tier"] = tag_meta["retention_tier"]

    if tag_meta.get("asset_id"):
        extra["asset_id"] = tag_meta["asset_id"]

    if tag_meta.get("description"):
        extra["description"] = tag_meta["description"]

    # Derive area from tag path hierarchy (first two segments)
    # e.g., "WH/WHK01/Distillery01/Temp" → "WH/WHK01"
    path_parts = tag_name.split("/")
    area = "/".join(path_parts[:2]) if len(path_parts) >= 2 else tag_name

    return RecordContext(
        equipment_id=tag_id or None,
        area=area or None,
        operator_id=None,
        batch_id=None,
        extra=extra,
    )
