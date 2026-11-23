"""The container image carries every package the project is made of (BACKLOG FB-230).

The manifest lists the package roots (``[tool.hatch.build.targets.wheel] packages``). The
image is built by copying source folders by name, so a package root added to the manifest
and not to the image builds an image that cannot import it. That happened when forge-core
became its own package (FB-199); CI does not build the image, so nothing failed. This test
holds the two lists together.
"""

from __future__ import annotations

import re
import tomllib
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DOCKERFILE = (REPO / "deploy" / "docker" / "Dockerfile.forge").read_text(encoding="utf-8")
DOCKERIGNORE = (REPO / ".dockerignore").read_text(encoding="utf-8").split("\n")


def package_roots() -> list[str]:
    manifest = tomllib.loads((REPO / "pyproject.toml").read_text(encoding="utf-8"))
    return list(manifest["tool"]["hatch"]["build"]["targets"]["wheel"]["packages"])


def import_root(package: str) -> str:
    """The folder that must be on the import path for the package: its parent."""
    return str(Path(package).parent)


def copied_into_builder() -> list[str]:
    return re.findall(r"^COPY (?!--from)(\S+?)/? \./", DOCKERFILE, re.MULTILINE)


def copied_into_runtime() -> list[str]:
    return re.findall(r"^COPY --from=builder /app/(\S+) /app/", DOCKERFILE, re.MULTILINE)


def python_path() -> list[str]:
    match = re.search(r'^ENV PYTHONPATH="([^"]+)"', DOCKERFILE, re.MULTILINE)
    assert match, "the image sets no PYTHONPATH"
    return [part.removeprefix("/app/") for part in match.group(1).split(":")]


def covered(path: str, copied: list[str]) -> bool:
    return any(path == folder or path.startswith(folder + "/") for folder in copied)


def test_the_manifest_lists_the_three_packages() -> None:
    assert package_roots() == [
        "src/forge",
        "forge-core/src/python/forge_core",
        "forge-hub/src/python/forge_hub",
    ]


def test_every_package_is_copied_into_both_stages() -> None:
    for package in package_roots():
        assert covered(package, copied_into_builder()), f"the builder stage does not copy {package}"
        assert covered(package, copied_into_runtime()), f"the runtime stage does not copy {package}"


def test_every_package_is_on_the_import_path() -> None:
    for package in package_roots():
        assert import_root(package) in python_path(), (
            f"{import_root(package)} is not on the image's PYTHONPATH: {package} cannot be imported"
        )


def test_the_build_context_lets_every_package_in() -> None:
    """``.dockerignore`` excludes everything and names what the build may copy."""
    allowed = [line[1:].rstrip("/") for line in DOCKERIGNORE if line.startswith("!")]
    for package in package_roots():
        assert any(package == entry or package.startswith(entry + "/") for entry in allowed), (
            f".dockerignore keeps {package} out of the build context"
        )


def test_the_contract_is_in_the_image_and_in_a_built_package() -> None:
    """The contract lives outside the Python package (FB-227), so it is copied and included
    by name: without it the image has the code and none of the schemas, lists or protos."""
    contract = "forge-core/contract"
    assert (REPO / contract / "proto" / "adapter_service.proto").is_file()
    assert covered(contract, copied_into_builder()), "the builder stage does not copy the contract"
    assert covered(contract, copied_into_runtime()), "the runtime stage does not copy the contract"
    allowed = [line[1:].rstrip("/") for line in DOCKERIGNORE if line.startswith("!")]
    assert contract in allowed, ".dockerignore keeps the contract out of the build context"
    manifest = tomllib.loads((REPO / "pyproject.toml").read_text(encoding="utf-8"))
    included = manifest["tool"]["hatch"]["build"]["targets"]["wheel"]["force-include"]
    assert included[contract] == "forge_core/_contract"


def test_the_check_can_fail() -> None:
    assert not covered("forge-hub/src/forge_hub", ["src", "forge-core/src"])
    assert covered("forge-core/src/python/forge_core", ["src", "forge-core/src"])
    assert import_root("forge-core/src/python/forge_core") == "forge-core/src/python"


def test_the_hubs_governed_files_are_in_the_image_and_in_a_built_package() -> None:
    """The hub's own specs live outside its Python package (FB-200), like the contract."""
    folder = "forge-hub/fxts"
    assert (REPO / folder / "fats" / "healthz.json").is_file()
    assert covered(folder, copied_into_builder()), "the builder stage does not copy the hub's fxts"
    assert covered(folder, copied_into_runtime()), "the runtime stage does not copy the hub's fxts"
    allowed = [line[1:].rstrip("/") for line in DOCKERIGNORE if line.startswith("!")]
    assert folder in allowed, ".dockerignore keeps the hub's fxts out of the build context"
    manifest = tomllib.loads((REPO / "pyproject.toml").read_text(encoding="utf-8"))
    included = manifest["tool"]["hatch"]["build"]["targets"]["wheel"]["force-include"]
    assert included == {"forge-core/contract": "forge_core/_contract", folder: "forge_hub/_fxts"}
