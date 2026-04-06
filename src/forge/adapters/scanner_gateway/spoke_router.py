"""Spoke router — dispatches scan events to the correct Forge spoke.

The routing decision is based on the ScanType classification from the
scanner.v1 proto contract. Each scan type maps to exactly one target
spoke (or a list of spokes for events that must be delivered to multiple
systems, like INSPECTION which may go to both WMS and IMS).

The routing table is configuration-driven — new scan types and target
spokes are added by updating the routing rules, not by changing code.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class RouteTarget:
    """A destination spoke for a routed scan event."""

    adapter_id: str
    transform_hint: str = ""  # Optional hint for the adapter on how to ingest


@dataclass
class SpokeRouter:
    """Routes scan events to target spokes based on scan type.

    The router maintains a mapping from scan_type → list[RouteTarget].
    A single scan event may be routed to multiple spokes (e.g., an
    INSPECTION scan goes to both WMS for barrel tracking and IMS for
    asset compliance).
    """

    wms_adapter_id: str = "whk-wms"
    ims_adapter_id: str | None = "bosc-ims"
    qms_adapter_id: str | None = None
    _routing_table: dict[str, list[RouteTarget]] = field(
        default_factory=dict, init=False,
    )

    def __post_init__(self) -> None:
        """Build the routing table from configured spoke IDs."""
        self._build_routing_table()

    def _build_routing_table(self) -> None:
        """Construct the scan_type → RouteTarget mapping."""
        wms = RouteTarget(adapter_id=self.wms_adapter_id)

        # WMS barrel operations
        for scan_type in (
            "ENTRY", "DUMP", "WITHDRAWAL", "RELOCATION",
            "LABEL_VERIFICATION",
        ):
            self._routing_table[scan_type] = [wms]

        # Shared WMS + IMS operations
        if self.ims_adapter_id:
            ims = RouteTarget(adapter_id=self.ims_adapter_id)
            self._routing_table["INSPECTION"] = [wms, ims]
            self._routing_table["INVENTORY"] = [wms, ims]

            # IMS-only asset operations
            for scan_type in ("ASSET_RECEIVE", "ASSET_MOVE", "ASSET_INSTALL"):
                self._routing_table[scan_type] = [ims]
        else:
            # Without IMS, inspection/inventory go to WMS only
            self._routing_table["INSPECTION"] = [wms]
            self._routing_table["INVENTORY"] = [wms]

        # QMS sample operations
        if self.qms_adapter_id:
            qms = RouteTarget(adapter_id=self.qms_adapter_id)
            for scan_type in ("SAMPLE_COLLECT", "SAMPLE_BIND"):
                self._routing_table[scan_type] = [qms]

    def route(self, scan_type: str) -> list[RouteTarget]:
        """Return the target spokes for a given scan type.

        Args:
            scan_type: The scan type string (stripped of SCAN_TYPE_ prefix).

        Returns:
            List of RouteTargets. Empty list if scan type is unknown.
        """
        # Normalize: strip common prefixes
        normalized = scan_type.removeprefix("SCAN_TYPE_")
        return self._routing_table.get(normalized, [])

    def all_routes(self) -> dict[str, list[RouteTarget]]:
        """Return the full routing table (for discovery/diagnostics)."""
        return dict(self._routing_table)

    def target_adapter_ids(self) -> set[str]:
        """Return all unique adapter IDs in the routing table."""
        ids: set[str] = set()
        for targets in self._routing_table.values():
            for target in targets:
                ids.add(target.adapter_id)
        return ids
