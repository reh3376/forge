#!/usr/bin/env python3
"""Drift gate for the tutorial build (tutorial-forge FSD §11.1).

At build time tutorial-forge (``scripts/tutorial-forge/``) writes
``<output>/SOURCE_SHA256.txt`` with the sha256 of each source input: the deck
markdown, the CSS override and the SVG viewer (framework defaults when the
config names no override). This script reads ``tutorial.config.json``,
recomputes those hashes against the current sources and compares.

- match: no drift (exit 0)
- mismatch: drift (exit 1, naming the file)
- breadcrumb missing: the tutorial was never built (exit 1)

Forge keeps the build output out of git (``build/tutorial-static/`` is
gitignored), so this gate runs against a fresh build, locally after
``make sync-tutorial-embed`` and in CI after the build step. Pure stdlib.
Reference implementation: ``scripts/verify_tutorial_embed.py`` in the mdemg
repository.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
CONFIG_PATH = REPO_ROOT / "tutorial.config.json"
FRAMEWORK_DIR = REPO_ROOT / "scripts" / "tutorial-forge"
BREADCRUMB_KEYS = ("deck_sha256", "css_sha256", "svg_viewer_sha256")


def sha256_of(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_breadcrumb(path: pathlib.Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        out[key.strip()] = value.strip()
    return out


def resolve_source(
    config_dir: pathlib.Path, config_value: str | None, framework_default: pathlib.Path
) -> pathlib.Path:
    """A config path is relative to the config file's directory; absent: the framework default."""
    if not config_value:
        return framework_default
    return (config_dir / config_value).resolve()


def display(path: pathlib.Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def main() -> int:
    if not CONFIG_PATH.exists():
        print(f"ERROR: tutorial config missing: {display(CONFIG_PATH)}")
        return 1

    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    config_dir = CONFIG_PATH.parent
    output_dir = (config_dir / config["output"]).resolve()
    breadcrumb_path = output_dir / "SOURCE_SHA256.txt"

    if not breadcrumb_path.exists():
        print(f"ERROR: breadcrumb missing: {display(breadcrumb_path)}")
        print("The tutorial was never built here. Run: make sync-tutorial-embed")
        return 1

    sources = {
        "deck_sha256": ("deck source", (config_dir / config["deck"]).resolve()),
        "css_sha256": (
            "CSS source",
            resolve_source(
                config_dir, config.get("cssPath"), FRAMEWORK_DIR / "templates" / "default.css"
            ),
        ),
        "svg_viewer_sha256": (
            "SVG viewer",
            resolve_source(
                config_dir,
                config.get("svgViewerPath"),
                FRAMEWORK_DIR / "templates" / "svg-viewer.js",
            ),
        ),
    }
    for label, path in sources.values():
        if not path.exists():
            print(f"ERROR: {label} missing: {display(path)}")
            return 1

    breadcrumb = parse_breadcrumb(breadcrumb_path)
    if any(not breadcrumb.get(key) for key in BREADCRUMB_KEYS):
        print(f"ERROR: breadcrumb malformed: expected {', '.join(BREADCRUMB_KEYS)}")
        print("Re-run: make sync-tutorial-embed")
        return 1

    drifted = False
    for key, (_label, path) in sources.items():
        expected, actual = breadcrumb[key], sha256_of(path)
        if expected != actual:
            drifted = True
            print(f"DRIFT: {display(path)}")
            print(f"  built against:  {expected}")
            print(f"  current source: {actual}")

    if drifted:
        print()
        print("A tutorial source changed after the last build. Run: make sync-tutorial-embed")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
