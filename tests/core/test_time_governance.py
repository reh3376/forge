"""The FACTS ``time_governance`` declaration on the manifest (one clock, FB-090)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from forge.core.models.adapter import ConnectionTimeGovernance, TimeGovernance


def _governance(**overrides: object) -> TimeGovernance:
    base: dict[str, object] = {
        "time_source": "hub-ntp",
        "sync_protocol": "ntp",
        "source_timestamp_origin": "server",
        "tolerance_class": "it-lan",
    }
    return TimeGovernance(**{**base, **overrides})  # type: ignore[arg-type]


def test_defaults_follow_the_record() -> None:
    """P-2's 30 s cadence and P-5's fail-closed are the defaults; the rest is declared."""
    governance = _governance()
    assert governance.clock_probe_interval_seconds == 30.0 and governance.fail_closed is True
    assert governance.clock_read_method is None and governance.connections == []


def test_fail_closed_cannot_be_declared_false() -> None:
    with pytest.raises(ValidationError, match="fail_closed"):
        _governance(fail_closed=False)


def test_probe_cadence_is_at_least_one_second() -> None:
    with pytest.raises(ValidationError, match="clock_probe_interval_seconds"):
        _governance(clock_probe_interval_seconds=0.5)
    with pytest.raises(ValidationError, match="clock_probe_interval_seconds"):
        ConnectionTimeGovernance(name="WHK01", clock_probe_interval_seconds=0)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("time_source", "wristwatch"),
        ("sync_protocol", "sundial"),
        ("source_timestamp_origin", "guess"),
        ("tolerance_class", "T9"),
        ("clock_read_method", "ask-the-operator"),
    ],
)
def test_enums_are_closed(field: str, value: str) -> None:
    with pytest.raises(ValidationError, match=field):
        _governance(**{field: value})


def test_origin_for_prefers_the_connection_s_own_entry() -> None:
    governance = _governance(
        connections=[
            ConnectionTimeGovernance(name="WHK01", source_timestamp_origin="device"),
            ConnectionTimeGovernance(name="WHK02"),  # named, no origin of its own
        ]
    )
    assert governance.origin_for("WHK01") == "device"
    assert governance.origin_for("WHK02") == "server"
    assert governance.origin_for("WHK03") == "server"
    assert governance.origin_for(None) == "server"


def test_a_connection_entry_needs_a_name() -> None:
    with pytest.raises(ValidationError, match="name"):
        ConnectionTimeGovernance(name="")


def test_the_json_form_round_trips() -> None:
    governance = _governance(
        clock_read_method="opcua-current-time",
        connections=[ConnectionTimeGovernance(name="WHK01", tolerance_class="T1")],
    )
    dumped = governance.model_dump(mode="json", exclude_none=True)
    assert dumped["connections"] == [{"name": "WHK01", "tolerance_class": "T1"}]
    assert TimeGovernance.model_validate(dumped) == governance
