"""Tests for alarm cross-module integrations.

Covers:
- AlarmMqttPublisher: retained messages, NORMAL clears retained
- AlarmMqttAckSubscriber: remote acknowledgment via MQTT
- AlarmRabbitMqPublisher: routing key format
- AlarmCmmsIntegration: only CRITICAL/HIGH on TRIGGER
- AlarmHistorianAnnotation: annotation text format
- AlarmScriptDispatch: dispatch arguments
- AlarmContextualRecordWriter: record schema
- AlarmIntegrationHub: start/stop lifecycle
"""

import json
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

from forge.modules.ot.alarming.models import AlarmEvent
from forge.modules.ot.alarming.engine import AlarmEngine
from forge.modules.ot.alarming.integrations import (
    AlarmMqttPublisher,
    AlarmMqttAckSubscriber,
    AlarmRabbitMqPublisher,
    AlarmCmmsIntegration,
    AlarmHistorianAnnotation,
    AlarmScriptDispatch,
    AlarmContextualRecordWriter,
    AlarmIntegrationHub,
    IntegrationConfig,
)


def _make_event(**overrides) -> AlarmEvent:
    defaults = dict(
        event_id="evt-001",
        alarm_id="alarm-001",
        name="TEST_HI",
        alarm_type="HI",
        previous_state="NORMAL",
        new_state="ACTIVE_UNACK",
        action="TRIGGER",
        priority="HIGH",
        tag_path="WH/WHK01/Distillery01/TIT_2010/Out_PV",
        value=185.0,
        setpoint=180.0,
        timestamp=datetime(2026, 4, 9, 12, 0, 0, tzinfo=timezone.utc),
        area="Distillery01",
        equipment_id="TIT_2010",
    )
    defaults.update(overrides)
    return AlarmEvent(**defaults)


# ---------------------------------------------------------------------------
# MQTT Publisher
# ---------------------------------------------------------------------------


class TestAlarmMqttPublisher:
    @pytest.mark.asyncio
    async def test_publishes_on_trigger(self):
        mqtt = AsyncMock()
        pub = AlarmMqttPublisher(mqtt, topic_prefix="whk/whk01")
        event = _make_event()

        await pub.on_alarm_event(event)

        mqtt.publish.assert_called_once()
        call_args = mqtt.publish.call_args
        assert "Distillery01/ot/alarms/alarm-001" in call_args[0][0]
        assert call_args[1]["qos"] == 1
        assert call_args[1]["retain"] is True

        payload = json.loads(call_args[0][1])
        assert payload["state"] == "ACTIVE_UNACK"
        assert payload["priority"] == "HIGH"

    @pytest.mark.asyncio
    async def test_clears_retained_on_normal(self):
        mqtt = AsyncMock()
        pub = AlarmMqttPublisher(mqtt)
        event = _make_event(new_state="NORMAL", action="CLEAR")

        await pub.on_alarm_event(event)

        call_args = mqtt.publish.call_args
        assert call_args[0][1] == ""  # Empty payload clears retained
        assert call_args[1]["retain"] is True

    @pytest.mark.asyncio
    async def test_global_area_fallback(self):
        mqtt = AsyncMock()
        pub = AlarmMqttPublisher(mqtt, topic_prefix="test")
        event = _make_event(area="")

        await pub.on_alarm_event(event)

        topic = mqtt.publish.call_args[0][0]
        assert "global/ot/alarms" in topic


# ---------------------------------------------------------------------------
# MQTT Ack Subscriber
# ---------------------------------------------------------------------------


class TestAlarmMqttAckSubscriber:
    @pytest.mark.asyncio
    async def test_start_subscribes(self):
        engine = AlarmEngine()
        mqtt = AsyncMock()
        sub = AlarmMqttAckSubscriber(engine, mqtt)

        await sub.start()

        mqtt.subscribe.assert_called_once()
        assert "+/ot/alarms/+/ack" in mqtt.subscribe.call_args[0][0]

    @pytest.mark.asyncio
    async def test_on_ack_message(self):
        engine = AlarmEngine()
        mqtt = AsyncMock()
        sub = AlarmMqttAckSubscriber(engine, mqtt)

        # Create an alarm to acknowledge
        alarm_id = await engine.trigger_alarm(
            name="TEST", tag_path="t", priority="HIGH"
        )

        payload = json.dumps({"operator": "remote_op"})
        await sub._on_ack_message(
            f"whk/whk01/area/ot/alarms/{alarm_id}/ack", payload
        )

        active = await engine.get_active_alarms()
        assert active[0]["state"] == "ACTIVE_ACK"

    @pytest.mark.asyncio
    async def test_on_ack_nonexistent(self):
        engine = AlarmEngine()
        mqtt = AsyncMock()
        sub = AlarmMqttAckSubscriber(engine, mqtt)

        # Should not raise
        await sub._on_ack_message(
            "whk/whk01/area/ot/alarms/nonexistent/ack",
            b'{"operator":"x"}',
        )


# ---------------------------------------------------------------------------
# RabbitMQ Publisher
# ---------------------------------------------------------------------------


class TestAlarmRabbitMqPublisher:
    @pytest.mark.asyncio
    async def test_routing_key_format(self):
        rabbit = AsyncMock()
        pub = AlarmRabbitMqPublisher(rabbit)
        event = _make_event()

        await pub.on_alarm_event(event)

        call_args = rabbit.publish_event.call_args
        assert call_args[0][0] == "forge.alarms"
        assert call_args[0][1] == "alarm.TRIGGER.HIGH"


# ---------------------------------------------------------------------------
# CMMS Integration
# ---------------------------------------------------------------------------


class TestAlarmCmmsIntegration:
    @pytest.mark.asyncio
    async def test_creates_work_request_for_critical(self):
        cmms = AsyncMock()
        cmms.create_work_request.return_value = "WR-001"
        integration = AlarmCmmsIntegration(cmms)

        event = _make_event(priority="CRITICAL")
        await integration.on_alarm_event(event)

        cmms.create_work_request.assert_called_once()
        payload = cmms.create_work_request.call_args[0][0]
        assert payload["priority"] == "CRITICAL"

    @pytest.mark.asyncio
    async def test_creates_work_request_for_high(self):
        cmms = AsyncMock()
        cmms.create_work_request.return_value = "WR-002"
        integration = AlarmCmmsIntegration(cmms)

        event = _make_event(priority="HIGH")
        await integration.on_alarm_event(event)

        cmms.create_work_request.assert_called_once()

    @pytest.mark.asyncio
    async def test_ignores_medium_priority(self):
        cmms = AsyncMock()
        integration = AlarmCmmsIntegration(cmms)

        event = _make_event(priority="MEDIUM")
        await integration.on_alarm_event(event)

        cmms.create_work_request.assert_not_called()

    @pytest.mark.asyncio
    async def test_ignores_non_trigger_actions(self):
        cmms = AsyncMock()
        integration = AlarmCmmsIntegration(cmms)

        event = _make_event(priority="CRITICAL", action="ACKNOWLEDGE")
        await integration.on_alarm_event(event)

        cmms.create_work_request.assert_not_called()

    @pytest.mark.asyncio
    async def test_handles_cmms_failure(self):
        cmms = AsyncMock()
        cmms.create_work_request.side_effect = ConnectionError("timeout")
        integration = AlarmCmmsIntegration(cmms)

        event = _make_event(priority="CRITICAL")
        # Should not raise
        await integration.on_alarm_event(event)


# ---------------------------------------------------------------------------
# Historian Annotation
# ---------------------------------------------------------------------------


class TestAlarmHistorianAnnotation:
    @pytest.mark.asyncio
    async def test_writes_annotation(self):
        historian = AsyncMock()
        annotation = AlarmHistorianAnnotation(historian)

        event = _make_event()
        await annotation.on_alarm_event(event)

        historian.write_annotation.assert_called_once()
        call_kwargs = historian.write_annotation.call_args[1]
        assert "TIT_2010" in call_kwargs["tag_path"]
        assert "HIGH" in historian.write_annotation.call_args[1].get(
            "text", historian.write_annotation.call_args[0][2] if len(historian.write_annotation.call_args[0]) > 2 else ""
        )

    @pytest.mark.asyncio
    async def test_skips_empty_tag_path(self):
        historian = AsyncMock()
        annotation = AlarmHistorianAnnotation(historian)

        event = _make_event(tag_path="")
        await annotation.on_alarm_event(event)

        historian.write_annotation.assert_not_called()


# ---------------------------------------------------------------------------
# Script Dispatch
# ---------------------------------------------------------------------------


class TestAlarmScriptDispatch:
    @pytest.mark.asyncio
    async def test_dispatches_event(self):
        dispatcher = AsyncMock()
        script = AlarmScriptDispatch(dispatcher)

        event = _make_event()
        await script.on_alarm_event(event)

        dispatcher.dispatch_alarm_event.assert_called_once()
        call_kwargs = dispatcher.dispatch_alarm_event.call_args[1]
        assert call_kwargs["alarm_id"] == "alarm-001"
        assert call_kwargs["state"] == "ACTIVE_UNACK"
        assert call_kwargs["priority"] == "HIGH"

    @pytest.mark.asyncio
    async def test_handles_dispatch_failure(self):
        dispatcher = AsyncMock()
        dispatcher.dispatch_alarm_event.side_effect = RuntimeError("handler error")
        script = AlarmScriptDispatch(dispatcher)

        event = _make_event()
        # Should not raise
        await script.on_alarm_event(event)


# ---------------------------------------------------------------------------
# ContextualRecord Writer
# ---------------------------------------------------------------------------


class TestAlarmContextualRecordWriter:
    @pytest.mark.asyncio
    async def test_writes_record(self):
        writer = AsyncMock()
        cr = AlarmContextualRecordWriter(writer)

        event = _make_event()
        await cr.on_alarm_event(event)

        writer.write.assert_called_once()
        record = writer.write.call_args[0][0]
        assert record["record_type"] == "alarm_event"
        assert record["source_module"] == "ot"
        assert record["alarm_id"] == "alarm-001"
        assert record["priority"] == "HIGH"
        assert "context" in record
        assert record["context"]["alarm_priority"] == "HIGH"


# ---------------------------------------------------------------------------
# Integration Hub
# ---------------------------------------------------------------------------


class TestAlarmIntegrationHub:
    @pytest.mark.asyncio
    async def test_start_registers_listeners(self):
        engine = AlarmEngine()
        mqtt = AsyncMock()
        dispatcher = AsyncMock()
        writer = AsyncMock()

        hub = AlarmIntegrationHub(engine, IntegrationConfig(
            mqtt_enabled=True,
            mqtt_ack_enabled=False,
            scripting_enabled=True,
            contextual_record_enabled=True,
        ))
        hub.set_mqtt(mqtt)
        hub.set_script_dispatcher(dispatcher)
        hub.set_contextual_record_writer(writer)

        await hub.start()

        # Trigger an alarm and check all listeners fire
        await engine.trigger_alarm(name="HUB_TEST", tag_path="t", priority="HIGH")

        mqtt.publish.assert_called()
        dispatcher.dispatch_alarm_event.assert_called()
        writer.write.assert_called()

    @pytest.mark.asyncio
    async def test_stop_unregisters_listeners(self):
        engine = AlarmEngine()
        mqtt = AsyncMock()

        hub = AlarmIntegrationHub(engine, IntegrationConfig(
            mqtt_enabled=True,
            mqtt_ack_enabled=False,
        ))
        hub.set_mqtt(mqtt)

        await hub.start()
        await hub.stop()

        mqtt.reset_mock()
        await engine.trigger_alarm(name="AFTER_STOP", tag_path="t", priority="LOW")

        # No more MQTT calls after stop
        mqtt.publish.assert_not_called()

    @pytest.mark.asyncio
    async def test_disabled_integrations_not_registered(self):
        engine = AlarmEngine()
        mqtt = AsyncMock()

        hub = AlarmIntegrationHub(engine, IntegrationConfig(
            mqtt_enabled=False,
            scripting_enabled=False,
            contextual_record_enabled=False,
        ))
        hub.set_mqtt(mqtt)

        await hub.start()
        await engine.trigger_alarm(name="DISABLED", tag_path="t", priority="LOW")

        mqtt.publish.assert_not_called()
