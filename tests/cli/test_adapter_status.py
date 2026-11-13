"""`forge adapter status` shows a refusal with its cause (never silent, FB-088)."""

from __future__ import annotations

from typer.testing import CliRunner

from forge.cli.main import app

HEALTH = {
    "state": "DEGRADED",
    "last_check": "2026-11-13T12:00:00Z",
    "records_collected": 41,
    "records_failed": 2,
    "uptime_seconds": 90.0,
    "error_message": "whk-wms: a value on tag wms.barrel.fill arrived without a source timestamp",
    "refusals": {"source_stamp_missing": 2},
    "last_refusal": "whk-wms: a value on tag wms.barrel.fill arrived without a source timestamp",
}


class _Response:
    status_code = 200

    def json(self) -> dict:
        return HEALTH


def test_status_prints_the_refusals_and_their_cause(monkeypatch) -> None:
    import httpx

    monkeypatch.setattr(httpx, "get", lambda *a, **k: _Response())
    result = CliRunner().invoke(app, ["adapter", "status", "whk-wms"])
    assert result.exit_code == 0, result.output
    assert "State:            DEGRADED" in result.output
    assert "Records Failed:   2" in result.output
    assert "Refused:          source_stamp_missing=2" in result.output
    assert "Last Refusal:     whk-wms: a value on tag wms.barrel.fill" in result.output
    assert "Error:            whk-wms" in result.output


def test_status_stays_quiet_when_nothing_was_refused(monkeypatch) -> None:
    import httpx

    class _Healthy(_Response):
        def json(self) -> dict:
            return {
                "state": "HEALTHY",
                "records_collected": 1,
                "records_failed": 0,
                "uptime_seconds": 1,
            }

    monkeypatch.setattr(httpx, "get", lambda *a, **k: _Healthy())
    result = CliRunner().invoke(app, ["adapter", "status", "whk-wms"])
    assert result.exit_code == 0, result.output
    assert "Refused:" not in result.output and "Error:" not in result.output
