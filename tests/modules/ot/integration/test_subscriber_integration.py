"""Integration test: MQTT subscriber + message dispatch pipeline."""

import json
import pytest

from forge.modules.ot.mqtt.subscriber import IncomingMessage, MqttSubscriber


class TestSubscriberCommandIngestion:
    """Integration: subscribe to MES command topics and process messages."""

    @pytest.mark.asyncio
    async def test_recipe_command_pipeline(self):
        """Simulate MES publishing a recipe command, subscriber dispatching it."""
        subscriber = MqttSubscriber()
        received_recipes = []

        @subscriber.on("whk/+/mes/recipe/next")
        async def handle_recipe(msg: IncomingMessage):
            recipe = msg.payload_json()
            received_recipes.append(recipe)

        # Simulate incoming message from MES
        msg = IncomingMessage(
            topic="whk/whk01/mes/recipe/next",
            payload=json.dumps({
                "recipe_id": "R-2026-042",
                "name": "Bourbon Mash Bill #1",
                "batch_size": 5000,
                "parameters": {"mash_temp": 158, "rest_time_min": 45},
            }).encode(),
        )
        count = await subscriber.process_message(msg)

        assert count == 1
        assert len(received_recipes) == 1
        assert received_recipes[0]["recipe_id"] == "R-2026-042"
        assert received_recipes[0]["parameters"]["mash_temp"] == 158

    @pytest.mark.asyncio
    async def test_changeover_state_pipeline(self):
        """Simulate MES publishing changeover state, subscriber dispatching."""
        subscriber = MqttSubscriber()
        states = []

        @subscriber.on("whk/+/mes/changeover/#")
        async def handle_changeover(msg: IncomingMessage):
            states.append(msg.payload_json())

        for state in ["PREPARING", "IN_PROGRESS", "COMPLETE"]:
            msg = IncomingMessage(
                topic="whk/whk01/mes/changeover/state",
                payload=json.dumps({"state": state}).encode(),
            )
            await subscriber.process_message(msg)

        assert len(states) == 3
        assert states[-1]["state"] == "COMPLETE"

    @pytest.mark.asyncio
    async def test_multiple_subscribers_same_topic(self):
        """Multiple handlers on overlapping patterns all fire."""
        subscriber = MqttSubscriber()
        log = []

        @subscriber.on("whk/#")
        async def audit_all(msg: IncomingMessage):
            log.append(("audit", msg.topic))

        @subscriber.on("whk/+/mes/recipe/next")
        async def handle_recipe(msg: IncomingMessage):
            log.append(("recipe", msg.topic))

        msg = IncomingMessage(
            topic="whk/whk01/mes/recipe/next",
            payload=b'{"id": 1}',
        )
        count = await subscriber.process_message(msg)

        assert count == 2
        handlers = [name for name, _ in log]
        assert "audit" in handlers
        assert "recipe" in handlers

    @pytest.mark.asyncio
    async def test_unmatched_topics_ignored(self):
        subscriber = MqttSubscriber()
        received = []

        @subscriber.on("whk/+/mes/recipe/next")
        async def handler(msg):
            received.append(msg)

        # This topic shouldn't match
        msg = IncomingMessage(
            topic="whk/whk01/ot/tags/TIT/Out_PV",
            payload=b'{"v": 78.4}',
        )
        count = await subscriber.process_message(msg)
        assert count == 0
        assert len(received) == 0
