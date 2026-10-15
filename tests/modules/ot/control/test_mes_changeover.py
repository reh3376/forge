"""MesChangeoverClient: typed OT → MES changeover commands over write-back (FB-054)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest

from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)
from forge.modules.ot.control import (
    CHANGEOVER_AREAS,
    CHANGEOVER_COMMANDS,
    MesChangeoverClient,
    changeover_tag,
    transition_from,
)
from forge.transport.spoke_callback import WriteOutcome


class FakeDispatcher:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    async def write(self, adapter_id, tag_path, value, *, confirm=False):
        self.calls.append(
            {"adapter_id": adapter_id, "tag_path": tag_path, "value": value, "confirm": confirm}
        )
        readback = None
        if confirm:
            readback = ContextualRecord(
                source=RecordSource(adapter_id=adapter_id, system="forge-mes", tag_path="x"),
                timestamp=RecordTimestamp(source_time=datetime(2026, 6, 1, tzinfo=UTC)),
                value=RecordValue(
                    raw={"state": "RECIPE_LOADING", "area": "cooker"},
                    quality=QualityCode.GOOD,
                    data_type="object",
                ),
                context=RecordContext(),
                lineage=RecordLineage(
                    schema_ref="forge://schemas/forge-mes/v0.1.0",
                    adapter_id=adapter_id,
                    adapter_version="0.1.0",
                ),
            )
        return WriteOutcome(
            adapter_id=adapter_id, tag_path=tag_path, success=True, message="ok", readback=readback
        )


def test_tag_paths_are_validated() -> None:
    assert changeover_tag("cooker", "cip-complete") == "mes.changeover.cooker.cip-complete"
    assert len(CHANGEOVER_AREAS) == 3 and len(CHANGEOVER_COMMANDS) == 5
    with pytest.raises(ValueError, match="area"):
        changeover_tag("stillhouse", "request")
    with pytest.raises(ValueError, match="command"):
        changeover_tag("cooker", "launch")


async def test_commands_map_to_tags_and_rest_payloads() -> None:
    dispatcher = FakeDispatcher()
    mes = MesChangeoverClient(dispatcher, confirm=False)
    start = datetime(2026, 6, 1, 8, tzinfo=UTC)
    end = datetime(2026, 6, 1, 9, tzinfo=UTC)

    await mes.request("cooker", "ot-module", force=True, reason="cooks done")
    await mes.cip_complete("cooker", start, end, duration_seconds=3600, reported_by="ot")
    await mes.recipe_loaded("cooker", "sori-1", "2026-06-01T07:00:00.000Z", "3", loaded_by="ot")
    await mes.start_production("cooker", "operator-7", notes="go")
    await mes.reset("fermentation", "CIP_COMPLETE", "engineer", reason="cleared")

    tags = [c["tag_path"] for c in dispatcher.calls]
    assert tags == [
        "mes.changeover.cooker.request",
        "mes.changeover.cooker.cip-complete",
        "mes.changeover.cooker.recipe-loaded",
        "mes.changeover.cooker.start-production",
        "mes.changeover.fermentation.reset",
    ]
    payloads = [c["value"] for c in dispatcher.calls]
    assert payloads[0] == {"requestedBy": "ot-module", "force": True, "reason": "cooks done"}
    assert payloads[1] == {
        "cipStartTime": "2026-06-01T08:00:00+00:00",
        "cipEndTime": "2026-06-01T09:00:00+00:00",
        "cipDurationSeconds": 3600,
        "reportedBy": "ot",
    }
    assert payloads[2] == {
        "scheduleOrderRecipeInstanceId": "sori-1",
        "sourceUpdatedAt": "2026-06-01T07:00:00.000Z",
        "cookerNumber": "3",
        "loadedBy": "ot",
    }
    assert payloads[3] == {"startedBy": "operator-7", "notes": "go"}
    assert payloads[4] == {
        "targetState": "CIP_COMPLETE",
        "resetBy": "engineer",
        "reason": "cleared",
    }
    assert all(c["adapter_id"] == "forge-mes" and c["confirm"] is False for c in dispatcher.calls)

    # a plain request omits force when it is False
    await mes.request("cooker", "someone")
    assert dispatcher.calls[-1]["value"] == {"requestedBy": "someone"}


async def test_confirm_readback_and_reset_guard() -> None:
    dispatcher = FakeDispatcher()
    mes = MesChangeoverClient(dispatcher, adapter_id="forge-mes-staging")
    out = await mes.cip_complete("cooker", "2026-06-01T08:00:00Z", "2026-06-01T09:00:00Z")
    assert dispatcher.calls[0]["adapter_id"] == "forge-mes-staging"
    assert dispatcher.calls[0]["confirm"] is True
    assert transition_from(out) == {"state": "RECIPE_LOADING", "area": "cooker"}

    unconfirmed = WriteOutcome(adapter_id="a", tag_path="t", success=True)
    assert transition_from(unconfirmed) is None

    with pytest.raises(ValueError, match="reset target"):
        await mes.reset("cooker", "PRODUCTION", "x")
