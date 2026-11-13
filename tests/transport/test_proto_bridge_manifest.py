"""AdapterManifest on the wire: the FACTS ``time_governance`` declaration travels (FB-090)."""

from __future__ import annotations

from forge.core.models.adapter import (
    AdapterCapabilities,
    AdapterManifest,
    AdapterTier,
    ConnectionTimeGovernance,
    DataContract,
    TimeGovernance,
)
from forge.transport.proto_bridge import manifest_to_proto, proto_to_manifest
from forge.transport.serialization import proto_to_pydantic, pydantic_to_proto

GOVERNANCE = TimeGovernance(
    time_source="site-ptp",
    sync_protocol="ptp-802.1as",
    clock_read_method="opcua-current-time",
    clock_probe_interval_seconds=10,
    source_timestamp_origin="server",
    tolerance_class="T0",
    connections=[
        ConnectionTimeGovernance(
            name="WHK01",
            clock_read_method="opcua-response-header",
            source_timestamp_origin="device",
            tolerance_class="T1",
            clock_probe_interval_seconds=5,
        ),
        ConnectionTimeGovernance(name="WHK02"),
    ],
)


def _manifest(governance: TimeGovernance | None) -> AdapterManifest:
    return AdapterManifest(
        adapter_id="ot-module",
        name="OT module",
        version="0.1.0",
        protocol="opcua",
        tier=AdapterTier.OT,
        capabilities=AdapterCapabilities(read=True),
        data_contract=DataContract(schema_ref="forge://schemas/ot-module/v0.1.0"),
        time_governance=governance,
    )


def test_time_governance_round_trips_through_the_proto_message() -> None:
    msg = manifest_to_proto(_manifest(GOVERNANCE))
    assert msg.HasField("time_governance") and msg.time_governance.fail_closed is True
    assert msg.time_governance.connections[0].clock_probe_interval_seconds == 5
    assert not msg.time_governance.connections[1].HasField("clock_probe_interval_seconds")
    assert proto_to_manifest(msg).time_governance == GOVERNANCE


def test_a_manifest_without_the_declaration_stays_without_it() -> None:
    msg = manifest_to_proto(_manifest(None))
    assert not msg.HasField("time_governance")
    assert proto_to_manifest(msg).time_governance is None


def test_time_governance_round_trips_through_the_dict_form() -> None:
    proto_dict = pydantic_to_proto(_manifest(GOVERNANCE))
    assert proto_dict["time_governance"]["connections"][1] == {"name": "WHK02"}
    assert proto_to_pydantic(proto_dict, "AdapterManifest").time_governance == GOVERNANCE
    bare = pydantic_to_proto(_manifest(None))
    assert "time_governance" not in bare
    assert proto_to_pydantic(bare, "AdapterManifest").time_governance is None
