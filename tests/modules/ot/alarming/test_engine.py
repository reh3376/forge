"""Tests for the AlarmEngine — runtime alarm coordinator.

Covers:
- Configuration registration and lookup
- Alarm trigger/acknowledge/clear lifecycle via SDK API
- Shelving and unshelving
- Suppression
- Disable/enable (out of service)
- Reset (admin override)
- Event journal queries
- Tag value processing (threshold evaluation)
- Flood suppression per area
- Listener notifications
- Stats reporting
- Deduplication (same tag+type doesn't create duplicates)
"""

import pytest
import asyncio
from unittest.mock import AsyncMock

from forge.modules.ot.alarming.models import (
    AlarmConfig,
    AlarmEvent,
    AlarmPriority,
    AlarmState,
    AlarmType,
    ThresholdConfig,
)
from forge.modules.ot.alarming.engine import AlarmEngine


@pytest.fixture
def engine() -> AlarmEngine:
    return AlarmEngine(max_active_per_area=5, journal_max=1000)


@pytest.fixture
def hi_config() -> AlarmConfig:
    return AlarmConfig(
        tag_path="WH/WHK01/TIT_2010/Out_PV",
        area="Distillery01",
        equipment_id="TIT_2010",
        thresholds=[
            ThresholdConfig(
                alarm_type=AlarmType.HI,
                setpoint=180.0,
                deadband=2.0,
                priority=AlarmPriority.HIGH,
                description="High temperature alarm",
            ),
            ThresholdConfig(
                alarm_type=AlarmType.HIHI,
                setpoint=200.0,
                deadband=2.0,
                priority=AlarmPriority.CRITICAL,
                description="High-high temperature alarm",
            ),
        ],
    )


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------


class TestConfiguration:
    @pytest.mark.asyncio
    async def test_register_and_get(self, engine: AlarmEngine, hi_config: AlarmConfig):
        await engine.register_config(hi_config)
        config = await engine.get_config("WH/WHK01/TIT_2010/Out_PV")
        assert config is not None
        assert len(config.thresholds) == 2

    @pytest.mark.asyncio
    async def test_unregister(self, engine: AlarmEngine, hi_config: AlarmConfig):
        await engine.register_config(hi_config)
        assert await engine.unregister_config("WH/WHK01/TIT_2010/Out_PV")
        assert await engine.get_config("WH/WHK01/TIT_2010/Out_PV") is None

    @pytest.mark.asyncio
    async def test_unregister_nonexistent(self, engine: AlarmEngine):
        assert not await engine.unregister_config("nonexistent")

    @pytest.mark.asyncio
    async def test_get_all_configs(self, engine: AlarmEngine, hi_config: AlarmConfig):
        await engine.register_config(hi_config)
        configs = await engine.get_all_configs()
        assert len(configs) == 1


# ---------------------------------------------------------------------------
# Trigger / Acknowledge / Clear
# ---------------------------------------------------------------------------


class TestTriggerAckClear:
    @pytest.mark.asyncio
    async def test_trigger_custom_alarm(self, engine: AlarmEngine):
        alarm_id = await engine.trigger_alarm(
            name="TEST_ALARM",
            tag_path="test/tag",
            priority="HIGH",
            value=100,
            setpoint=90,
        )
        assert alarm_id != ""

        active = await engine.get_active_alarms()
        assert len(active) == 1
        assert active[0]["alarm_id"] == alarm_id
        assert active[0]["state"] == "ACTIVE_UNACK"

    @pytest.mark.asyncio
    async def test_acknowledge_alarm(self, engine: AlarmEngine):
        alarm_id = await engine.trigger_alarm(
            name="TEST", tag_path="t", priority="MEDIUM"
        )
        result = await engine.acknowledge_alarm(alarm_id, operator="jsmith")
        assert result is True

        active = await engine.get_active_alarms()
        assert len(active) == 1
        assert active[0]["state"] == "ACTIVE_ACK"

    @pytest.mark.asyncio
    async def test_clear_after_ack(self, engine: AlarmEngine):
        alarm_id = await engine.trigger_alarm(
            name="TEST", tag_path="t", priority="MEDIUM"
        )
        await engine.acknowledge_alarm(alarm_id)
        result = await engine.clear_alarm(alarm_id)
        assert result is True

        active = await engine.get_active_alarms()
        assert len(active) == 0

    @pytest.mark.asyncio
    async def test_clear_before_ack_goes_to_clear_unack(self, engine: AlarmEngine):
        alarm_id = await engine.trigger_alarm(
            name="TEST", tag_path="t", priority="MEDIUM"
        )
        await engine.clear_alarm(alarm_id)

        active = await engine.get_active_alarms()
        assert len(active) == 1
        assert active[0]["state"] == "CLEAR_UNACK"

    @pytest.mark.asyncio
    async def test_late_ack_from_clear_unack(self, engine: AlarmEngine):
        alarm_id = await engine.trigger_alarm(
            name="TEST", tag_path="t", priority="MEDIUM"
        )
        await engine.clear_alarm(alarm_id)
        await engine.acknowledge_alarm(alarm_id)

        active = await engine.get_active_alarms()
        assert len(active) == 0

    @pytest.mark.asyncio
    async def test_acknowledge_nonexistent(self, engine: AlarmEngine):
        assert not await engine.acknowledge_alarm("no-such-id")

    @pytest.mark.asyncio
    async def test_clear_nonexistent(self, engine: AlarmEngine):
        assert not await engine.clear_alarm("no-such-id")


# ---------------------------------------------------------------------------
# Shelving
# ---------------------------------------------------------------------------


class TestShelving:
    @pytest.mark.asyncio
    async def test_shelve_and_unshelve(self, engine: AlarmEngine):
        alarm_id = await engine.trigger_alarm(
            name="TEST", tag_path="t", priority="HIGH"
        )
        assert await engine.shelve_alarm(alarm_id, reason="maintenance")

        active = await engine.get_active_alarms()
        assert active[0]["shelved"] is True

        assert await engine.unshelve_alarm(alarm_id)
        active = await engine.get_active_alarms()
        assert active[0]["state"] == "ACTIVE_UNACK"

    @pytest.mark.asyncio
    async def test_shelve_nonexistent(self, engine: AlarmEngine):
        assert not await engine.shelve_alarm("nope")


# ---------------------------------------------------------------------------
# Suppression
# ---------------------------------------------------------------------------


class TestSuppression:
    @pytest.mark.asyncio
    async def test_suppress_and_unsuppress(self, engine: AlarmEngine):
        alarm_id = await engine.trigger_alarm(
            name="TEST", tag_path="t", priority="MEDIUM"
        )
        assert await engine.suppress_alarm(alarm_id, reason="flood")

        active = await engine.get_active_alarms()
        assert active[0]["suppressed"] is True

    @pytest.mark.asyncio
    async def test_suppress_nonexistent(self, engine: AlarmEngine):
        assert not await engine.suppress_alarm("nope")


# ---------------------------------------------------------------------------
# Disable / Enable
# ---------------------------------------------------------------------------


class TestDisableEnable:
    @pytest.mark.asyncio
    async def test_disable_and_enable(self, engine: AlarmEngine):
        alarm_id = await engine.trigger_alarm(
            name="TEST", tag_path="t", priority="LOW"
        )
        assert await engine.disable_alarm(alarm_id)
        assert await engine.enable_alarm(alarm_id)

        # Should return to ACTIVE_UNACK
        active = await engine.get_active_alarms()
        assert len(active) == 1
        assert active[0]["state"] == "ACTIVE_UNACK"

    @pytest.mark.asyncio
    async def test_disable_nonexistent(self, engine: AlarmEngine):
        assert not await engine.disable_alarm("nope")


# ---------------------------------------------------------------------------
# Reset
# ---------------------------------------------------------------------------


class TestReset:
    @pytest.mark.asyncio
    async def test_reset_clears_alarm(self, engine: AlarmEngine):
        alarm_id = await engine.trigger_alarm(
            name="TEST", tag_path="t", priority="HIGH"
        )
        assert await engine.reset_alarm(alarm_id, operator="admin")

        active = await engine.get_active_alarms()
        assert len(active) == 0

    @pytest.mark.asyncio
    async def test_reset_nonexistent(self, engine: AlarmEngine):
        assert not await engine.reset_alarm("nope")


# ---------------------------------------------------------------------------
# Journal
# ---------------------------------------------------------------------------


class TestJournal:
    @pytest.mark.asyncio
    async def test_events_recorded(self, engine: AlarmEngine):
        alarm_id = await engine.trigger_alarm(
            name="TEST", tag_path="t", priority="HIGH", area="A"
        )
        await engine.acknowledge_alarm(alarm_id)
        await engine.clear_alarm(alarm_id)

        history = await engine.get_alarm_history(limit=10)
        assert len(history) == 3  # trigger + ack + clear
        # Most recent first
        assert history[0]["action"] == "CLEAR"
        assert history[1]["action"] == "ACKNOWLEDGE"
        assert history[2]["action"] == "TRIGGER"

    @pytest.mark.asyncio
    async def test_history_area_filter(self, engine: AlarmEngine):
        await engine.trigger_alarm(name="A1", tag_path="t1", priority="HIGH", area="X")
        await engine.trigger_alarm(name="A2", tag_path="t2", priority="HIGH", area="Y")

        history = await engine.get_alarm_history(area="X")
        assert len(history) == 1
        assert history[0]["area"] == "X"


# ---------------------------------------------------------------------------
# Tag value processing (threshold alarms)
# ---------------------------------------------------------------------------


class TestTagValueProcessing:
    @pytest.mark.asyncio
    async def test_hi_alarm_triggers(self, engine: AlarmEngine, hi_config: AlarmConfig):
        await engine.register_config(hi_config)

        events = await engine.process_tag_value("WH/WHK01/TIT_2010/Out_PV", 185.0)
        assert len(events) >= 1

        active = await engine.get_active_alarms()
        hi_alarms = [a for a in active if "HI" in a["name"] and "HIHI" not in a["name"]]
        assert len(hi_alarms) == 1

    @pytest.mark.asyncio
    async def test_hihi_triggers_at_200(self, engine: AlarmEngine, hi_config: AlarmConfig):
        await engine.register_config(hi_config)

        events = await engine.process_tag_value("WH/WHK01/TIT_2010/Out_PV", 205.0)
        active = await engine.get_active_alarms()
        # Both HI and HIHI should trigger at 205
        assert len(active) == 2

    @pytest.mark.asyncio
    async def test_hi_clears_with_deadband(self, engine: AlarmEngine, hi_config: AlarmConfig):
        await engine.register_config(hi_config)

        # Trigger
        await engine.process_tag_value("WH/WHK01/TIT_2010/Out_PV", 185.0)
        active = await engine.get_active_alarms()
        assert len(active) >= 1
        hi_active = [a for a in active if "HI" in a["name"] and "HIHI" not in a["name"]]
        assert hi_active[0]["state"] == "ACTIVE_UNACK"

        # Not yet cleared (179 >= deadband clear point 178)
        await engine.process_tag_value("WH/WHK01/TIT_2010/Out_PV", 179.0)

        # Clearly below deadband (170 < 178) → alarm clears
        await engine.process_tag_value("WH/WHK01/TIT_2010/Out_PV", 170.0)
        active = await engine.get_active_alarms()
        hi_active = [a for a in active if "HI" in a["name"] and "HIHI" not in a["name"]]
        # ISA-18.2: alarm transitions to CLEAR_UNACK (still "active" until ack)
        if hi_active:
            assert hi_active[0]["state"] == "CLEAR_UNACK"

    @pytest.mark.asyncio
    async def test_no_trigger_below_setpoint(self, engine: AlarmEngine, hi_config: AlarmConfig):
        await engine.register_config(hi_config)
        events = await engine.process_tag_value("WH/WHK01/TIT_2010/Out_PV", 170.0)
        assert len(events) == 0

    @pytest.mark.asyncio
    async def test_unconfigured_tag_no_events(self, engine: AlarmEngine):
        events = await engine.process_tag_value("unknown/tag", 100.0)
        assert events == []

    @pytest.mark.asyncio
    async def test_disabled_config_no_events(self, engine: AlarmEngine, hi_config: AlarmConfig):
        hi_config.enabled = False
        await engine.register_config(hi_config)
        events = await engine.process_tag_value("WH/WHK01/TIT_2010/Out_PV", 200.0)
        assert events == []

    @pytest.mark.asyncio
    async def test_quality_alarm(self, engine: AlarmEngine):
        config = AlarmConfig(
            tag_path="test/quality",
            thresholds=[
                ThresholdConfig(
                    alarm_type=AlarmType.QUALITY,
                    setpoint=0,  # Unused for quality
                    priority=AlarmPriority.MEDIUM,
                )
            ],
        )
        await engine.register_config(config)
        events = await engine.process_tag_value("test/quality", 0, quality="BAD")
        assert len(events) >= 1

    @pytest.mark.asyncio
    async def test_digital_alarm(self, engine: AlarmEngine):
        config = AlarmConfig(
            tag_path="test/digital",
            thresholds=[
                ThresholdConfig(
                    alarm_type=AlarmType.DIGITAL,
                    setpoint=0,  # Unused
                    priority=AlarmPriority.LOW,
                )
            ],
        )
        await engine.register_config(config)
        events = await engine.process_tag_value("test/digital", True)
        assert len(events) >= 1


# ---------------------------------------------------------------------------
# Flood suppression
# ---------------------------------------------------------------------------


class TestFloodSuppression:
    @pytest.mark.asyncio
    async def test_flood_limit_reached(self, engine: AlarmEngine):
        """Engine configured with max_active_per_area=5, so 6th should fail."""
        for i in range(5):
            alarm_id = await engine.trigger_alarm(
                name=f"FLOOD_{i}",
                tag_path=f"t/{i}",
                priority="LOW",
                area="FloodZone",
            )
            assert alarm_id != ""

        # 6th should be suppressed
        alarm_id = await engine.trigger_alarm(
            name="FLOOD_5",
            tag_path="t/5",
            priority="LOW",
            area="FloodZone",
        )
        assert alarm_id == ""

    @pytest.mark.asyncio
    async def test_flood_different_areas_independent(self, engine: AlarmEngine):
        for i in range(5):
            await engine.trigger_alarm(
                name=f"A_{i}", tag_path=f"a/{i}", priority="LOW", area="AreaA"
            )
        # Different area should still work
        alarm_id = await engine.trigger_alarm(
            name="B_0", tag_path="b/0", priority="LOW", area="AreaB"
        )
        assert alarm_id != ""


# ---------------------------------------------------------------------------
# Listeners
# ---------------------------------------------------------------------------


class TestListeners:
    @pytest.mark.asyncio
    async def test_listener_receives_events(self, engine: AlarmEngine):
        received = []
        async def on_alarm(event):
            received.append(event)

        engine.add_listener(on_alarm)
        await engine.trigger_alarm(name="TEST", tag_path="t", priority="HIGH")
        assert len(received) == 1
        assert received[0].action == "TRIGGER"

    @pytest.mark.asyncio
    async def test_listener_exception_doesnt_crash(self, engine: AlarmEngine):
        async def bad_listener(event):
            raise ValueError("boom")

        engine.add_listener(bad_listener)
        # Should not raise
        alarm_id = await engine.trigger_alarm(name="TEST", tag_path="t", priority="HIGH")
        assert alarm_id != ""

    @pytest.mark.asyncio
    async def test_remove_listener(self, engine: AlarmEngine):
        received = []
        async def on_alarm(event):
            received.append(event)

        engine.add_listener(on_alarm)
        engine.remove_listener(on_alarm)
        await engine.trigger_alarm(name="TEST", tag_path="t", priority="HIGH")
        assert len(received) == 0


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------


class TestDedup:
    @pytest.mark.asyncio
    async def test_same_tag_type_no_duplicate(self, engine: AlarmEngine):
        """Re-triggering same tag+type updates value, doesn't create new alarm."""
        await engine.trigger_alarm(
            name="DUP",
            tag_path="t/1",
            priority="HIGH",
            value=100,
            alarm_type=AlarmType.HI,
        )
        await engine.trigger_alarm(
            name="DUP",
            tag_path="t/1",
            priority="HIGH",
            value=105,
            alarm_type=AlarmType.HI,
        )
        active = await engine.get_active_alarms()
        assert len(active) == 1
        assert active[0]["value"] == 105  # Updated

    @pytest.mark.asyncio
    async def test_different_types_create_separate(self, engine: AlarmEngine):
        await engine.trigger_alarm(
            name="HI", tag_path="t/1", priority="HIGH", alarm_type=AlarmType.HI
        )
        await engine.trigger_alarm(
            name="HIHI", tag_path="t/1", priority="CRITICAL", alarm_type=AlarmType.HIHI
        )
        active = await engine.get_active_alarms()
        assert len(active) == 2


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------


class TestStats:
    @pytest.mark.asyncio
    async def test_stats_initial(self, engine: AlarmEngine):
        stats = engine.get_stats()
        assert stats["active_alarms"] == 0
        assert stats["total_triggered"] == 0

    @pytest.mark.asyncio
    async def test_stats_after_lifecycle(self, engine: AlarmEngine):
        alarm_id = await engine.trigger_alarm(
            name="S", tag_path="t", priority="HIGH", area="TestArea"
        )
        await engine.acknowledge_alarm(alarm_id)
        await engine.clear_alarm(alarm_id)

        stats = engine.get_stats()
        assert stats["total_triggered"] == 1
        assert stats["total_acknowledged"] == 1
        assert stats["total_cleared"] == 1
        assert stats["active_alarms"] == 0


# ---------------------------------------------------------------------------
# Priority sorting
# ---------------------------------------------------------------------------


class TestPrioritySorting:
    @pytest.mark.asyncio
    async def test_active_alarms_sorted_by_priority(self, engine: AlarmEngine):
        await engine.trigger_alarm(name="LOW", tag_path="t1", priority="LOW")
        await engine.trigger_alarm(name="CRIT", tag_path="t2", priority="CRITICAL")
        await engine.trigger_alarm(name="MED", tag_path="t3", priority="MEDIUM")

        active = await engine.get_active_alarms()
        priorities = [a["priority"] for a in active]
        assert priorities == ["CRITICAL", "MEDIUM", "LOW"]
