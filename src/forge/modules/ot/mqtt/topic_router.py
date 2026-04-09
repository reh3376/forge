"""TopicRouter — template-based MQTT topic resolution.

The topic router converts tag paths and metadata into MQTT topics
using configurable templates.  This mirrors the MES
``MqttEventPublishRule`` pattern but with a more flexible template
engine.

Design decisions:
    D1: Templates use Python str.format_map() with named placeholders:
        ``{site}/{area}/ot/tags/{tag_path}``
    D2: Tag paths are normalized: ``/`` separators preserved, leading/
        trailing slashes stripped.
    D3: Multiple templates can be registered for different message types
        (tag_value, health, equipment, alarm).  Each type has a default
        template that can be overridden per-area or per-tag pattern.
    D4: The router is stateless (no connection to broker) — it only
        resolves strings.  The publisher calls router.resolve() and
        publishes to the returned topic.
"""

from __future__ import annotations

import fnmatch
import logging
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Topic types
# ---------------------------------------------------------------------------


class TopicType(str, Enum):
    """Categories of MQTT topics published by the OT Module."""

    TAG_VALUE = "tag_value"
    HEALTH = "health"
    EQUIPMENT = "equipment"
    ALARM = "alarm"
    SCRIPT = "script"       # Script-originated publishes
    SYSTEM = "system"       # Module lifecycle, status


# ---------------------------------------------------------------------------
# Topic template
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TopicTemplate:
    """A named topic template with optional scope restrictions.

    Args:
        topic_type: The category of message this template handles.
        template: Format string with placeholders like ``{site}``, ``{area}``,
            ``{tag_path}``, ``{equipment_id}``, ``{plc_id}``.
        area_pattern: If set, this template only applies to matching areas.
        tag_pattern: If set, this template only applies to matching tag paths.
        qos: Default QoS for messages using this template.
        retain: Default retain flag.
        priority: Higher priority templates are checked first (default 0).
    """

    topic_type: TopicType
    template: str
    area_pattern: str = "*"
    tag_pattern: str = "**"
    qos: int = 0
    retain: bool = False
    priority: int = 0


# ---------------------------------------------------------------------------
# Default templates
# ---------------------------------------------------------------------------


DEFAULT_TEMPLATES: list[TopicTemplate] = [
    TopicTemplate(
        topic_type=TopicType.TAG_VALUE,
        template="whk/{site}/{area}/ot/tags/{tag_path}",
        qos=0,
        retain=False,
    ),
    TopicTemplate(
        topic_type=TopicType.HEALTH,
        template="whk/{site}/{area}/ot/health/{plc_id}",
        qos=1,
        retain=True,
    ),
    TopicTemplate(
        topic_type=TopicType.EQUIPMENT,
        template="whk/{site}/{area}/equipment/{equipment_id}/{field}",
        qos=1,
        retain=True,
    ),
    TopicTemplate(
        topic_type=TopicType.ALARM,
        template="whk/{site}/{area}/ot/alarms/{alarm_name}",
        qos=1,
        retain=False,
    ),
    TopicTemplate(
        topic_type=TopicType.SYSTEM,
        template="whk/{site}/ot/system/{event}",
        qos=1,
        retain=True,
    ),
]


# ---------------------------------------------------------------------------
# Resolved topic
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ResolvedTopic:
    """The result of topic resolution — a fully-qualified MQTT topic
    plus the publishing parameters from the matched template."""

    topic: str
    qos: int = 0
    retain: bool = False
    topic_type: TopicType = TopicType.TAG_VALUE


# ---------------------------------------------------------------------------
# TopicRouter
# ---------------------------------------------------------------------------


class TopicRouter:
    """Resolves tag/equipment metadata into MQTT topics.

    Usage::

        router = TopicRouter(site="whk01")
        resolved = router.resolve_tag(
            tag_path="Distillery01/TIT_2010/Out_PV",
            area="Distillery01",
        )
        # resolved.topic == "whk/whk01/Distillery01/ot/tags/Distillery01/TIT_2010/Out_PV"
    """

    def __init__(
        self,
        site: str = "whk01",
        templates: list[TopicTemplate] | None = None,
        topic_prefix: str = "",
    ) -> None:
        self._site = site
        self._topic_prefix = topic_prefix.rstrip("/")
        self._templates: list[TopicTemplate] = []

        # Load defaults, then add custom
        for t in DEFAULT_TEMPLATES:
            self._templates.append(t)
        if templates:
            for t in templates:
                self._templates.append(t)

        # Sort by priority (highest first), then by specificity
        self._templates.sort(key=lambda t: -t.priority)

    @property
    def site(self) -> str:
        return self._site

    @property
    def template_count(self) -> int:
        return len(self._templates)

    # ------------------------------------------------------------------
    # Resolution methods
    # ------------------------------------------------------------------

    def resolve_tag(
        self,
        tag_path: str,
        area: str = "",
        **extra: str,
    ) -> ResolvedTopic:
        """Resolve a tag path to an MQTT topic."""
        return self._resolve(
            TopicType.TAG_VALUE,
            tag_path=_normalize_path(tag_path),
            area=area or "default",
            **extra,
        )

    def resolve_health(
        self,
        plc_id: str,
        area: str = "",
        **extra: str,
    ) -> ResolvedTopic:
        """Resolve a PLC health check to an MQTT topic."""
        return self._resolve(
            TopicType.HEALTH,
            plc_id=plc_id,
            area=area or "default",
            **extra,
        )

    def resolve_equipment(
        self,
        equipment_id: str,
        field_name: str,
        area: str = "",
        **extra: str,
    ) -> ResolvedTopic:
        """Resolve an equipment status field to an MQTT topic."""
        return self._resolve(
            TopicType.EQUIPMENT,
            equipment_id=equipment_id,
            field=field_name,
            area=area or "default",
            **extra,
        )

    def resolve_alarm(
        self,
        alarm_name: str,
        area: str = "",
        **extra: str,
    ) -> ResolvedTopic:
        """Resolve an alarm to an MQTT topic."""
        return self._resolve(
            TopicType.ALARM,
            alarm_name=alarm_name,
            area=area or "default",
            **extra,
        )

    def resolve_system(
        self,
        event: str,
        **extra: str,
    ) -> ResolvedTopic:
        """Resolve a system event to an MQTT topic."""
        return self._resolve(
            TopicType.SYSTEM,
            event=event,
            **extra,
        )

    # ------------------------------------------------------------------
    # Internal resolution
    # ------------------------------------------------------------------

    def _resolve(
        self,
        topic_type: TopicType,
        **context: str,
    ) -> ResolvedTopic:
        """Find the best matching template and format the topic."""
        context["site"] = context.get("site", self._site)
        area = context.get("area", "")
        tag_path = context.get("tag_path", "")

        for tmpl in self._templates:
            if tmpl.topic_type != topic_type:
                continue
            if not fnmatch.fnmatch(area, tmpl.area_pattern):
                continue
            if tag_path and tmpl.tag_pattern != "**":
                if not _match_tag_pattern(tmpl.tag_pattern, tag_path):
                    continue

            try:
                topic = tmpl.template.format_map(context)
            except KeyError as exc:
                logger.warning(
                    "Topic template missing key %s: %s", exc, tmpl.template,
                )
                continue

            # Apply prefix
            if self._topic_prefix:
                topic = f"{self._topic_prefix}/{topic}"

            return ResolvedTopic(
                topic=topic,
                qos=tmpl.qos,
                retain=tmpl.retain,
                topic_type=topic_type,
            )

        # Fallback: construct a generic topic
        fallback = f"whk/{self._site}/{topic_type.value}"
        if tag_path:
            fallback += f"/{tag_path}"
        if self._topic_prefix:
            fallback = f"{self._topic_prefix}/{fallback}"

        logger.debug("No template matched for %s, using fallback: %s", topic_type, fallback)
        return ResolvedTopic(topic=fallback, topic_type=topic_type)

    # ------------------------------------------------------------------
    # Template management
    # ------------------------------------------------------------------

    def add_template(self, template: TopicTemplate) -> None:
        """Add a custom topic template."""
        self._templates.append(template)
        self._templates.sort(key=lambda t: -t.priority)

    def get_templates(self, topic_type: TopicType | None = None) -> list[TopicTemplate]:
        """Get templates, optionally filtered by type."""
        if topic_type is None:
            return list(self._templates)
        return [t for t in self._templates if t.topic_type == topic_type]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _normalize_path(path: str) -> str:
    """Normalize a tag path for MQTT topic use."""
    # Strip leading/trailing slashes
    path = path.strip("/")
    # Collapse double slashes
    while "//" in path:
        path = path.replace("//", "/")
    return path


def _match_tag_pattern(pattern: str, tag_path: str) -> bool:
    """Match a tag path against a glob-like pattern.

    Same logic as triggers._match_tag_pattern — segment-aware.
    """
    if pattern == "**":
        return True

    parts = pattern.split("/")
    regex_parts = []
    for part in parts:
        if part == "**":
            regex_parts.append(".*")
        elif "*" in part:
            regex_parts.append(part.replace("*", "[^/]+"))
        else:
            regex_parts.append(re.escape(part))
    regex = "^" + "/".join(regex_parts) + "$"
    return bool(re.match(regex, tag_path))
