"""Tests for the Scanner Gateway device registry."""

from datetime import datetime, timezone, timedelta

from forge.adapters.scanner_gateway.device_registry import (
    DeviceRecord,
    DeviceRegistry,
)

# ── DeviceRecord ────────────────────────────────────────────────


class TestDeviceRecord:
    """Verify DeviceRecord state tracking."""

    def test_new_device_is_offline(self):
        """A freshly created device with no heartbeat is offline."""
        record = DeviceRecord(device_id="dev-001")
        assert record.is_online is False

    def test_recent_heartbeat_is_online(self):
        record = DeviceRecord(
            device_id="dev-001",
            last_heartbeat=datetime.now(tz=timezone.utc),
            heartbeat_interval_s=30,
        )
        assert record.is_online is True

    def test_stale_heartbeat_is_offline(self):
        """A device whose heartbeat exceeds 3x interval is offline."""
        stale_time = datetime.now(tz=timezone.utc) - timedelta(seconds=100)
        record = DeviceRecord(
            device_id="dev-001",
            last_heartbeat=stale_time,
            heartbeat_interval_s=30,
        )
        assert record.is_online is False

    def test_to_dict_includes_all_fields(self):
        record = DeviceRecord(
            device_id="dev-001",
            device_model="TC52",
            operator_id="USR-01",
        )
        d = record.to_dict()
        assert d["device_id"] == "dev-001"
        assert d["device_model"] == "TC52"
        assert d["operator_id"] == "USR-01"
        assert "is_online" in d
        assert "registered_at" in d

    def test_to_dict_null_heartbeat(self):
        record = DeviceRecord(device_id="dev-001")
        d = record.to_dict()
        assert d["last_heartbeat"] is None

    def test_to_dict_with_heartbeat(self):
        record = DeviceRecord(
            device_id="dev-001",
            last_heartbeat=datetime(2026, 4, 6, tzinfo=timezone.utc),
        )
        d = record.to_dict()
        assert "2026-04-06" in d["last_heartbeat"]


# ── DeviceRegistry ──────────────────────────────────────────────


class TestDeviceRegistration:
    """Verify device registration and lookup."""

    def test_register_new_device(self):
        reg = DeviceRegistry()
        record = reg.register(
            device_id="dev-001",
            device_model="TC52",
            app_version="1.2.0",
        )
        assert record.device_id == "dev-001"
        assert record.device_model == "TC52"
        assert reg.device_count == 1

    def test_register_duplicate_updates(self):
        """Re-registration with same ID updates fields, not duplicates."""
        reg = DeviceRegistry()
        reg.register(device_id="dev-001", app_version="1.0")
        reg.register(device_id="dev-001", app_version="1.1")
        assert reg.device_count == 1
        assert reg.get("dev-001").app_version == "1.1"

    def test_register_preserves_model_on_reregister(self):
        """Re-registration doesn't lose the original device_model."""
        reg = DeviceRegistry()
        reg.register(device_id="dev-001", device_model="TC52")
        rec = reg.register(device_id="dev-001", device_model="")
        # device_model is only set on first registration
        assert rec.device_model == "TC52"

    def test_unregister_removes_device(self):
        reg = DeviceRegistry()
        reg.register(device_id="dev-001")
        assert reg.unregister("dev-001") is True
        assert reg.device_count == 0

    def test_unregister_nonexistent_returns_false(self):
        reg = DeviceRegistry()
        assert reg.unregister("dev-999") is False

    def test_get_existing_device(self):
        reg = DeviceRegistry()
        reg.register(device_id="dev-001")
        assert reg.get("dev-001") is not None
        assert reg.get("dev-001").device_id == "dev-001"

    def test_get_missing_device_returns_none(self):
        reg = DeviceRegistry()
        assert reg.get("dev-999") is None

    def test_is_registered(self):
        reg = DeviceRegistry()
        reg.register(device_id="dev-001")
        assert reg.is_registered("dev-001") is True
        assert reg.is_registered("dev-999") is False


class TestDeviceHeartbeat:
    """Verify heartbeat tracking."""

    def test_heartbeat_updates_timestamp(self):
        reg = DeviceRegistry()
        reg.register(device_id="dev-001")
        record = reg.record_heartbeat("dev-001")
        assert record is not None
        assert record.last_heartbeat is not None

    def test_heartbeat_unknown_device_returns_none(self):
        reg = DeviceRegistry()
        assert reg.record_heartbeat("dev-999") is None

    def test_heartbeat_updates_battery(self):
        reg = DeviceRegistry()
        reg.register(device_id="dev-001")
        reg.record_heartbeat("dev-001", battery_pct=85)
        assert reg.get("dev-001").metadata["battery_pct"] == 85

    def test_heartbeat_updates_signal(self):
        reg = DeviceRegistry()
        reg.register(device_id="dev-001")
        reg.record_heartbeat("dev-001", signal_strength=-45)
        assert reg.get("dev-001").metadata["signal_strength"] == -45

    def test_heartbeat_updates_operator(self):
        reg = DeviceRegistry()
        reg.register(device_id="dev-001")
        reg.record_heartbeat("dev-001", operator_id="USR-02")
        assert reg.get("dev-001").operator_id == "USR-02"

    def test_heartbeat_makes_device_online(self):
        reg = DeviceRegistry()
        reg.register(device_id="dev-001")
        assert reg.get("dev-001").is_online is False
        reg.record_heartbeat("dev-001")
        assert reg.get("dev-001").is_online is True


class TestDeviceListings:
    """Verify bulk device queries."""

    def _setup_devices(self) -> DeviceRegistry:
        reg = DeviceRegistry()
        reg.register(device_id="dev-001")
        reg.register(device_id="dev-002")
        reg.register(device_id="dev-003")
        # Only dev-001 has a heartbeat
        reg.record_heartbeat("dev-001")
        return reg

    def test_online_devices(self):
        reg = self._setup_devices()
        online = reg.online_devices()
        assert len(online) == 1
        assert online[0].device_id == "dev-001"

    def test_offline_devices(self):
        reg = self._setup_devices()
        offline = reg.offline_devices()
        assert len(offline) == 2

    def test_all_devices(self):
        reg = self._setup_devices()
        assert len(reg.all_devices()) == 3

    def test_online_count(self):
        reg = self._setup_devices()
        assert reg.online_count == 1

    def test_summary_structure(self):
        reg = self._setup_devices()
        summary = reg.summary()
        assert summary["total_devices"] == 3
        assert summary["online_devices"] == 1
        assert summary["offline_devices"] == 2
        assert len(summary["devices"]) == 3
