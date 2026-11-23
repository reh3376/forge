"""Move the hub's documents into forge-hub/docs (D-17 §10.5, BACKLOG FB-200 step 4).

Run once, from the repository root, on a clean tree:
    python scripts/restructure/move_forge_hub_docs.py

It is the method of ``move_forge_core_docs.py`` with the hub's two documents: each moves
with ``git mv``, every Markdown link in the repository is recomputed against where its
file and its target are now, and plain mentions of the old paths are rewritten. Signed
decision records and the archive are not touched (D-17 §7).
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
MOVES = {
    "docs/DB_ORCHESTRATION_FRAMEWORK.md": "forge-hub/docs/database-orchestration-framework.md",
    "docs/deployment/clock-discipline.md": "forge-hub/docs/clock-discipline.md",
}


def main() -> None:
    spec = importlib.util.spec_from_file_location("core_docs", HERE / "move_forge_core_docs.py")
    assert spec is not None and spec.loader is not None
    mover = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mover)
    mover.MOVES = MOVES
    mover.main()


if __name__ == "__main__":
    main()
