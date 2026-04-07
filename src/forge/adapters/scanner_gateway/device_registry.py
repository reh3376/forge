"""Device registry for Android scanner edge devices.

Tracks registered devices, their authentication state, and heartbeat
health. The registry is the gateway's answer to the question "which
devices am I responsible for, and are they alive?"

In production, device registrations are persisted to the hub's device
store. This module provides the in-memory working set that the
ScannerServiceHandler consults on every incoming RPC.

Heartbeat tracking:
    Each device sends periodic Heartbeat RPCs. The registry marks the
    device as ONLINE when a heartbeat arrives and OFFLINE when the
    heartbeat interval is exceeded by a configurable factor (default 3x).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


# ── Device state ────────────────────────────────────────────────


@dataclass
class DeviceRecord:
    """In-memory record of a registered Android scanner device."""

    device_id: str
    device_model: str = ""
    os_version: str = ""
    app_version: str = ""
    operator_id: str | None = None
    site_id: str | None = None
    registered_at: datetime = field(
        default_factory=lambda: datetime.now(tz=timezone.utc),
    )
    last_heartbeat: datetime | None = None
    heartbeat_interval_s: int = 30  # Expected heartbeat interval
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def is_online(self) -> bool:
        """Check if the device has sent a recent heartbeat.

        A device is considered online if its last heartbeat was within
        3x the expected heartbeat interval. This gives tolerance for
        network jitter without marking devices offline too aggressively.
        """
        if self.last_heartbeat is None:
            return False
        elapsed = (
            datetime.now(tz=timezone.utc) - self.last_heartbeat
        ).total_seconds()
        return elapsed < self.heartbeat_interval_s * 3

    def to_dict(self) -> dict[str, Any]:
        """Serialize to a dict for diagnostics and hub reporting."""
        return {
            "device_id": self.device_id,
            "device_model": self.device_model,
            "os_version": self.os_version,
            "app_version": self.app_version,
            "operator_id": self.operator_id,
            "site_id": self.site_id,
            "registered_at": self.registered_at.isoformat(),
            "last_heartbeat": (
                self.last_heartbeat.isoformat()
                if self.last_heartbeat
                else None
            ),
            "is_online": self.is_online,
        }


# ── Registry ────────────────────────────────────────────────────


class DeviceRegistry:
    """In-memory registry of known Android scanner devices.

    Thread safety: In production, this would need a lock since
    heartbeat RPCs and registration RPCs arrive concurrently on
    the grpc.aio event loop. For now, since we're single-threaded
    async, no lock is needed — asyncio is cooperative.
    """

    def __init__(self) -> None:
        self._devices: dict[str, DeviceRecord] = {}

    def register(
        self,
        *,
        device_id: str,
        device_model: str = "",
        os_version: str = "",
        app_version: str = "",
        operator_id: str | None = None,
        site_id: str | None = None,
        heartbeat_interval_s: int = 30,
        metadata: dict[str, Any] | None = None,
    ) -> DeviceRecord:
        """Register a device (or update an existing registration).

        Re-registration with the same device_id updates the record
        rather than creating a duplicate — devices may re-register
        after an app restart or network reconnect.
        """
        existing = self._devices.get(device_id)
        now = datetime.now(tz=timezone.utc)

        if existing is not None:
            # Update fields that may change on re-registration
            existing.app_version = app_version
            existing.os_version = os_version
            existing.operator_id = operator_id
            existing.site_id = site_id
            existing.heartbeat_interval_s = heartbeat_interval_s
            if metadata:
                existing.metadata.update(metadata)
            logger.info("Device re-registered: %s", device_id)
            return existing

        record = DeviceRecord(
            device_id=device_id,
            device_model=device_model,
            os_version=os_version,
            app_version=app_version,
            operator_id=operator_id,
            site_id=site_id,
            registered_at=now,
            heartbeat_interval_s=heartbeat_interval_s,
            metadata=metadata or {},
        )
        self._devices[device_id] = record
        logger.info("Device registered: %s (model=%s)", device_id, device_model)
        return record

    def unregister(self, device_id: str) -> bool:
        """Remove a device registration. Returns True if it existed."""
        removed = self._devices.pop(device_id, None)
        if removed is not None:
            logger.info("Device unregistered: %s", device_id)
        return removed is not None

    def record_heartbeat(
        self,
        device_id: str,
        *,
        battery_pct: int | None = None,
        signal_strength: int | None = None,
        operator_id: str | None = None,
    ) -> DeviceRecord | None:
        """Record a heartbeat from a device.

        Returns the updated DeviceRecord, or None if the device
        is not registered (heartbeat from unknown device).
        """
        record = self._devices.get(device_id)
        if record is None:
            logger.warning("Heartbeat from unknown device: %s", device_id)
            return None

        record.last_heartbeat = datetime.now(tz=timezone.utc)

        # Update optional telemetry
        if battery_pct is not None:
            record.metadata["battery_pct"] = battery_pct
        if signal_strength is not None:
            record.metadata["signal_strength"] = signal_strength
        if operator_id is not None:
            record.operator_id = operator_id

        return record

    def get(self, device_id: str) -> DeviceRecord | None:
        """Look up a device by ID."""
        return self._devices.get(device_id)

    def is_registered(self, device_id: str) -> bool:
        """Check if a device is registered."""
        return device_id in self._devices

    def online_devices(self) -> list[DeviceRecord]:
        """Return all devices that have a recent heartbeat."""
        return [d for d in self._devices.values() if d.is_online]

    def offline_devices(self) -> list[DeviceRecord]:
        """Return all devices that have not sent a recent heartbeat."""
        return [d for d in self._devices.values() if not d.is_online]

    def all_devices(self) -> list[DeviceRecord]:
        """Return all registered devices."""
        return list(self._devices.values())

    @property
    def device_count(self) -> int:
        """Total number of registered devices."""
        return len(self._devices)

    @property
    def online_count(self) -> int:
        """Number of currently online devices."""
        return sum(1 for d in self._devices.values() if d.is_online)

    def summary(self) -> dict[str, Any]:
        """Return a summary for health reporting."""
        return {
            "total_devices": self.device_count,
            "online_devices": self.online_count,
            "offline_devices": self.device_count - self.online_count,
            "devices": [d.to_dict() for d in self._devices.values()],
        }
