"""forge-core's contract is found in a checkout and in a built package (BACKLOG FB-227)."""

from __future__ import annotations

import importlib.util
from pathlib import Path

from forge_core import contract

REPO = Path(__file__).resolve().parents[2]


def test_in_a_checkout_the_contract_is_forge_cores_folder() -> None:
    assert contract.CONTRACT_ROOT == REPO / "forge-core" / "contract"
    assert contract.PROTO_DIR.is_dir() and contract.LISTS_DIR.is_dir()


def test_it_holds_the_four_proto_files_the_lists_and_every_schema() -> None:
    assert sorted(p.name for p in contract.PROTO_DIR.glob("*.proto")) == [
        "adapter.proto",
        "adapter_service.proto",
        "contextual_record.proto",
        "enums.proto",
    ]
    assert len(list(contract.LISTS_DIR.glob("*.list.json"))) == 5
    for framework in ("facts", "fats", "fmts", "ftts", "futs", "fvts"):
        assert contract.schema_path(framework).is_file(), framework
        assert (contract.schema_dir(framework) / "schema-registry.json").is_file(), framework


def test_no_python_lives_in_the_contract() -> None:
    assert not list(contract.CONTRACT_ROOT.rglob("*.py"))


def test_a_built_package_carries_its_own_copy(tmp_path: Path) -> None:
    """Where ``forge_core/_contract`` exists, as in an installed package, it is the contract."""
    package = tmp_path / "forge_core"
    (package / "_contract" / "proto").mkdir(parents=True)
    (package / "contract.py").write_text(
        Path(contract.__file__).read_text(encoding="utf-8"), encoding="utf-8"
    )
    spec = importlib.util.spec_from_file_location("built_contract", package / "contract.py")
    assert spec is not None and spec.loader is not None
    built = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(built)
    assert package / "_contract" == built.CONTRACT_ROOT
    assert built.schema_path("FMTS") == package / "_contract/fxts/fmts/schema/fmts.schema.json"
