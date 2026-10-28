#!/usr/bin/env python3
"""Check a tutorial-forge build against the FSD's verification contracts.

The contracts are ``scripts/tutorial-forge/FSD.md`` §8 (file-count, HTML shape
and acronym-expansion invariants) and §15.6 (the persistent TOC sidebar), plus
one Forge addition from §7.1's warning: every ``](#fragment)`` link in the deck
must resolve to an ``id`` in the rendered page, so the table of contents and the
landing fork never point at nothing. Pure stdlib; runs locally
(``make check-tutorial-build``) and in CI after the build.
"""

from __future__ import annotations

import json
import pathlib
import re
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
CONFIG_PATH = REPO_ROOT / "tutorial.config.json"
FRAMEWORK_DIR = REPO_ROOT / "scripts" / "tutorial-forge"
HEX64 = re.compile(r"^[0-9a-f]{64}$")


def merged_acronyms(config: dict) -> dict[str, str]:
    defaults = json.loads(
        (FRAMEWORK_DIR / "defaults" / "acronyms.json").read_text(encoding="utf-8")
    )
    merged = {k: v for k, v in defaults.items() if not k.startswith("_")}
    acronyms = config.get("acronyms") or {}
    merged.update(acronyms.get("extra") or {})
    for key in acronyms.get("disabled") or []:
        merged.pop(key, None)
    return merged


def main() -> int:
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    config_dir = CONFIG_PATH.parent
    out = (config_dir / config["output"]).resolve()
    deck_path = (config_dir / config["deck"]).resolve()
    failures: list[str] = []

    def check(condition: bool, message: str) -> None:
        if not condition:
            failures.append(message)

    index = out / "index.html"
    if not index.exists():
        print(f"FAIL: {index} missing; run: make sync-tutorial-embed")
        return 1
    html = index.read_text(encoding="utf-8")
    deck = deck_path.read_text(encoding="utf-8")

    # §8.1 file-count invariants
    breadcrumb = out / "SOURCE_SHA256.txt"
    check(breadcrumb.exists(), "SOURCE_SHA256.txt missing")
    if breadcrumb.exists():
        crumbs = dict(
            line.split("=", 1)
            for line in breadcrumb.read_text(encoding="utf-8").splitlines()
            if "=" in line and not line.startswith("#")
        )
        for key in ("deck_sha256", "css_sha256", "svg_viewer_sha256"):
            check(
                bool(HEX64.match(crumbs.get(key, "").strip())),
                f"breadcrumb {key} is not 64 hex chars",
            )
    for rel in (
        "assets/css/slides-overrides.css",
        "assets/css/zenburn.min.css",
        "assets/js/svg-viewer.js",
    ):
        check((out / rel).exists(), f"{rel} missing")
    mermaid_blocks = len(re.findall(r"^```mermaid[ \t]*$", deck, re.M))
    for n in range(1, mermaid_blocks + 1):
        check(
            (out / "assets" / "svg" / f"mermaid-{n:02d}.svg").exists(),
            f"assets/svg/mermaid-{n:02d}.svg missing",
        )

    # §8.2 HTML shape invariants
    check('<main class="deck">' in html, '<main class="deck"> missing')
    check(
        "mermaid.min.js" not in html, "the mermaid runtime is shipped (mermaid.min.js referenced)"
    )
    check('<div class="reveal">' not in html, "reveal.js markup present")
    svg_figures = len(re.findall(r'class="svg-figure"', html))
    mermaid_images = len(re.findall(r"<img[^>]+mermaid-\d+\.svg", html))
    hand_authored = len(re.findall(r'<figure class="svg-figure"', deck))
    check(
        svg_figures == mermaid_images + hand_authored,
        f"{svg_figures} figures != {mermaid_images} mermaid + {hand_authored} hand-authored",
    )
    check(
        mermaid_images == mermaid_blocks,
        f"{mermaid_images} mermaid images for {mermaid_blocks} mermaid blocks",
    )
    heading_ids = re.findall(r"<h[1-6][^>]*\sid=\"([^\"]+)\"", html)
    check(len(heading_ids) >= 1, "no heading carries an id")
    check(len(heading_ids) == len(set(heading_ids)), "duplicate heading ids")

    # §15.6 TOC invariants
    check('<body class="has-toc">' in html, '<body class="has-toc"> missing')
    check(re.search(r'<nav class="deck-toc"', html) is not None, "deck-toc nav missing")
    check(
        re.search(r'<div class="deck-toc-head">\w+</div>', html) is not None,
        "deck-toc-head missing",
    )
    check("IntersectionObserver" in html, "scroll-sync IIFE missing")
    check(re.search(r'class="deck-toc-l\d"', html) is not None, "no TOC section entry")
    graph_entries = len(re.findall(r'class="deck-toc-graph"', html))
    if svg_figures:
        check(graph_entries >= 1, "figures present but no Graphs entry in the TOC")
    check(svg_figures >= graph_entries, f"{graph_entries} graph entries for {svg_figures} figures")

    # §8.4 acronym-expansion invariant
    expand_count = (config.get("acronyms") or {}).get("expandCount", 2)
    for acronym, expansion in merged_acronyms(config).items():
        seen = html.count(f"{expansion} ({acronym})")
        check(seen <= expand_count, f"{acronym}: expanded {seen} times, budget {expand_count}")

    # Forge addition (§7.1): every fragment link in the deck resolves to an id in the page
    all_ids = set(re.findall(r'\sid="([^"]+)"', html))
    for fragment in sorted(set(re.findall(r"\]\(#([A-Za-z0-9_-]+)\)", deck))):
        check(fragment in all_ids, f"fragment link #{fragment} has no target id in index.html")

    if failures:
        print("tutorial build check FAILED:")
        for message in failures:
            print(f"  - {message}")
        return 1
    print(
        f"tutorial build OK: {mermaid_blocks} diagrams, {len(heading_ids)} headings, "
        f"{graph_entries} graph entries, {len(all_ids)} ids"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
