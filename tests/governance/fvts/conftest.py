"""Fixtures for the FVTS governance tests: schema, reference spec, runner, FACTS specs."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import TYPE_CHECKING, Any

import pytest

from forge.governance.fvts import SCHEMA_PATH, SPECS_DIR
from forge.governance.fvts.runners.fvts_runner import FVTSRunner, load_facts_specs

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from forge.governance.shared.runner import FxTSVerdict

REFERENCE_SPEC_PATH = SPECS_DIR / "ot-module.fvts.json"
GOLDEN_DIR = Path(__file__).parent / "golden" / "ot-module"


@pytest.fixture(scope="session")
def schema() -> dict[str, Any]:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def reference_spec() -> dict[str, Any]:
    return json.loads(REFERENCE_SPEC_PATH.read_text(encoding="utf-8"))


@pytest.fixture
def spec(reference_spec: dict[str, Any]) -> dict[str, Any]:
    """A fresh copy of the reference spec to mutate per test."""
    return copy.deepcopy(reference_spec)


@pytest.fixture(scope="session")
def runner() -> FVTSRunner:
    return FVTSRunner(schema_path=SCHEMA_PATH)


@pytest.fixture(scope="session")
def facts_specs() -> dict[str, dict[str, Any]]:
    return load_facts_specs()


@pytest.fixture
def check(
    runner: FVTSRunner, facts_specs: dict[str, dict[str, Any]]
) -> Callable[..., Awaitable[FxTSVerdict]]:
    """Run the runner over a spec and return one verdict by check id."""

    async def run(spec: dict[str, Any], check_id: str, **kwargs: Any) -> FxTSVerdict:
        kwargs.setdefault("facts_specs", facts_specs)
        report = await runner.run(target=spec["view_identity"]["view_id"], spec=spec, **kwargs)
        return next(v for v in report.verdicts if v.check_id == check_id)

    return run
