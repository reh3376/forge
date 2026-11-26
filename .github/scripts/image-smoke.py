"""Prove the hub image works, from inside it (FB-231).

Run in the built image, as its own user: every package root the manifest names imports, the
`forge` command answers, the hub's app module loads, and the init container's entrypoint can
be read (FB-315: a folder mode once left it out of the unprivileged user's reach). A package
root the image forgot (FB-230: the move of forge-core added one and the Dockerfile still copied
the old folder) fails here by name.

    docker run --rm -v "$PWD/.github/scripts/image-smoke.py:/smoke.py:ro" <image> python /smoke.py
"""

from __future__ import annotations

import importlib
import subprocess
import sys
import tomllib
from pathlib import Path

PYPROJECT = Path("/app/pyproject.toml")
INIT_ENTRYPOINT = Path("/app/deploy/docker/init-entrypoint.sh")


def main() -> int:
    packages = tomllib.loads(PYPROJECT.read_text(encoding="utf-8"))["tool"]["hatch"]["build"][
        "targets"
    ]["wheel"]["packages"]
    failed = []
    for path in packages:
        name = path.rsplit("/", 1)[-1]
        try:
            module = importlib.import_module(name)
        except Exception as exc:
            failed.append(f"{name}: {type(exc).__name__}: {exc}")
            continue
        # An empty or half-copied folder still imports, as an empty namespace package: the
        # package must be the real one, with its own __init__.py (found by breaking this check).
        if getattr(module, "__file__", None) is None:
            failed.append(f"{name}: imports only as an empty namespace, its files are missing")
            continue
        print(f"imports: {name}")
    try:
        importlib.import_module("forge_hub.api.main")
        print("loads: forge_hub.api.main")
    except Exception as exc:
        failed.append(f"forge_hub.api.main: {type(exc).__name__}: {exc}")
    try:
        INIT_ENTRYPOINT.read_text(encoding="utf-8")
        print(f"reads: {INIT_ENTRYPOINT}")
    except OSError as exc:
        failed.append(f"{INIT_ENTRYPOINT}: {type(exc).__name__}: {exc}")
    done = subprocess.run(["forge", "--help"], capture_output=True, text=True, check=False)
    if done.returncode != 0:
        failed.append(f"forge --help exited {done.returncode}: {done.stderr.strip()[:300]}")
    else:
        print("runs: forge --help")
    if failed:
        print("the image does not work:", *failed, sep="\n  ", file=sys.stderr)
        return 1
    print(
        f"the image works: {len(packages)} package roots, the hub app, the init entrypoint, "
        "the forge command"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
