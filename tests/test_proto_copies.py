"""Every copy of the hub's proto files is the hub's (BACKLOG FB-174; D-15, T-2).

``forge-core/contract/proto`` is the contract between a hub and its modules. Two other trees keep
copies of it: the Go tree generates its bindings from ``go/proto``, and the interim MES
bridge loads its own copies at run time, together with a copy of the forge-mes manifest.
A copy that drifts is a module speaking a different contract without anyone being told,
so this runs in the Python suite, which runs on every push and blocks a merge. The
bridge's own parity test says the same, but it sits in a step that is advisory (FB-036).

A change to a proto file is therefore one change in three places.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
HUB = REPO / "forge-core" / "contract" / "proto"
GO = REPO / "go" / "proto" / "forge" / "v1"
BRIDGE = REPO / "modules" / "Forge MES" / "backend" / "src" / "forge"
BRIDGE_PROTO = BRIDGE / "proto" / "forge" / "v1"
HUB_MANIFEST = REPO / "src" / "forge" / "adapters" / "forge_mes" / "manifest.json"
BRIDGE_MANIFEST = BRIDGE / "forge-mes.manifest.json"

#: The one line a Go copy may differ in: where its generated code is imported from.
GO_PACKAGE = re.compile(r"^option go_package = \"[^\"]+\";$", re.MULTILINE)

PROTO_NAMES = sorted(path.name for path in HUB.glob("*.proto"))


def _without_go_package(text: str) -> str:
    return GO_PACKAGE.sub('option go_package = "<set per tree>";', text)


def test_the_hub_has_the_four_contract_files() -> None:
    assert PROTO_NAMES == [
        "adapter.proto",
        "adapter_service.proto",
        "contextual_record.proto",
        "enums.proto",
    ]


@pytest.mark.parametrize("copies", [GO, BRIDGE_PROTO], ids=["go", "mes-bridge"])
def test_a_tree_copies_every_contract_file_and_no_other(copies: Path) -> None:
    assert sorted(path.name for path in copies.glob("*.proto")) == PROTO_NAMES


@pytest.mark.parametrize("name", PROTO_NAMES)
def test_the_bridge_copy_is_identical(name: str) -> None:
    hub, copy = (HUB / name).read_bytes(), (BRIDGE_PROTO / name).read_bytes()
    assert copy == hub, (
        f"{BRIDGE_PROTO.relative_to(REPO) / name} differs from forge-core/contract/proto/{name}: "
        "copy the hub's file over it in the same change"
    )


@pytest.mark.parametrize("name", PROTO_NAMES)
def test_the_go_copy_differs_only_in_its_go_package(name: str) -> None:
    hub = (HUB / name).read_text(encoding="utf-8")
    copy = (GO / name).read_text(encoding="utf-8")
    assert len(GO_PACKAGE.findall(hub)) == len(GO_PACKAGE.findall(copy)) == 1, name
    assert _without_go_package(copy) == _without_go_package(hub), (
        f"go/proto/forge/v1/{name} differs from forge-core/contract/proto/{name} in more than its "
        "go_package line: copy the hub's file, keep the Go go_package, and regenerate go/gen"
    )


def test_the_bridge_manifest_copy_is_identical() -> None:
    assert BRIDGE_MANIFEST.read_bytes() == HUB_MANIFEST.read_bytes(), (
        "the interim MES bridge's copy of the forge-mes manifest differs from the hub's"
    )


def test_the_comparison_would_notice_a_change() -> None:
    """The normalisation hides the go_package line and nothing else."""
    text = (HUB / "enums.proto").read_text(encoding="utf-8")
    assert _without_go_package(text) != _without_go_package(text + "\n// drift\n")
    other = text.replace("forge/proto/v1", "forge/gen/forge/v1;forgev1")
    assert other != text and _without_go_package(other) == _without_go_package(text)
