"""NMS mappers — convert raw NMS entities to Forge domain models.

Mappers transform NMS API responses into Forge core models:
- Devices → ManufacturingUnit (with device_metadata embedded)
- Trap/Alert/Security events → OperationalEvent
- Baseline anomalies → OperationalEvent
- SPOF detections → OperationalEvent
"""

from __future__ import annotations

from forge.adapters.whk_nms.mappers.device import map_device
from forge.adapters.whk_nms.mappers.events import (
    map_alert,
    map_baseline_anomaly,
    map_security_event,
    map_spof_detection,
    map_trap_event,
)

__all__ = [
    "map_device",
    "map_trap_event",
    "map_alert",
    "map_security_event",
    "map_baseline_anomaly",
    "map_spof_detection",
]
