"""OTControlConfig: one JSON document for the control runtime (FB-065)."""

from __future__ import annotations

import json
from typing import Any

import pytest

from forge.modules.ot.control import (
    CipPolicy,
    ConfigError,
    DataType,
    InterlockCondition,
    OTControlConfig,
    WriteRole,
    load_control_config,
    parse_control_config,
)

SP = "WH/WHK01/Cooker01/TIT_2010/SP"
RR = "WH/WHK01/Cooker01/TIT_2010/RampRate"
CIP_START = "WH/WHK01/Cooker01/CIP/Start"
CIP_STATE = "WH/WHK01/Cooker01/CIP/State"


def document(**overrides: Any) -> dict[str, Any]:
    doc: dict[str, Any] = {
        "site": "whk01",
        "mqtt": {"mode": "none"},
        "write_tags": [
            {
                "tag_path": SP,
                "data_type": "FLOAT",
                "min_value": 0,
                "max_value": 212,
                "engineering_units": "degF",
            },
            {"tag_path": RR, "data_type": "FLOAT", "min_value": 0, "max_value": 10},
            {"tag_path": CIP_START, "data_type": "BOOLEAN"},
        ],
        "interlocks": [
            {
                "rule_id": "IL-1",
                "name": "No setpoint change while CIP runs",
                "target_tag_pattern": "WH/WHK01/Cooker01/TIT_2010/*",
                "check_tag": CIP_STATE,
                "condition": "EQUALS",
                "check_value": "Running",
            }
        ],
        "permissions": [
            {
                "permission_id": "eng",
                "area_pattern": "*",
                "tag_pattern": "*",
                "min_role": "ENGINEER",
            }
        ],
        "recipes": [
            {
                "equipment_id": "Cooker01",
                "area": "cooker",
                "mappings": [
                    {"parameter_name": "target_temp", "tag_path": SP, "engineering_units": "degF"},
                    {"parameter_name": "ramp_rate", "tag_path": RR},
                ],
            }
        ],
        "changeover_areas": [
            {
                "area": "cooker",
                "equipment_id": "Cooker01",
                "cooker_number": "1",
                "cip_policy": "runner",
                "cip": {
                    "start_tag": CIP_START,
                    "state_tag": CIP_STATE,
                    "poll_interval_seconds": 1,
                    "start_timeout_seconds": 10,
                    "timeout_seconds": 100,
                },
            }
        ],
    }
    doc.update(overrides)
    return doc


def test_parses_into_control_objects() -> None:
    cfg = parse_control_config(document())
    assert [t.tag_path for t in cfg.write_tags] == [SP, RR, CIP_START]
    assert cfg.write_tags[0].data_type is DataType.FLOAT
    assert cfg.write_tags[0].max_value == 212
    assert cfg.interlocks[0].condition is InterlockCondition.EQUALS
    assert cfg.interlocks[0].bypass_min_role is WriteRole.ADMIN
    assert cfg.permissions[0].min_role is WriteRole.ENGINEER
    recipe = cfg.recipes[0]
    assert recipe.get_mapping("ramp_rate").tag_path == RR
    assert recipe.default_role is WriteRole.ENGINEER
    area = cfg.changeover_areas[0]
    assert area.cip_policy is CipPolicy.RUNNER
    assert area.cip.start_data_type is DataType.BOOLEAN
    assert cfg.area_configs()[0].cooker_number == "1"
    assert list(cfg.cip_specs()) == ["cooker"]
    assert cfg.topic("cooker", "equipment", "cipState") == "whk/whk01/cooker/equipment/cipState"
    described = cfg.describe()
    assert described["recipes"] == {"Cooker01": 2}
    assert described["changeover_areas"]["cooker"]["cip_policy"] == "runner"
    assert parse_control_config(cfg) is cfg


def test_defaults_are_minimal() -> None:
    cfg = parse_control_config({})
    assert cfg.mqtt.mode == "local" and cfg.mqtt.port == 1883
    assert cfg.requested_by == "forge-ot-module"
    assert cfg.changeover_areas == [] and cfg.cip_specs() == {}


@pytest.mark.parametrize(
    ("overrides", "needle"),
    [
        ({"write_tags": [{"tag_path": SP, "data_typo": "FLOAT"}]}, "unknown key"),
        ({"nope": 1}, "nope"),
        (
            {
                "recipes": [
                    {
                        "equipment_id": "Cooker01",
                        "mappings": [{"parameter_name": "x", "tag_path": "NOPE"}],
                    }
                ]
            },
            "not in write_tags",
        ),
        (
            {
                "changeover_areas": [
                    {
                        "area": "cooker",
                        "equipment_id": "Cooker01",
                        "cooker_number": "1",
                        "cip_policy": "runner",
                    }
                ]
            },
            "needs a 'cip' block",
        ),
        (
            {
                "changeover_areas": [
                    {"area": "stillhouse", "equipment_id": "Cooker01", "cooker_number": "1"}
                ]
            },
            "unknown changeover area",
        ),
        (
            {
                "changeover_areas": [
                    {"area": "cooker", "equipment_id": "Ghost", "cooker_number": "1"}
                ]
            },
            "no recipes entry",
        ),
        (
            {
                "write_tags": [
                    {"tag_path": SP, "data_type": "FLOAT"},
                    {"tag_path": SP, "data_type": "FLOAT"},
                    {"tag_path": RR},
                    {"tag_path": CIP_START, "data_type": "BOOLEAN"},
                ]
            },
            "duplicate write_tags.tag_path",
        ),
        ({"mqtt": {"mode": "carrier-pigeon"}}, "mode"),
        (
            {"write_tags": [{"tag_path": SP, "data_type": "FLOAT"}, {"tag_path": RR}]},
            "cip.start_tag",
        ),
    ],
)
def test_rejects_inconsistent_documents(overrides: dict[str, Any], needle: str) -> None:
    with pytest.raises(ConfigError, match=needle):
        parse_control_config(document(**overrides))


def test_mapping_typos_are_rejected() -> None:
    doc = document()
    doc["recipes"][0]["mappings"][0]["tagpath"] = SP
    with pytest.raises(ConfigError, match=r"recipes\[0\].mappings\[0\]: unknown key"):
        parse_control_config(doc)


def test_load_from_file(tmp_path) -> None:
    path = tmp_path / "ot-control.json"
    path.write_text(json.dumps(document()), encoding="utf-8")
    cfg = load_control_config(path)
    assert isinstance(cfg, OTControlConfig)
    assert cfg.changeover_areas[0].equipment_id == "Cooker01"

    with pytest.raises(ConfigError, match="not found"):
        load_control_config(tmp_path / "missing.json")
    path.write_text("{not json", encoding="utf-8")
    with pytest.raises(ConfigError, match="invalid JSON"):
        load_control_config(path)
    path.write_text("[]", encoding="utf-8")
    with pytest.raises(ConfigError, match="JSON object"):
        load_control_config(path)
    path.write_text(json.dumps(document(site=1)), encoding="utf-8")
    with pytest.raises(ConfigError, match=str(path)):
        load_control_config(path)


def test_connections_parse_and_cross_check() -> None:
    cfg = parse_control_config(
        document(
            site_prefix="WH",
            connections=[
                {"name": "WHK01", "endpoint": "opc.tcp://10.4.2.10:4840", "namespace_index": 2},
                {
                    "name": "WHK02",
                    "endpoint": "opc.tcp://10.4.2.11:4840",
                    "security_policy": "Basic256Sha256",
                    "certificate_path": "/etc/forge/client.pem",
                    "private_key_path": "/etc/forge/client.key",
                    "reconnect_interval_ms": 500,
                    "enabled": False,
                },
            ],
            connection_poll_seconds=2,
        )
    )
    assert [c.name for c in cfg.connections] == ["WHK01", "WHK02"]
    assert cfg.connections[1].security_policy == "Basic256Sha256" and not cfg.connections[1].enabled
    assert cfg.connection_poll_seconds == 2 and cfg.site_prefix == "WH"
    assert cfg.describe()["connections"] == {"WHK01": "opc.tcp://10.4.2.10:4840"}

    with pytest.raises(ConfigError, match=r"duplicate connections\.name"):
        parse_control_config(
            document(
                connections=[
                    {"name": "WHK01", "endpoint": "opc.tcp://a:4840"},
                    {"name": "WHK01", "endpoint": "opc.tcp://b:4840"},
                ]
            )
        )
    with pytest.raises(ConfigError, match=r"opc\.tcp"):
        parse_control_config(document(connections=[{"name": "WHK01", "endpoint": "tcp://a:4840"}]))
    with pytest.raises(ConfigError, match="certificate_path"):
        parse_control_config(
            document(
                connections=[
                    {
                        "name": "WHK01",
                        "endpoint": "opc.tcp://a:4840",
                        "security_policy": "Basic256Sha256",
                    }
                ]
            )
        )
    with pytest.raises(ConfigError, match="connection_poll_seconds"):
        parse_control_config(document(connection_poll_seconds=-1))
