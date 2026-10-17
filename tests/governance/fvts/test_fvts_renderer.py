"""ReferenceRenderer: the rules every forge-display renderer must share, one per test."""

from __future__ import annotations

import copy
from typing import Any

import pytest

from forge.governance.fvts.renderer import (
    WRITE_STATUSES,
    GoldenRenderError,
    ReferenceRenderer,
    load_golden_messages,
    render_golden_set,
)
from tests.governance.fvts.conftest import GOLDEN_DIR

CONTEXT = {"site": "whk01", "area": "Area1", "equipment_id": "Fermenter3", "operating_mode": "Run"}
NOW = "2026-10-16T12:00:00Z"


def update(point_id: str, raw: Any, quality: str = "GOOD", **overrides: Any) -> dict[str, Any]:
    message = {
        "point_id": point_id,
        "value": {"raw": raw, "quality": quality},
        "timestamp": {"source_time": "2026-10-16T11:59:59Z"},
        "context": dict(CONTEXT),
    }
    message.update(overrides)
    return message


def sub(*updates: dict[str, Any], **extra: Any) -> dict[str, Any]:
    return {"message_type": "subscription_update", "now": NOW, "updates": list(updates), **extra}


@pytest.fixture
def hmi(reference_spec: dict[str, Any]) -> ReferenceRenderer:
    return ReferenceRenderer(reference_spec, "desktop_hmi")


@pytest.fixture
def web(reference_spec: dict[str, Any]) -> ReferenceRenderer:
    return ReferenceRenderer(reference_spec, "web")


def first(renderer: ReferenceRenderer, *updates: dict[str, Any], **extra: Any) -> dict[str, Any]:
    return renderer.render(sub(*updates, **extra))["values"][0]


class TestValues:
    def test_numeric_precision_and_units(self, web: ReferenceRenderer) -> None:
        value = first(web, update("ferm.temperature", 150.27))
        assert value == {
            "point_id": "ferm.temperature",
            "display": "150.3 °F",
            "markers": [],
            "stale": False,
            "age_ms": 1000,
        }

    def test_enum_label_required(self, web: ReferenceRenderer) -> None:
        assert first(web, update("ferm.mode", 2))["display"] == "Production"
        with pytest.raises(GoldenRenderError, match="no enum label for raw value 9"):
            first(web, update("ferm.mode", 9))

    def test_boolean_is_strict(self, web: ReferenceRenderer) -> None:
        assert first(web, update("ferm.agitator_running", True))["display"] == "ON"
        with pytest.raises(GoldenRenderError, match="is not a boolean"):
            first(web, update("ferm.agitator_running", 1))
        with pytest.raises(GoldenRenderError, match="is a boolean, not FLOAT"):
            first(web, update("ferm.temperature", True))

    def test_uncertain_keeps_the_value_with_a_marker(self, web: ReferenceRenderer) -> None:
        value = first(web, update("ferm.temperature", 150.27, "UNCERTAIN"))
        assert value["display"] == "150.3 °F" and value["markers"] == ["UNCERTAIN"]

    def test_bad_blank_with_marker(self, web: ReferenceRenderer) -> None:
        value = first(web, update("ferm.temperature", None, "BAD"))
        assert value["display"] == "" and value["markers"] == ["BAD"]

    def test_bad_last_value_with_marker_remembers_the_last_good_value(self, web) -> None:
        first(web, update("ferm.temperature_sp", 152.0))
        value = first(web, update("ferm.temperature_sp", None, "NOT_AVAILABLE"))
        assert value["display"] == "152.0 °F" and value["markers"] == ["NOT_AVAILABLE"]

    def test_stale_by_timestamp_basis(self, web: ReferenceRenderer) -> None:
        old = update("ferm.temperature", 150.0, timestamp={"source_time": "2026-10-16T11:59:30Z"})
        value = first(web, old)
        assert value["stale"] is True and value["markers"] == ["STALE"] and value["age_ms"] == 30000

    def test_basis_timestamp_is_mandatory(self, web: ReferenceRenderer) -> None:
        with pytest.raises(GoldenRenderError, match="carries no source_time"):
            first(web, update("ferm.temperature", 1.0, timestamp={"server_time": NOW}))

    def test_required_context_fields(self, web: ReferenceRenderer) -> None:
        context = {k: v for k, v in CONTEXT.items() if k != "site"}
        with pytest.raises(GoldenRenderError, match=r"missing required context fields \['site'\]"):
            first(web, update("ferm.temperature", 1.0, context=context))

    def test_unknown_point_and_quality(self, web: ReferenceRenderer) -> None:
        with pytest.raises(GoldenRenderError, match="not declared in data_bindings"):
            first(web, update("ferm.pressure", 1.0))
        with pytest.raises(GoldenRenderError, match="is not a QualityCode"):
            first(web, update("ferm.temperature", 1.0, "DUBIOUS"))

    def test_rate_ceiling_per_profile(self, reference_spec: dict[str, Any]) -> None:
        web = ReferenceRenderer(reference_spec, "web")
        with pytest.raises(GoldenRenderError, match="10 Hz exceeds the web ceiling of 4 Hz"):
            web.render(sub(rate_hz=10))
        ReferenceRenderer(reference_spec, "desktop_hmi").render(sub(rate_hz=4))
        with pytest.raises(GoldenRenderError, match="exceeds the mobile ceiling of 1 Hz"):
            ReferenceRenderer(reference_spec, "mobile").render(sub(rate_hz=2))

    def test_disconnect_marks_every_point_stale(self, web: ReferenceRenderer) -> None:
        view = web.render({"message_type": "subscription_status", "state": "disconnected"})
        assert view["marked_stale"] == [
            "ferm.agitator_running",
            "ferm.mode",
            "ferm.temperature",
            "ferm.temperature_sp",
        ]
        assert (
            web.render({"message_type": "subscription_status", "state": "connected"})[
                "marked_stale"
            ]
            == []
        )
        with pytest.raises(GoldenRenderError, match=r"is not connected\|disconnected"):
            web.render({"message_type": "subscription_status", "state": "sleeping"})


class TestHistoryAndAlarms:
    def history(self, **overrides: Any) -> dict[str, Any]:
        message = {
            "message_type": "history_response",
            "point_id": "ferm.temperature",
            "timestamp_basis": "source_time",
            "decimation": {"location": "server", "algorithm": "min_max_per_bucket"},
            "series": [{"t": "2026-10-16T11:00:00Z", "v": 150.0}],
        }
        message.update(overrides)
        return message

    def test_history_rules(self, web: ReferenceRenderer, reference_spec: dict) -> None:
        assert web.render(self.history())["points"] == 1
        with pytest.raises(GoldenRenderError, match="decimated server-side"):
            web.render(self.history(decimation={"location": "client", "algorithm": "lttb"}))
        with pytest.raises(GoldenRenderError, match="contract says 'min_max_per_bucket'"):
            web.render(self.history(decimation={"location": "server", "algorithm": "lttb"}))
        with pytest.raises(GoldenRenderError, match="timestamp_basis 'server_time' differs"):
            web.render(self.history(timestamp_basis="server_time"))
        too_many = [{"t": "2026-10-16T11:00:00Z", "v": 1}] * 4001
        with pytest.raises(GoldenRenderError, match="caps it at 4000"):
            web.render(self.history(series=too_many))
        with pytest.raises(GoldenRenderError, match="has no value"):
            web.render(self.history(series=[{"t": "2026-10-16T11:00:00Z"}]))
        disabled = copy.deepcopy(reference_spec)
        disabled["history"] = {"enabled": False}
        with pytest.raises(GoldenRenderError, match="history is not enabled"):
            ReferenceRenderer(disabled, "web").render(self.history())

    def test_alarm_tokens_and_annunciation(self, web: ReferenceRenderer) -> None:
        view = web.render(
            {
                "message_type": "alarm_event",
                "events": [
                    {"alarm_id": "A", "state": "ACTIVE_UNACK", "priority": "HIGH"},
                    {"alarm_id": "A", "state": "ACTIVE_ACK", "priority": "HIGH"},
                ],
            }
        )
        assert view["events"][0]["token"] == "alarm.high" and view["events"][0]["annunciate"]
        assert view["events"][1]["annunciate"] is False
        with pytest.raises(GoldenRenderError, match=r"state 'FLASHING' is not in alarms\.states"):
            web.render(
                {
                    "message_type": "alarm_event",
                    "events": [
                        {"alarm_id": "A", "state": "FLASHING", "priority": "HIGH"},
                    ],
                }
            )
        with pytest.raises(GoldenRenderError, match="priority 'URGENT' not in"):
            web.render(
                {
                    "message_type": "alarm_event",
                    "events": [
                        {"alarm_id": "A", "state": "NORMAL", "priority": "URGENT"},
                    ],
                }
            )


class TestActionsAndSurfaces:
    def result(self, action_id: str, status: str, **extra: Any) -> dict[str, Any]:
        return {"message_type": "action_result", "action_id": action_id, "status": status, **extra}

    def test_result_only_for_permitted_actions(self, hmi, web) -> None:
        assert hmi.render(self.result("ferm.write_temperature_sp", "CONFIRMED"))["audited"] is True
        with pytest.raises(GoldenRenderError, match="is not permitted on web"):
            web.render(self.result("ferm.write_temperature_sp", "CONFIRMED"))
        assert web.render(self.result("alarm.acknowledge", "CONFIRMED"))["status"] == "CONFIRMED"

    def test_statuses_must_be_handled(self, hmi, reference_spec) -> None:
        with pytest.raises(GoldenRenderError, match="is not a WriteStatus"):
            hmi.render(self.result("ferm.write_temperature_sp", "MAYBE"))
        narrowed = copy.deepcopy(reference_spec)
        narrowed["actions"][0]["handled_statuses"].remove("PENDING")
        with pytest.raises(GoldenRenderError, match="PENDING is not in handled_statuses"):
            ReferenceRenderer(narrowed, "desktop_hmi").render(
                self.result("ferm.write_temperature_sp", "PENDING")
            )

    def test_interlock_feedback_is_mandatory(self, hmi: ReferenceRenderer) -> None:
        with pytest.raises(GoldenRenderError, match="without the blocking condition"):
            hmi.render(self.result("ferm.write_temperature_sp", "REJECTED_INTERLOCK"))
        view = hmi.render(
            self.result(
                "ferm.write_temperature_sp",
                "REJECTED_INTERLOCK",
                interlock={"rule_id": "IL-1", "message": "CIP running"},
            )
        )
        assert view["interlock_feedback"] == "IL-1: CIP running"

    def test_surface_actions_filtered_per_profile(self, hmi, web) -> None:
        message = {"message_type": "surface_render", "surface_id": "ferm.overview"}
        assert web.render(message)["actions_hidden"] == [
            "ferm.write_temperature_sp",
            "alarm.shelve",
        ]
        assert hmi.render(message)["actions_hidden"] == []
        assert hmi.render(message)["points"] == [
            "ferm.temperature",
            "ferm.temperature_sp",
            "ferm.agitator_running",
            "ferm.mode",
        ]

    def test_surface_must_be_offered_on_the_profile(self, reference_spec: dict) -> None:
        mobile = ReferenceRenderer(reference_spec, "mobile")
        with pytest.raises(GoldenRenderError, match="is not offered on mobile"):
            mobile.render({"message_type": "surface_render", "surface_id": "ferm.overview"})
        with pytest.raises(GoldenRenderError, match="not declared in surfaces"):
            mobile.render({"message_type": "surface_render", "surface_id": "ghost"})

    def test_profiles_filter_and_message_types(self, web: ReferenceRenderer) -> None:
        assert web.applies({"profiles": ["desktop_hmi"]}) is False
        assert web.applies({"profiles": ["web"]}) and web.applies({})
        with pytest.raises(GoldenRenderError, match="unknown message_type 'toast'"):
            web.render({"message_type": "toast"})
        with pytest.raises(GoldenRenderError, match="malformed subscription_update"):
            web.render({"message_type": "subscription_update", "updates": "nope"})

    def test_renderer_needs_a_supported_known_profile(self, reference_spec: dict) -> None:
        narrowed = copy.deepcopy(reference_spec)
        narrowed["render_profiles"]["supported"] = ["desktop_hmi"]
        with pytest.raises(GoldenRenderError, match=r"not in render_profiles\.supported"):
            ReferenceRenderer(narrowed, "web")
        with pytest.raises(GoldenRenderError, match="unknown render profile"):
            ReferenceRenderer(reference_spec, "watch")


class TestGoldenSet:
    def test_load_golden_directory(self) -> None:
        messages = load_golden_messages(GOLDEN_DIR)
        assert len(messages) == 12
        assert [m.source for m in messages][:4] == [
            "01_subscription_update.json",
            "02_subscription_stale_and_bad.json",
            "03_subscription_status.json[0]",
            "03_subscription_status.json[1]",
        ]

    def test_render_golden_set_per_profile(self, reference_spec: dict) -> None:
        messages = load_golden_messages(GOLDEN_DIR)
        hmi = render_golden_set(reference_spec, "desktop_hmi", messages)
        assert (hmi.rendered, hmi.skipped, hmi.errors) == (12, 0, [])
        web = render_golden_set(reference_spec, "web", messages)
        assert (web.rendered, web.skipped, web.errors) == (10, 2, [])
        unsupported = render_golden_set(reference_spec, "watch", messages)
        assert unsupported.rendered == 0 and unsupported.errors == [
            "unknown render profile 'watch'"
        ]

    def test_write_statuses_mirror_the_schema(self, schema: dict) -> None:
        assert set(schema["$defs"]["writeStatus"]["enum"]) == WRITE_STATUSES

    def test_non_object_golden_message_is_rejected(self, tmp_path) -> None:
        (tmp_path / "x.json").write_text("[1]", encoding="utf-8")
        with pytest.raises(GoldenRenderError, match="must be a JSON object"):
            load_golden_messages(tmp_path)
