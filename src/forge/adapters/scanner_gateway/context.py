"""Context builder for the Scanner Gateway adapter.

Transforms scanner.v1 ScanEvent messages (as dicts) into Forge
RecordContext objects. Scanner events are simpler than transaction
events — they carry a barcode value, scan type, operator, device,
and location rather than complex domain payloads.
"""

from __future__ import annotations

from typing import Any

from forge.core.models.contextual_record import RecordContext

# ── Scan type normalization ───────────────────────────────────────
_SCAN_TYPE_MAP: dict[str, str] = {
    "SCAN_TYPE_ENTRY": "barrel.entry",
    "SCAN_TYPE_DUMP": "barrel.dump",
    "SCAN_TYPE_WITHDRAWAL": "barrel.withdrawal",
    "SCAN_TYPE_RELOCATION": "barrel.relocation",
    "SCAN_TYPE_INSPECTION": "barrel.inspection",
    "SCAN_TYPE_INVENTORY": "barrel.inventory",
    "SCAN_TYPE_LABEL_VERIFICATION": "barrel.label_verification",
    "SCAN_TYPE_ASSET_RECEIVE": "asset.receive",
    "SCAN_TYPE_ASSET_MOVE": "asset.move",
    "SCAN_TYPE_ASSET_INSTALL": "asset.install",
    "SCAN_TYPE_SAMPLE_COLLECT": "sample.collect",
    "SCAN_TYPE_SAMPLE_BIND": "sample.bind",
}


def _normalize_scan_type(raw_type: str | int | None) -> str:
    """Normalize a scanner.v1 ScanType to a Forge event type string."""
    if raw_type is None:
        return "unknown"

    if isinstance(raw_type, int):
        return f"scan.type_{raw_type}"

    raw_str = str(raw_type)
    if raw_str in _SCAN_TYPE_MAP:
        return _SCAN_TYPE_MAP[raw_str]

    # Try with prefix
    prefixed = f"SCAN_TYPE_{raw_str}"
    if prefixed in _SCAN_TYPE_MAP:
        return _SCAN_TYPE_MAP[prefixed]

    return f"scan.{raw_str.lower()}"


def build_record_context(
    scan_event: dict[str, Any],
) -> RecordContext:
    """Build a RecordContext from a scanner.v1 ScanEvent dict.

    Args:
        scan_event: Dict representation of a scanner.v1.ScanEvent.

    Returns:
        A RecordContext with scan-specific fields.
    """
    scan_type = _normalize_scan_type(scan_event.get("scan_type"))
    operator_id = scan_event.get("operator_id", "")
    device_id = scan_event.get("device_id", "")
    location = scan_event.get("location_string", "")
    barcode = scan_event.get("barcode_value", "")

    extra: dict[str, Any] = {
        "scan_id": scan_event.get("scan_id", ""),
        "scan_type": scan_type,
        "barcode_value": barcode,
        "device_id": device_id,
    }

    if scan_event.get("warehouse_job_id"):
        extra["warehouse_job_id"] = scan_event["warehouse_job_id"]
    if scan_event.get("batch_id"):
        extra["batch_id"] = scan_event["batch_id"]
    if scan_event.get("asset_id"):
        extra["asset_id"] = scan_event["asset_id"]

    # Merge metadata fields
    metadata = scan_event.get("metadata", {})
    if isinstance(metadata, dict):
        for key, value in metadata.items():
            if key not in extra and value is not None:
                extra[key] = value

    return RecordContext(
        equipment_id=device_id or None,
        area=location or None,
        operator_id=operator_id or None,
        batch_id=scan_event.get("warehouse_job_id") or None,
        extra=extra,
    )
