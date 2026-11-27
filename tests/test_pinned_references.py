"""Nothing that builds or runs Forge is named by a reference that can move (FB-312, D-24 I-3).

A tag such as ``python:3.12-slim`` or ``actions/checkout@v7`` can point at new bytes overnight,
so the same commit could build a different image and nobody would review the change. Every
image is named by digest (the tag beside it is for people) and every Action by commit SHA
(the version beside it is for people); Dependabot moves both, one reviewed pull request at a
time. The runtime image installs nothing with apt, runs as an unprivileged user, and puts no
empty entry on Python's import path; nothing is mounted into a container from the host.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
DOCKERFILE = REPO / "deploy" / "docker" / "Dockerfile.forge"
COMPOSE = REPO / "deploy" / "docker" / "docker-compose.yml"
WORKFLOWS = sorted((REPO / ".github" / "workflows").glob("*.yml"))
DIGEST = re.compile(r"@sha256:[0-9a-f]{64}$")
#: Images that are no longer published anywhere, so they cannot be pinned, each behind an
#: opt-in Compose profile and with the backlog item that replaces it. This list only shrinks.
UNPUBLISHED: dict[str, str] = {}


def _dockerfile_images() -> list[str]:
    images = []
    for line in DOCKERFILE.read_text(encoding="utf-8").splitlines():
        if line.startswith("FROM "):
            images.append(line.split()[1])
        match = re.match(r"COPY --from=(\S+)", line)
        if match and ("/" in match.group(1) or ":" in match.group(1)):
            images.append(match.group(1))  # an image, not a build stage
    return images


def _compose_images() -> list[str]:
    return re.findall(r"^\s+image:\s*(\S+)\s*$", COMPOSE.read_text(encoding="utf-8"), re.M)


@pytest.mark.parametrize("image", _dockerfile_images())
def test_every_image_the_hub_is_built_from_is_named_by_digest(image: str) -> None:
    assert DIGEST.search(image), f"{image} can move: name it by digest (FB-312)"


@pytest.mark.parametrize("image", _compose_images())
def test_every_development_image_is_named_by_digest(image: str) -> None:
    if image in UNPUBLISHED:
        lines = COMPOSE.read_text(encoding="utf-8").splitlines()
        at = next(i for i, line in enumerate(lines) if line.strip() == f"image: {image}")
        start = max(i for i in range(at) if re.match(r"^  [a-z]", lines[i]))  # its service
        block = lines[start:at]
        assert any(line.strip().startswith("profiles:") for line in block), (
            f"{image} is unpublished and must be opt-in ({UNPUBLISHED[image]})"
        )
        return
    assert DIGEST.search(image), f"{image} can move: name it by digest (FB-312)"


def test_every_action_is_pinned_to_a_commit() -> None:
    floating = [
        f"{wf.name}: {line.strip()}"
        for wf in WORKFLOWS
        for line in wf.read_text(encoding="utf-8").splitlines()
        if re.match(r"\s*-?\s*uses:", line) and not re.search(r"@[0-9a-f]{40} # v\d", line)
    ]
    assert floating == [], "pin these to a commit SHA, with the version beside it:\n" + "\n".join(
        floating
    )


def test_the_runtime_image_installs_nothing_and_runs_unprivileged() -> None:
    text = DOCKERFILE.read_text(encoding="utf-8")
    runtime = text.split(" AS runtime", 1)[1]
    assert "apt-get" not in runtime, "the runtime image installs nothing with apt (FB-312)"
    users = re.findall(r"^USER\s+(\S+)", runtime, re.M)
    assert users and users[-1] not in ("0", "root"), (
        "the runtime image runs as an unprivileged user"
    )
    assert not re.search(r"^ENV .*\$PYTHONPATH", text, re.M), (
        "an empty PYTHONPATH entry puts the working folder on the path"
    )


def test_nothing_is_mounted_from_the_host_into_a_forge_container() -> None:
    mounts = re.findall(r"^\s+- \.\./\S+", COMPOSE.read_text(encoding="utf-8"), re.M)
    assert mounts == [], f"build these into the image instead: {mounts}"


def test_the_object_store_forge_init_writes_is_the_stacks() -> None:
    """``forge init`` writes its own copy of the stack (FB-320). Its object store is the same
    image by the same digest as the development stack's, so a pin moved in one place and not
    the other fails here (FB-314)."""
    from forge_hub.cli.main import OBJECT_STORE_IMAGE, _compose_template

    stack = COMPOSE.read_text(encoding="utf-8")
    assert "  object-store:\n" in stack
    assert f"    image: {OBJECT_STORE_IMAGE}\n" in stack
    assert DIGEST.search(OBJECT_STORE_IMAGE)
    assert f"    image: {OBJECT_STORE_IMAGE}\n" in _compose_template()
    assert "minio" not in stack.lower() and "minio" not in _compose_template().lower()


def test_the_checks_see_what_they_refuse() -> None:
    assert not DIGEST.search("python:3.12-slim")
    assert DIGEST.search("python:3.12-slim@sha256:" + "a" * 64)
    assert not re.search(r"@[0-9a-f]{40} # v\d", "uses: actions/checkout@v7")
