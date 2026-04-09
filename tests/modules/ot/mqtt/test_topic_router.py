"""Tests for TopicRouter — template-based MQTT topic resolution."""

import pytest

from forge.modules.ot.mqtt.topic_router import (
    TopicRouter,
    TopicTemplate,
    TopicType,
    ResolvedTopic,
    _normalize_path,
    _match_tag_pattern,
)


# ---------------------------------------------------------------------------
# Path normalization
# ---------------------------------------------------------------------------


class TestNormalizePath:

    def test_strips_leading_slash(self):
        assert _normalize_path("/Distillery01/TIT/Out_PV") == "Distillery01/TIT/Out_PV"

    def test_strips_trailing_slash(self):
        assert _normalize_path("Distillery01/TIT/") == "Distillery01/TIT"

    def test_collapses_double_slashes(self):
        assert _normalize_path("Distillery01//TIT///Out_PV") == "Distillery01/TIT/Out_PV"

    def test_already_clean(self):
        assert _normalize_path("Distillery01/TIT/Out_PV") == "Distillery01/TIT/Out_PV"


# ---------------------------------------------------------------------------
# Tag pattern matching
# ---------------------------------------------------------------------------


class TestTagPatternMatch:

    def test_exact(self):
        assert _match_tag_pattern("a/b/c", "a/b/c") is True
        assert _match_tag_pattern("a/b/c", "a/b/d") is False

    def test_single_star(self):
        assert _match_tag_pattern("a/*/c", "a/b/c") is True
        assert _match_tag_pattern("a/*/c", "a/b/d") is False

    def test_double_star(self):
        assert _match_tag_pattern("a/**/c", "a/b/x/y/c") is True
        assert _match_tag_pattern("**", "anything/at/all") is True


# ---------------------------------------------------------------------------
# Default topic resolution
# ---------------------------------------------------------------------------


class TestDefaultTopicResolution:

    @pytest.fixture
    def router(self):
        return TopicRouter(site="whk01")

    def test_resolve_tag(self, router):
        resolved = router.resolve_tag("Distillery01/TIT_2010/Out_PV", area="Distillery01")
        assert resolved.topic == "whk/whk01/Distillery01/ot/tags/Distillery01/TIT_2010/Out_PV"
        assert resolved.qos == 0
        assert resolved.retain is False
        assert resolved.topic_type == TopicType.TAG_VALUE

    def test_resolve_tag_default_area(self, router):
        resolved = router.resolve_tag("TIT/Out_PV")
        assert "default" in resolved.topic

    def test_resolve_health(self, router):
        resolved = router.resolve_health("PLC_001", area="Distillery01")
        assert resolved.topic == "whk/whk01/Distillery01/ot/health/PLC_001"
        assert resolved.qos == 1
        assert resolved.retain is True

    def test_resolve_equipment(self, router):
        resolved = router.resolve_equipment("CIP_001", "cipState", area="Distillery01")
        assert resolved.topic == "whk/whk01/Distillery01/equipment/CIP_001/cipState"
        assert resolved.retain is True

    def test_resolve_alarm(self, router):
        resolved = router.resolve_alarm("HIGH_TEMP", area="Distillery01")
        assert resolved.topic == "whk/whk01/Distillery01/ot/alarms/HIGH_TEMP"
        assert resolved.qos == 1

    def test_resolve_system(self, router):
        resolved = router.resolve_system("startup")
        assert resolved.topic == "whk/whk01/ot/system/startup"


# ---------------------------------------------------------------------------
# Custom templates
# ---------------------------------------------------------------------------


class TestCustomTemplates:

    def test_custom_template_with_priority(self):
        custom = TopicTemplate(
            topic_type=TopicType.TAG_VALUE,
            template="custom/{site}/{tag_path}",
            area_pattern="Distillery01",
            priority=10,
        )
        router = TopicRouter(site="whk01", templates=[custom])

        # Matching area should use custom template
        resolved = router.resolve_tag("TIT/Out_PV", area="Distillery01")
        assert resolved.topic == "custom/whk01/TIT/Out_PV"

        # Non-matching area uses default
        resolved = router.resolve_tag("TIT/Out_PV", area="Granary01")
        assert resolved.topic.startswith("whk/whk01/")

    def test_add_template(self):
        router = TopicRouter(site="whk01")
        initial_count = router.template_count
        router.add_template(TopicTemplate(
            topic_type=TopicType.SCRIPT,
            template="whk/{site}/scripts/{tag_path}",
        ))
        assert router.template_count == initial_count + 1


# ---------------------------------------------------------------------------
# Topic prefix
# ---------------------------------------------------------------------------


class TestTopicPrefix:

    def test_prefix_prepended(self):
        router = TopicRouter(site="whk01", topic_prefix="v1")
        resolved = router.resolve_tag("TIT/Out_PV", area="Distillery01")
        assert resolved.topic.startswith("v1/whk/")

    def test_prefix_trailing_slash_stripped(self):
        router = TopicRouter(site="whk01", topic_prefix="v1/")
        resolved = router.resolve_tag("TIT/Out_PV", area="Distillery01")
        assert not resolved.topic.startswith("v1//")


# ---------------------------------------------------------------------------
# Template listing
# ---------------------------------------------------------------------------


class TestTemplateListing:

    def test_get_all_templates(self):
        router = TopicRouter(site="whk01")
        templates = router.get_templates()
        assert len(templates) >= 5  # At least the defaults

    def test_get_templates_by_type(self):
        router = TopicRouter(site="whk01")
        tag_templates = router.get_templates(TopicType.TAG_VALUE)
        assert all(t.topic_type == TopicType.TAG_VALUE for t in tag_templates)
        assert len(tag_templates) >= 1
