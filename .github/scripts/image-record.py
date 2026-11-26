"""Write the hub image's build record (FB-231; the input of D-24's release manifest, FB-305).

    image-record.py <buildx metadata.json> <platform> <out.json>

The record names what came out (the image's digest, as a registry would serve it, and the
export's descriptor) and what went in (the commit, the lock's SHA-256, and BuildKit's own
provenance, which names every base image by the digest actually pulled). It fails, by name,
when the build left no digest: a record without one cannot be put in a manifest.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

FORM = "forge-image-record/1"


def main(metadata_path: str, platform: str, out: str) -> int:
    metadata = json.loads(Path(metadata_path).read_text(encoding="utf-8"))
    digest = metadata.get("containerimage.digest")
    if not isinstance(digest, str) or not digest.startswith("sha256:"):
        print(f"the build left no image digest in {metadata_path}", file=sys.stderr)
        return 1
    commit = (
        os.environ.get("GITHUB_SHA")
        or subprocess.run(
            ["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True
        ).stdout.strip()
    )
    record = {
        "form": FORM,
        "image": "forge-hub",
        "platform": platform,
        "digest": digest,
        "descriptor": metadata.get("containerimage.descriptor"),
        "commit": commit,
        "uv_lock_sha256": hashlib.sha256(Path("uv.lock").read_bytes()).hexdigest(),
        "built_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "provenance": metadata.get("buildx.build.provenance"),
    }
    Path(out).write_text(json.dumps(record, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    provenance = record["provenance"] if isinstance(record["provenance"], dict) else {}
    materials = provenance.get("materials") or provenance.get("buildDefinition", {}).get(
        "resolvedDependencies", []
    )
    bases = sorted(
        f"{m.get('uri', '')} sha256:{(m.get('digest') or {}).get('sha256', '?')}"
        for m in materials
        if isinstance(m, dict) and m.get("uri")
    )
    print(f"forge-hub {platform}: {digest}")
    for base in bases:
        print(f"  built from {base}")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as fh:
            fh.write(f"**forge-hub {platform}**: `{digest}` (commit `{commit[:8]}`)\n")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    sys.exit(main(*sys.argv[1:]))
