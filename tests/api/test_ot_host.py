"""The hub hosts the OT module in-process when FORGE_OT_CONTROL_CONFIG is set (FB-065)."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

import pytest
from fastapi.testclient import TestClient

from forge.api.main import create_app
from forge.modules.ot.control import ConfigError

if TYPE_CHECKING:
    from pathlib import Path

SP = "WH/WHK01/Cooker01/TIT_2010/SP"


def write_config(tmp_path: Path) -> Path:
    path = tmp_path / "ot-control.json"
    path.write_text(
        json.dumps(
            {
                "site": "whk01",
                "mqtt": {"mode": "none"},
                "write_tags": [
                    {"tag_path": SP, "data_type": "FLOAT", "min_value": 0, "max_value": 212}
                ],
                "permissions": [{"area_pattern": "*", "tag_pattern": "*", "min_role": "ENGINEER"}],
                "recipes": [
                    {
                        "equipment_id": "Cooker01",
                        "area": "cooker",
                        "mappings": [{"parameter_name": "target_temp", "tag_path": SP}],
                    }
                ],
                "changeover_areas": [
                    {
                        "area": "cooker",
                        "equipment_id": "Cooker01",
                        "cooker_number": "1",
                        "cip_policy": "skip",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    return path


def write_tags(tmp_path: Path) -> Path:
    tags_dir = tmp_path / "tags"
    tags_dir.mkdir()
    (tags_dir / "cooker01.tags.json").write_text(
        json.dumps(
            [
                {
                    "tag_type": "standard",
                    "path": SP,
                    "data_type": "Float",
                    "opcua_node_id": "ns=2;s=TIT_2010.SP",
                    "connection_name": "WHK01",
                },
                {"tag_type": "memory", "path": "WH/WHK01/Cooker01/Note", "data_type": "String"},
            ]
        ),
        encoding="utf-8",
    )
    return tags_dir


@pytest.fixture
def no_grpc(monkeypatch):
    monkeypatch.setenv("FORGE_GRPC_ENABLED", "false")
    monkeypatch.delenv("FORGE_OT_CONTROL_CONFIG", raising=False)
    monkeypatch.delenv("FORGE_OT_TAGS_DIR", raising=False)


def test_ot_module_is_mounted_started_and_stopped(tmp_path, monkeypatch, no_grpc) -> None:
    monkeypatch.setenv("FORGE_OT_CONTROL_CONFIG", str(write_config(tmp_path)))
    monkeypatch.setenv("FORGE_OT_TAGS_DIR", str(write_tags(tmp_path)))
    app = create_app()
    host = app.state.ot_module
    assert host is not None and not host.started

    with TestClient(app) as client:
        assert host.started and host.tags_loaded == 2
        assert host.control_runtime is not None and host.control_runtime.started

        status = client.get("/api/v1/ot/control/status")
        assert status.status_code == 200, status.text
        body = status.json()
        assert body["started"] is True and body["mqtt"]["mode"] == "none"
        assert body["changeover"]["areas"]["cooker"]["cip_policy"] == "skip"
        assert body["engine"]["tag_configs"] == 1

        adapters = client.get("/v1/adapters").json()
        assert "forge-ot-module" in {a["adapter_id"] for a in adapters}
        info = client.get("/v1/info").json()
        assert info["ot_module"]["started"] is True and info["ot_module"]["tags_loaded"] == 2

        assert client.get("/api/v1/ot/changeover/cooker").json()["mes_state"] is None
        assert client.get("/api/v1/ot/namespaces").status_code == 200  # i3X browse mounted too
        assert client.get("/api/v1/ot/control/tags").json()[0]["tag_path"] == SP

    assert not host.started and host.adapter.state.value == "STOPPED"


def test_hub_without_config_has_no_ot_routes(no_grpc) -> None:
    app = create_app()
    assert app.state.ot_module is None
    with TestClient(app) as client:
        assert client.get("/api/v1/ot/control/status").status_code == 404
        assert client.get("/v1/info").json()["ot_module"] is None


def test_invalid_config_fails_startup(tmp_path, monkeypatch, no_grpc) -> None:
    path = tmp_path / "broken.json"
    path.write_text('{"changeover_areas": [{"area": "cooker"}]}', encoding="utf-8")
    monkeypatch.setenv("FORGE_OT_CONTROL_CONFIG", str(path))
    app = create_app()
    with pytest.raises(ConfigError), TestClient(app):
        pass


def test_hosted_module_with_unreachable_plc_is_fault_isolated(
    tmp_path, monkeypatch, no_grpc
) -> None:
    """A PLC that refuses connections leaves its provider FAILED; the hub still serves (FB-069)."""
    config = json.loads(write_config(tmp_path).read_text(encoding="utf-8"))
    config["connections"] = [
        {"name": "WHK01", "endpoint": "opc.tcp://127.0.0.1:1", "request_timeout_ms": 500}
    ]
    config["connection_poll_seconds"] = 0
    path = tmp_path / "ot-control-plc.json"
    path.write_text(json.dumps(config), encoding="utf-8")
    monkeypatch.setenv("FORGE_OT_CONTROL_CONFIG", str(path))
    monkeypatch.setenv("FORGE_OT_TAGS_DIR", str(write_tags(tmp_path)))
    app = create_app()
    host = app.state.ot_module

    with TestClient(app) as client:
        assert host.started
        runtime = host.control_runtime
        assert runtime is not None and runtime.connections is not None
        assert runtime.connections.engine is host.acquisition

        body = client.get("/api/v1/ot/control/connections").json()
        assert body["total"] == 1 and body["connected"] == 0
        conn = body["connections"]["WHK01"]
        assert conn["provider_state"] == "failed" and conn["last_error"]
        assert conn["next_retry_at"] is not None

        retry = client.post("/api/v1/ot/control/connections/WHK01/restart")
        assert retry.status_code == 200 and retry.json()["failures"] == 2
        assert client.get("/api/v1/ot/namespaces").status_code == 200
        # The Standard tag has a provider now, but no live link: the engine reports the failure.
        assert client.get("/api/v1/ot/control/status").json()["connections"]["total"] == 1

    assert not host.started
