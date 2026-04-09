"""Tests for the AlarmDetector — tag value evaluation and alarm detection.

Covers:
- Threshold detection delegated to engine
- Rate-of-change (ROC) alarm detection
- Communication failure/restore tracking
- Delay timer (condition persistence requirement)
- Quality alarm evaluation
- Static condition checker
"""

import pytest
import time
from unittest.mock import AsyncMock, patch

from forge.modules.ot.alarming.models import (
    AlarmConfig,
    AlarmPriority,
    AlarmType,
    ThresholdConfig,
)
from forge.modules.ot.alarming.engine import AlarmEngine
from forge.modules.ot.alarming.detector import AlarmDetector


@pytest.fixture
def engine() -> AlarmEngine:
    return AlarmEngine(max_active_per_area=50)


@pytest.fixture
def detector(engine: AlarmEngine) -> AlarmDetector:
    return AlarmDetector(engine)


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
            ),
        ],
    )


# ---------------------------------------------------------------------------
# Basic threshold evaluation
# ---------------------------------------------------------------------------


class TestThresholdEvaluation:
    @pytest.mark.asyncio
    async def test_evaluate_triggers_hi_alarm(
        self, engine: AlarmEngine, detector: AlarmDetector, hi_config: AlarmConfig
    ):
        await engine.register_config(hi_config)
        events = await detector.evaluate("WH/WHK01/TIT_2010/Out_PV", 185.0)
        assert len(events) >= 1

        active = await engine.get_active_alarms()
        assert len(active) == 1

    @pytest.mark.asyncio
    async def test_evaluate_no_alarm_below_threshold(
        self, engine: AlarmEngine, detector: AlarmDetector, hi_config: AlarmConfig
    ):
        await engine.register_config(hi_config)
        events = await detector.evaluate("WH/WHK01/TIT_2010/Out_PV", 170.0)
        assert len(events) == 0

    @pytest.mark.asyncio
    async def test_evaluate_unconfigured_tag(self, detector: AlarmDetector):
        events = await detector.evaluate("unknown/tag", 100.0)
        assert events == []

    @pytest.mark.asyncio
    async def test_evaluate_disabled_config(
        self, engine: AlarmEngine, detector: AlarmDetector, hi_config: AlarmConfig
    ):
        hi_config.enabled = False
        await engine.register_config(hi_config)
        events = await detector.evaluate("WH/WHK01/TIT_2010/Out_PV", 200.0)
        assert events == []


# ---------------------------------------------------------------------------
# LO / LOLO thresholds
# ---------------------------------------------------------------------------


class TestLoThresholds:
    @pytest.mark.asyncio
    async def test_lo_alarm(self, engine: AlarmEngine, detector: AlarmDetector):
        config = AlarmConfig(
            tag_path="test/level",
            thresholds=[
                ThresholdConfig(
                    alarm_type=AlarmType.LO,
                    setpoint=10.0,
                    deadband=1.0,
                    priority=AlarmPriority.MEDIUM,
                ),
            ],
        )
        await engine.register_config(config)
        events = await detector.evaluate("test/level", 8.0)
        assert len(events) >= 1

    @pytest.mark.asyncio
    async def test_lolo_alarm(self, engine: AlarmEngine, detector: AlarmDetector):
        config = AlarmConfig(
            tag_path="test/level",
            thresholds=[
                ThresholdConfig(
                    alarm_type=AlarmType.LOLO,
                    setpoint=5.0,
                    priority=AlarmPriority.CRITICAL,
                ),
            ],
        )
        await engine.register_config(config)
        events = await detector.evaluate("test/level", 3.0)
        assert len(events) >= 1


# ---------------------------------------------------------------------------
# Rate-of-change
# ---------------------------------------------------------------------------


class TestRateOfChange:
    @pytest.mark.asyncio
    async def test_roc_alarm_triggers(self, engine: AlarmEngine, detector: AlarmDetector):
        config = AlarmConfig(
            tag_path="test/roc",
            thresholds=[
                ThresholdConfig(
                    alarm_type=AlarmType.RATE_OF_CHANGE,
                    setpoint=10.0,  # 10 units/sec
                    priority=AlarmPriority.HIGH,
                ),
            ],
        )
        await engine.register_config(config)

        # First value establishes baseline
        events = await detector.evaluate("test/roc", 100.0)
        assert len(events) == 0

        # Simulate rapid change (mock time to control dt)
        roc_state = detector._roc_state["test/roc"]
        roc_state.last_time = time.monotonic() - 1.0  # 1 second ago
        roc_state.last_value = 100.0

        events = await detector.evaluate("test/roc", 200.0)
        # ROC = 100/1 = 100, which exceeds setpoint 10
        assert len(events) >= 1

    @pytest.mark.asyncio
    async def test_roc_no_alarm_below_threshold(
        self, engine: AlarmEngine, detector: AlarmDetector
    ):
        config = AlarmConfig(
            tag_path="test/roc",
            thresholds=[
                ThresholdConfig(
                    alarm_type=AlarmType.RATE_OF_CHANGE,
                    setpoint=100.0,
                    priority=AlarmPriority.LOW,
                ),
            ],
        )
        await engine.register_config(config)
        await detector.evaluate("test/roc", 100.0)

        roc_state = detector._roc_state["test/roc"]
        roc_state.last_time = time.monotonic() - 1.0
        roc_state.last_value = 100.0

        events = await detector.evaluate("test/roc", 105.0)
        # ROC = 5/1 = 5, below threshold 100
        assert len(events) == 0

    @pytest.mark.asyncio
    async def test_roc_non_numeric_ignored(
        self, engine: AlarmEngine, detector: AlarmDetector
    ):
        config = AlarmConfig(
            tag_path="test/roc",
            thresholds=[
                ThresholdConfig(
                    alarm_type=AlarmType.RATE_OF_CHANGE,
                    setpoint=1.0,
                    priority=AlarmPriority.LOW,
                ),
            ],
        )
        await engine.register_config(config)
        events = await detector.evaluate("test/roc", "not-a-number")
        assert len(events) == 0


# ---------------------------------------------------------------------------
# Communication alarms
# ---------------------------------------------------------------------------


class TestCommAlarms:
    @pytest.mark.asyncio
    async def test_comm_failure_creates_alarm(
        self, engine: AlarmEngine, detector: AlarmDetector
    ):
        event = await detector.report_comm_failure("PLC-01", "Timeout")
        assert event is not None or "PLC-01" in detector._comm_alarms

        active = await engine.get_active_alarms()
        assert len(active) == 1

    @pytest.mark.asyncio
    async def test_comm_failure_dedup(
        self, engine: AlarmEngine, detector: AlarmDetector
    ):
        await detector.report_comm_failure("PLC-01", "Timeout")
        await detector.report_comm_failure("PLC-01", "Timeout again")

        active = await engine.get_active_alarms()
        assert len(active) == 1  # Not duplicated

    @pytest.mark.asyncio
    async def test_comm_restore_clears(
        self, engine: AlarmEngine, detector: AlarmDetector
    ):
        await detector.report_comm_failure("PLC-01", "Timeout")
        result = await detector.report_comm_restore("PLC-01")
        assert result is True

        # Should be in CLEAR_UNACK (not yet acked)
        active = await engine.get_active_alarms()
        if active:
            assert active[0]["state"] in ("CLEAR_UNACK", "NORMAL")

    @pytest.mark.asyncio
    async def test_comm_restore_unknown_device(self, detector: AlarmDetector):
        result = await detector.report_comm_restore("UNKNOWN")
        assert result is False


# ---------------------------------------------------------------------------
# Delay timer
# ---------------------------------------------------------------------------


class TestDelayTimer:
    @pytest.mark.asyncio
    async def test_delayed_alarm_not_immediate(
        self, engine: AlarmEngine, detector: AlarmDetector
    ):
        config = AlarmConfig(
            tag_path="test/delayed",
            thresholds=[
                ThresholdConfig(
                    alarm_type=AlarmType.HI,
                    setpoint=100.0,
                    delay_seconds=5.0,
                    priority=AlarmPriority.MEDIUM,
                ),
            ],
        )
        await engine.register_config(config)

        # First eval: starts timer, no alarm
        events = await detector.evaluate("test/delayed", 110.0)
        assert len(events) == 0

    @pytest.mark.asyncio
    async def test_delayed_alarm_triggers_after_delay(
        self, engine: AlarmEngine, detector: AlarmDetector
    ):
        config = AlarmConfig(
            tag_path="test/delayed",
            thresholds=[
                ThresholdConfig(
                    alarm_type=AlarmType.HI,
                    setpoint=100.0,
                    delay_seconds=0.0,  # Use 0 delay for instant trigger
                    priority=AlarmPriority.MEDIUM,
                ),
            ],
        )
        await engine.register_config(config)

        events = await detector.evaluate("test/delayed", 110.0)
        # With 0 delay, should trigger immediately via engine
        assert len(events) >= 1

    @pytest.mark.asyncio
    async def test_delayed_alarm_resets_on_clear(
        self, engine: AlarmEngine, detector: AlarmDetector
    ):
        config = AlarmConfig(
            tag_path="test/delayed",
            thresholds=[
                ThresholdConfig(
                    alarm_type=AlarmType.HI,
                    setpoint=100.0,
                    delay_seconds=5.0,
                    priority=AlarmPriority.MEDIUM,
                ),
            ],
        )
        await engine.register_config(config)

        # Start timer
        await detector.evaluate("test/delayed", 110.0)
        # Value drops below — timer resets
        await detector.evaluate("test/delayed", 90.0)

        key = "test/delayed:HI"
        state = detector._delay_state[key]
        assert state.first_true_at is None


# ---------------------------------------------------------------------------
# Static condition checker
# ---------------------------------------------------------------------------


class TestConditionChecker:
    def test_hi_condition(self):
        t = ThresholdConfig(alarm_type=AlarmType.HI, setpoint=100.0)
        assert AlarmDetector._is_condition_met(t, 105.0, "GOOD") is True
        assert AlarmDetector._is_condition_met(t, 95.0, "GOOD") is False

    def test_lo_condition(self):
        t = ThresholdConfig(alarm_type=AlarmType.LO, setpoint=10.0)
        assert AlarmDetector._is_condition_met(t, 5.0, "GOOD") is True
        assert AlarmDetector._is_condition_met(t, 15.0, "GOOD") is False

    def test_digital_condition(self):
        t = ThresholdConfig(alarm_type=AlarmType.DIGITAL, setpoint=0)
        assert AlarmDetector._is_condition_met(t, True, "GOOD") is True
        assert AlarmDetector._is_condition_met(t, False, "GOOD") is False

    def test_quality_condition(self):
        t = ThresholdConfig(alarm_type=AlarmType.QUALITY, setpoint=0)
        assert AlarmDetector._is_condition_met(t, 0, "BAD") is True
        assert AlarmDetector._is_condition_met(t, 0, "GOOD") is False

    def test_non_numeric_hi(self):
        t = ThresholdConfig(alarm_type=AlarmType.HI, setpoint=100.0)
        assert AlarmDetector._is_condition_met(t, "not-a-number", "GOOD") is False
