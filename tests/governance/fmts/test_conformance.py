"""The conformance kit: a module that meets M-4 to M-7, and modules that break each one."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

import pytest

from forge.adapters.forge_wms.adapter import ForgeWmsAdapter
from forge.core.models.adapter import AdapterHealth
from forge.governance.fmts import REPO_ROOT
from forge.governance.fmts.conformance import (
    PythonAdapterDriver,
    ReferenceHub,
    adapter_module_name,
    find_adapter_class,
    load_fixture,
    placeholder_params,
    run_conformance,
)
from forge.governance.shared.runner import VerdictStatus
from forge.transport.spoke_client import SpokeClient

if TYPE_CHECKING:
    from collections.abc import Callable

PASS, FAIL, SKIP = VerdictStatus.PASS, VerdictStatus.FAIL, VerdictStatus.SKIP
MANIFEST = REPO_ROOT / "src/forge/adapters/forge_wms/manifest.json"
PARAMS = placeholder_params(json.loads(MANIFEST.read_text(encoding="utf-8")))
EVENTS = [
    {"id": "B1", "barrel_id": "B1", "event_timestamp": "2026-04-06T10:00:00+00:00"},
    {"id": "B2", "barrel_id": "B2", "event_timestamp": "2026-04-06T05:00:00-05:00"},
]


def _driver(
    adapter: type = ForgeWmsAdapter, events: list[dict[str, Any]] | None = None
) -> Callable[[ReferenceHub], PythonAdapterDriver]:
    return lambda hub: PythonAdapterDriver(
        hub, adapter, params=dict(PARAMS), events=EVENTS if events is None else events
    )


def _messages(verdict: Any) -> str:
    return " | ".join(v.message for v in verdict.violations)


class SilentAdapter(ForgeWmsAdapter):
    """Reports its state but never a refusal: what M-5 and M-7 exist to catch."""

    async def health(self) -> AdapterHealth:
        return AdapterHealth(adapter_id=self.adapter_id, state=self._state)


class NoMeasurementDriver(PythonAdapterDriver):
    """A module that sends T1 but never reports what it measured."""

    def __post_init__(self) -> None:
        super().__post_init__()

        class Mute(SpokeClient):
            def _complete_exchange(self, t1: Any, response: Any) -> None:
                return  # never keeps an exchange, so it has nothing to report

        self.transport._client = Mute(channel=self.transport.channel, now=self.hub.clocks.module)


class TestAModuleThatConforms:
    async def test_all_four_pass(self) -> None:
        results = await run_conformance(_driver())
        assert {k: v.status for k, v in results.items()} == {
            "M-4": PASS,
            "M-5": PASS,
            "M-6": PASS,
            "M-7": PASS,
        }
        assert [v.check_id for v in results.values()] == [
            "fmts:m4",
            "fmts:m5",
            "fmts:m7",
            "fmts:m6",
        ]
        assert results["M-4"].evidence["requests"][0] == "Register"
        assert set(results["M-4"].evidence["requests"]) == {"Register", "Health", "Ingest"}
        assert results["M-5"].evidence["refused_cause"] == "clock_out_of_tolerance"
        assert results["M-5"].evidence["own_health"]["refusals"] == {"clock_out_of_tolerance": 1}
        assert results["M-6"].evidence == {"records": 2}

    async def test_without_sample_events_m6_is_not_checked(self) -> None:
        results = await run_conformance(_driver(events=[]))
        assert results["M-6"].status == SKIP and "NOT CHECKED" in results["M-6"].message
        assert results["M-4"].status == PASS and results["M-5"].status == PASS


class TestModulesThatDoNot:
    async def test_a_module_that_hides_refusals_fails_m5_and_m7(self) -> None:
        results = await run_conformance(_driver(SilentAdapter))
        assert results["M-5"].status == FAIL and results["M-7"].status == FAIL
        assert "a refusal is never silent" in _messages(results["M-5"])
        assert "has no 'refusals'" not in _messages(results["M-7"])  # the field exists, empty
        assert "names no last refusal" in _messages(results["M-7"])
        assert results["M-4"].status == PASS  # it does exchange time

    async def test_a_module_that_reports_no_measurement_fails_m4(self) -> None:
        results = await run_conformance(
            lambda hub: NoMeasurementDriver(hub, ForgeWmsAdapter, params=dict(PARAMS))
        )
        assert results["M-4"].status == FAIL
        assert "did not report the measurement" in _messages(results["M-4"])
        assert "no two-way measurement" in _messages(results["M-4"])

    async def test_a_module_that_breaks_under_the_kit_fails(self) -> None:
        results = await run_conformance(
            lambda hub: PythonAdapterDriver(hub, ForgeWmsAdapter, params={"graphql_url": 5})
        )
        assert {v.status for v in results.values()} == {FAIL}
        assert "ValidationError" in _messages(results["M-4"])
        assert results["M-7"].check_id == "fmts:m7"


class TestTheKitsOwnParts:
    def test_the_reference_hub_records_what_a_request_carried(self) -> None:
        hub = ReferenceHub()
        assert hub.wire == [] and hub.clocks.hub() < hub.clocks.hub()
        hub.clocks.skew = hub.clocks.skew.__class__(seconds=3)
        ahead = (hub.clocks.module() - hub.clocks.hub()).total_seconds()
        assert ahead == pytest.approx(3, abs=0.01)

    @pytest.mark.parametrize(
        ("path", "module"),
        [
            ("src/forge/adapters/forge_wms", "forge.adapters.forge_wms.adapter"),
            ("src/forge/modules/ot/", "forge.modules.ot.adapter"),
            ("src/wms", None),
            ("modules/Forge MES/backend/src", None),
            ("src/forge/adapters/not-a-package", None),
            ("../outside", None),
        ],
    )
    def test_adapter_module_name(self, path: str, module: str | None) -> None:
        assert adapter_module_name(path) == module

    def test_find_adapter_class(self) -> None:
        assert find_adapter_class("forge.adapters.forge_wms.adapter") is ForgeWmsAdapter
        with pytest.raises(ValueError, match="defines 0 adapter classes"):
            find_adapter_class("forge.adapters.forge_wms.config")

    def test_placeholder_params_fill_only_what_is_required(self) -> None:
        manifest = {
            "connection_params": [
                {"name": "graphql_url", "required": True},
                {"name": "rabbitmq_url", "required": True},
                {"name": "nms_ws_url", "required": True},
                {"name": "grpc_host", "required": True},
                {"name": "grpc_port", "required": True},
                {"name": "spoke_id", "required": True},
                {"name": "api_base_url", "required": True, "default": "http://localhost"},
                {"name": "api_key", "required": False},
            ]
        }
        assert placeholder_params(manifest) == {
            "graphql_url": "http://conformance.invalid",
            "rabbitmq_url": "amqp://conformance.invalid",
            "nms_ws_url": "ws://conformance.invalid",
            "grpc_host": "conformance.invalid",
            "grpc_port": "1",
            "spoke_id": "conformance",
        }
        assert placeholder_params({}) == {}

    def test_fixtures_are_read_from_the_repository(self) -> None:
        fixture = load_fixture(REPO_ROOT, "forge-wms")
        assert len(fixture["events"]) == 2
        assert load_fixture(REPO_ROOT, "no-such-module") == {}
        raw = (REPO_ROOT / "tests/governance/fmts/conformance/next-trend.json").read_text()
        assert json.loads(raw)["params"] == {"api_key": "conformance-kit-placeholder"}
