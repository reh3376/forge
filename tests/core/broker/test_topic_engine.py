"""Tests for TopicEngine — subscription matching, fan-out, retained messages."""

import pytest

from forge.core.broker.topic_engine import (
    TopicEngine,
    SubscriptionEntry,
    RetainedMessage,
    mqtt_topic_matches,
)


# ---------------------------------------------------------------------------
# MQTT topic matching (spec §4.7)
# ---------------------------------------------------------------------------


class TestMqttTopicMatches:

    # Exact match
    def test_exact_match(self):
        assert mqtt_topic_matches("a/b/c", "a/b/c") is True

    def test_exact_mismatch(self):
        assert mqtt_topic_matches("a/b/c", "a/b/d") is False

    # Single-level wildcard (+)
    def test_plus_matches_one_level(self):
        assert mqtt_topic_matches("a/+/c", "a/b/c") is True

    def test_plus_no_match_multi_level(self):
        assert mqtt_topic_matches("a/+/c", "a/b/x/c") is False

    def test_plus_at_start(self):
        assert mqtt_topic_matches("+/b/c", "a/b/c") is True

    def test_plus_at_end(self):
        assert mqtt_topic_matches("a/b/+", "a/b/c") is True

    def test_multiple_plus(self):
        assert mqtt_topic_matches("+/+/+", "a/b/c") is True

    # Multi-level wildcard (#)
    def test_hash_matches_all(self):
        assert mqtt_topic_matches("#", "a/b/c") is True

    def test_hash_at_end(self):
        assert mqtt_topic_matches("a/b/#", "a/b/c") is True
        assert mqtt_topic_matches("a/b/#", "a/b/c/d/e") is True

    def test_hash_matches_parent(self):
        assert mqtt_topic_matches("a/#", "a") is True

    # $SYS protection (§4.7.2)
    def test_hash_does_not_match_dollar(self):
        assert mqtt_topic_matches("#", "$SYS/broker/uptime") is False

    def test_plus_at_root_does_not_match_dollar(self):
        assert mqtt_topic_matches("+/broker/uptime", "$SYS/broker/uptime") is False

    def test_explicit_dollar_match(self):
        assert mqtt_topic_matches("$SYS/#", "$SYS/broker/uptime") is True

    def test_explicit_dollar_exact(self):
        assert mqtt_topic_matches("$SYS/broker/uptime", "$SYS/broker/uptime") is True

    # Edge cases
    def test_empty_filter_and_topic(self):
        assert mqtt_topic_matches("", "") is True

    def test_filter_longer_than_topic(self):
        assert mqtt_topic_matches("a/b/c", "a/b") is False

    def test_topic_longer_than_filter(self):
        assert mqtt_topic_matches("a/b", "a/b/c") is False


# ---------------------------------------------------------------------------
# Subscription management
# ---------------------------------------------------------------------------


class TestSubscriptions:

    def test_subscribe_returns_granted_qos(self):
        engine = TopicEngine()
        assert engine.subscribe("c1", "test/#", qos=0) == 0
        assert engine.subscribe("c1", "test/+", qos=1) == 1

    def test_qos_capped_at_1(self):
        engine = TopicEngine()
        assert engine.subscribe("c1", "test/#", qos=2) == 1

    def test_subscription_count(self):
        engine = TopicEngine()
        engine.subscribe("c1", "a/#")
        engine.subscribe("c1", "b/#")
        engine.subscribe("c2", "c/#")
        assert engine.subscription_count == 3
        assert engine.client_count == 2

    def test_replace_existing_subscription(self):
        engine = TopicEngine()
        engine.subscribe("c1", "test/#", qos=0)
        engine.subscribe("c1", "test/#", qos=1)  # Replace
        assert engine.subscription_count == 1
        subs = engine.get_subscriptions("c1")
        assert subs[0].qos == 1

    def test_unsubscribe(self):
        engine = TopicEngine()
        engine.subscribe("c1", "test/#")
        assert engine.unsubscribe("c1", "test/#") is True
        assert engine.subscription_count == 0

    def test_unsubscribe_nonexistent(self):
        engine = TopicEngine()
        assert engine.unsubscribe("c1", "nothing") is False

    def test_unsubscribe_all(self):
        engine = TopicEngine()
        engine.subscribe("c1", "a/#")
        engine.subscribe("c1", "b/#")
        engine.subscribe("c2", "c/#")
        removed = engine.unsubscribe_all("c1")
        assert removed == 2
        assert engine.subscription_count == 1


# ---------------------------------------------------------------------------
# Topic matching (fan-out)
# ---------------------------------------------------------------------------


class TestMatching:

    def test_exact_match(self):
        engine = TopicEngine()
        engine.subscribe("c1", "whk/whk01/ot/tags/TIT/Out_PV")
        matches = engine.match("whk/whk01/ot/tags/TIT/Out_PV")
        assert len(matches) == 1
        assert matches[0].client_id == "c1"

    def test_wildcard_match(self):
        engine = TopicEngine()
        engine.subscribe("c1", "whk/+/ot/tags/#")
        matches = engine.match("whk/whk01/ot/tags/TIT/Out_PV")
        assert len(matches) == 1

    def test_no_match(self):
        engine = TopicEngine()
        engine.subscribe("c1", "whk/whk01/ot/health/+")
        matches = engine.match("whk/whk01/ot/tags/TIT/Out_PV")
        assert len(matches) == 0

    def test_multiple_clients_match(self):
        engine = TopicEngine()
        engine.subscribe("c1", "whk/#")
        engine.subscribe("c2", "whk/+/ot/tags/#")
        engine.subscribe("c3", "other/topic")
        matches = engine.match("whk/whk01/ot/tags/TIT/Out_PV")
        assert len(matches) == 2
        ids = {m.client_id for m in matches}
        assert ids == {"c1", "c2"}

    def test_client_appears_once_highest_qos(self):
        engine = TopicEngine()
        engine.subscribe("c1", "whk/#", qos=0)
        engine.subscribe("c1", "whk/whk01/ot/tags/#", qos=1)
        matches = engine.match("whk/whk01/ot/tags/TIT/Out_PV")
        assert len(matches) == 1
        assert matches[0].granted_qos == 1

    def test_sys_topics_excluded_from_hash(self):
        engine = TopicEngine()
        engine.subscribe("c1", "#")
        matches = engine.match("$SYS/broker/uptime")
        assert len(matches) == 0

    def test_sys_topics_matched_explicitly(self):
        engine = TopicEngine()
        engine.subscribe("c1", "$SYS/#")
        matches = engine.match("$SYS/broker/uptime")
        assert len(matches) == 1


# ---------------------------------------------------------------------------
# Retained messages
# ---------------------------------------------------------------------------


class TestRetainedMessages:

    def test_set_and_get_retained(self):
        engine = TopicEngine()
        engine.set_retained("whk/health/PLC_001", b'{"connected": true}', qos=1)
        msg = engine.get_retained("whk/health/PLC_001")
        assert msg is not None
        assert msg.payload == b'{"connected": true}'
        assert msg.qos == 1

    def test_empty_payload_clears_retained(self):
        engine = TopicEngine()
        engine.set_retained("whk/health/PLC_001", b"ok")
        engine.set_retained("whk/health/PLC_001", b"")  # Clear
        assert engine.get_retained("whk/health/PLC_001") is None
        assert engine.retained_count == 0

    def test_get_retained_for_wildcard(self):
        engine = TopicEngine()
        engine.set_retained("whk/whk01/health/PLC_001", b"ok")
        engine.set_retained("whk/whk01/health/PLC_002", b"ok")
        engine.set_retained("whk/whk01/tags/TIT/Out_PV", b"78.4")

        results = engine.get_retained_for("whk/+/health/+")
        assert len(results) == 2

    def test_retained_count(self):
        engine = TopicEngine()
        engine.set_retained("a", b"1")
        engine.set_retained("b", b"2")
        assert engine.retained_count == 2

    def test_clear_retained(self):
        engine = TopicEngine()
        engine.set_retained("a", b"1")
        engine.set_retained("b", b"2")
        count = engine.clear_retained()
        assert count == 2
        assert engine.retained_count == 0


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------


class TestTopicEngineStats:

    def test_stats(self):
        engine = TopicEngine()
        engine.subscribe("c1", "test/#")
        engine.set_retained("test/a", b"1")
        engine.match("test/a")
        engine.match("test/b")

        stats = engine.get_stats()
        assert stats["subscriptions"] == 1
        assert stats["clients"] == 1
        assert stats["retained_messages"] == 1
        assert stats["total_publishes"] == 2
        assert stats["total_matches"] == 2
