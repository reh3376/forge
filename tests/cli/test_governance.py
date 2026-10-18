"""``forge governance specs | stamp | approve`` (FB-021) and ``run`` (FB-083)."""

from __future__ import annotations

import json
import re
import shutil
from typing import TYPE_CHECKING

import pytest
from typer.testing import CliRunner

from forge.cli import governance
from forge.cli.main import app
from forge.governance.shared.runner import verify_spec_hash

if TYPE_CHECKING:
    from pathlib import Path

runner = CliRunner()

SPECS = governance.SPEC_ROOT
FACTS_OT = SPECS / "facts" / "specs" / "ot-module.facts.json"  # non-ASCII, hand-wrapped
FACTS_NMS = SPECS / "facts" / "specs" / "whk-nms.facts.json"  # ASCII-escaped
FACTS_WMS = SPECS / "facts" / "specs" / "whk-wms.facts.json"  # approved
FVTS_OT = SPECS / "fvts" / "specs" / "ot-module.fvts.json"
STAMP_RE = re.compile(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")


def strip_integrity(text: str) -> str:
    """Everything in the file except the integrity block (what a write must not touch)."""
    marker = governance._INTEGRITY_MARKER
    start = text.index(marker) + len(marker)
    _, end = json.JSONDecoder().raw_decode(text, start)
    return text[:start] + text[end:]


@pytest.fixture
def root(tmp_path: Path) -> Path:
    """A governance root with copies of real specs."""
    for src in (FACTS_OT, FACTS_NMS, FACTS_WMS, FVTS_OT):
        dest = tmp_path / src.parent.parent.name / "specs" / src.name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(src, dest)
    return tmp_path


def run(*args: str) -> tuple[int, str]:
    result = runner.invoke(app, ["governance", *args])
    return result.exit_code, result.output


# -- specs ------------------------------------------------------------------


def test_specs_lists_state_approver_and_verification(root: Path) -> None:
    code, out = run("specs", "--root", str(root))
    assert code == 0, out
    assert "whk-wms.facts.json" in out and "approved" in out and "reh3376" in out
    assert "ot-module.fvts.json" in out and "pending_review" in out
    assert "4 spec(s): 3 awaiting approval, 0 with a hash mismatch." in out

    code, out = run("specs", "--root", str(root), "--pending")
    assert code == 0 and "whk-wms.facts.json" not in out and "3 spec(s)" in out

    code, out = run("specs", "--root", str(root / "nowhere"))
    assert code == 0 and "No specs" in out


def test_specs_flags_a_hash_mismatch(root: Path) -> None:
    path = root / "facts" / "specs" / "whk-nms.facts.json"
    spec = json.loads(path.read_text())
    spec["adapter_identity"]["name"] += " (edited)"
    path.write_text(json.dumps(spec, indent=2) + "\n")
    code, out = run("specs", "--root", str(root))
    assert code == 0 and "1 with a hash mismatch" in out
    assert re.search(r"whk-nms\.facts\.json\s+pending_review\s+\S+\s+NO", out)


# -- approve ----------------------------------------------------------------


def test_approve_records_the_owner_and_touches_only_the_integrity_block(root: Path) -> None:
    path = root / "facts" / "specs" / "ot-module.facts.json"
    before = path.read_text(encoding="utf-8")
    code, out = run("approve", str(path), "--by", "reh3376")
    assert code == 0, out
    assert "approved by reh3376" in out

    after = path.read_text(encoding="utf-8")
    assert strip_integrity(after) == strip_integrity(before)
    assert "—" in after  # the file's own (non-ASCII) escaping style is kept
    spec = json.loads(after)
    integrity = spec["integrity"]
    assert integrity["hash_state"] == "approved" and integrity["approved_by"] == "reh3376"
    assert STAMP_RE.match(integrity["approved_at"])
    assert verify_spec_hash(spec) == (True, "Spec hash verified — no modifications detected.")
    assert integrity["spec_hash"] == json.loads(before)["integrity"]["spec_hash"]  # unchanged


def test_approve_keeps_an_ascii_file_ascii(root: Path) -> None:
    path = root / "facts" / "specs" / "whk-nms.facts.json"
    assert path.read_text(encoding="utf-8").isascii()
    code, _ = run("approve", str(path), "--by", "reh3376")
    assert code == 0
    after = path.read_text(encoding="utf-8")
    assert after.isascii() and json.loads(after)["integrity"]["approved_by"] == "reh3376"


def test_approve_is_idempotent_for_the_same_approver(root: Path) -> None:
    path = root / "facts" / "specs" / "whk-wms.facts.json"
    before = path.read_text()
    code, out = run("approve", str(path), "--by", "reh3376")
    assert code == 0 and "already approved by reh3376" in out
    assert path.read_text() == before


def test_approve_refuses_when_the_hash_does_not_cover_the_content(root: Path) -> None:
    path = root / "fvts" / "specs" / "ot-module.fvts.json"
    spec = json.loads(path.read_text(encoding="utf-8"))
    spec["scope"]["description"] = "edited after the stamp"
    path.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tampered = path.read_text(encoding="utf-8")

    code, out = run("approve", str(path), "--by", "reh3376")
    assert code == 1 and "refused" in out and "mismatch" in out and "forge governance stamp" in out
    assert path.read_text(encoding="utf-8") == tampered  # nothing written


def test_approve_needs_a_hash_and_a_file(root: Path, tmp_path: Path) -> None:
    bare = tmp_path / "bare.facts.json"
    bare.write_text(json.dumps({"spec_version": "1.0.0", "integrity": {}}))
    code, out = run("approve", str(bare), "--by", "reh3376")
    assert code == 1 and "no spec_hash" in out
    code, out = run("approve", str(tmp_path / "missing.json"), "--by", "reh3376")
    assert code == 1 and "not found" in out
    code, _ = run("approve", str(bare), "--by", "  ")
    assert code == 2  # BadParameter


# -- stamp ------------------------------------------------------------------


def test_stamp_rehashes_and_leaves_the_spec_pending(root: Path) -> None:
    path = root / "facts" / "specs" / "whk-wms.facts.json"
    original = json.loads(path.read_text(encoding="utf-8"))
    old_hash = original["integrity"]["spec_hash"]

    code, out = run("stamp", str(path), "--by", "claude-code", "--reason", "nothing changed")
    assert code == 0 and "unchanged" in out

    edited = json.loads(path.read_text(encoding="utf-8"))
    edited["adapter_identity"]["description"] = "edited for the stamp test"
    path.write_text(json.dumps(edited, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    before = path.read_text(encoding="utf-8")

    code, out = run(
        "stamp",
        str(path),
        "--by",
        "claude-code",
        "--reason",
        "FB-021: stamp test",
        "--source",
        "agent",
        "--change-type",
        "content",
    )
    assert code == 0, out
    assert "pending_review" in out and "forge governance approve" in out

    after = path.read_text(encoding="utf-8")
    assert strip_integrity(after) == strip_integrity(before)
    spec = json.loads(after)
    integrity = spec["integrity"]
    assert integrity["hash_state"] == "pending_review"
    assert "approved_by" not in integrity and "approved_at" not in integrity
    assert integrity["previous_hash"] == old_hash and integrity["spec_hash"] != old_hash
    newest = integrity["change_history"][0]
    assert newest["previous_hash"] == old_hash and newest["new_hash"] == integrity["spec_hash"]
    assert newest["source"] == "agent" and newest["changed_by"] == "claude-code"
    assert newest["change_type"] == "content" and newest["reason"] == "FB-021: stamp test"
    assert STAMP_RE.match(newest["changed_at"])
    assert verify_spec_hash(spec)[0] is True

    # the owner can now approve the new hash
    code, out = run("approve", str(path), "--by", "reh3376")
    assert code == 0 and json.loads(path.read_text())["integrity"]["hash_state"] == "approved"


def test_stamp_validates_its_vocabulary(root: Path) -> None:
    path = root / "facts" / "specs" / "whk-wms.facts.json"
    code, _ = run("stamp", str(path), "--by", "x", "--reason", "r", "--source", "wishful")
    assert code == 2
    code, _ = run("stamp", str(path), "--by", "x", "--reason", "r", "--change-type", "vibes")
    assert code == 2


def test_stamp_of_a_first_hash_is_still_pending(tmp_path: Path) -> None:
    path = tmp_path / "new.facts.json"
    path.write_text(json.dumps({"spec_version": "1.0.0", "adapter_identity": {"id": "x"}}))
    code, out = run("stamp", str(path), "--by", "alice", "--reason", "first stamp")
    assert code == 0, out
    integrity = json.loads(path.read_text())["integrity"]
    assert integrity["hash_state"] == "pending_review" and integrity["change_history"] == []
    assert integrity["previous_hash"] is None and len(integrity["spec_hash"]) == 64


# -- the text splice --------------------------------------------------------


def test_render_integrity_falls_back_to_a_full_dump_without_a_top_level_block() -> None:
    text = '{"a": 1, "nested": {"integrity": {"x": 1}}}'
    out = governance.render_integrity(text, {"spec_hash": "h"})
    assert json.loads(out) == {
        "a": 1,
        "nested": {"integrity": {"x": 1}},
        "integrity": {"spec_hash": "h"},
    }
    assert out.endswith("\n")


# -- validate-spec ----------------------------------------------------------


def test_validate_spec_knows_fvts_and_ftts() -> None:
    code, out = run("validate-spec", str(FVTS_OT))
    assert code == 0 and "[PASS]" in out and "FVTS" in out


# -- run (FB-083) -----------------------------------------------------------


def test_run_facts_by_adapter_id_and_by_file() -> None:
    code, out = run("run", "facts", "whk-wms")
    assert code == 0, out
    assert "[PASS] FACTS — whk-wms" in out and "All checks passed." in out

    code, out = run("run", "facts", str(FACTS_WMS), "--format", "json")
    assert code == 0, out
    report = json.loads(out)
    assert report["framework"] == "FACTS" and report["target"] == "whk-wms"
    assert report["metadata"]["spec_file"] == str(FACTS_WMS)
    assert {v["status"] for v in report["verdicts"]} <= {"PASS", "SKIP"}


def test_run_lists_the_failed_checks_and_exits_1(tmp_path: Path) -> None:
    spec = json.loads(FACTS_WMS.read_text(encoding="utf-8"))
    spec["adapter_identity"]["adapter_id"] = "Not Kebab"
    path = tmp_path / "broken.facts.json"
    path.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    code, out = run("run", "facts", str(path))
    assert code == 1
    assert "[FAIL] FACTS — Not Kebab" in out and "Failed checks:" in out
    assert "facts:identity-id-format" in out and "[HASH MISMATCH]" in out


def test_run_fvts_reference_only_waits_on_the_owner(tmp_path: Path) -> None:
    out_file = tmp_path / "fvts.json"
    code, out = run("run", "fvts", "ot-module-views", "--format", "json", "--output", str(out_file))
    report = json.loads(out)
    assert report == json.loads(out_file.read_text(encoding="utf-8"))
    assert report["framework"] == "FVTS" and len(report["verdicts"]) == 19
    not_ok = {v["check_id"] for v in report["verdicts"] if v["status"] not in ("PASS", "SKIP")}
    assert not_ok <= {"fvts:hash-approved"}  # pending the owner's approval, nothing else
    assert code == (1 if not_ok else 0)


def test_run_ftts_and_fats_load_their_specs() -> None:
    code, out = run("run", "ftts", "grpc-hardened-transport")
    assert code == 0, out
    assert "[PASS] FTTS — grpc-hardened-transport" in out

    code, out = run("run", "fats", "/v1/health", "--format", "json")
    report = json.loads(out)
    assert report["framework"] == "FATS" and report["target"] == "/v1/health"
    assert report["metadata"]["spec_file"].endswith("v1_health.json")
    assert not [v for v in report["verdicts"] if v["check_id"] == "fats:spec-load"]


def test_run_rejects_unknown_frameworks_targets_and_formats(tmp_path: Path) -> None:
    code, out = run("run", "fqts", "anything")
    assert code == 1 and "no runner on the CLI" in out
    code, out = run("run", "facts", "no-such-adapter")
    assert code == 1 and "no FACTS spec for 'no-such-adapter'" in out
    code, out = run("run", "facts", "whk-wms", "--specs", str(tmp_path))
    assert code == 1 and str(tmp_path) in out
    code, _ = run("run", "facts", "whk-wms", "--format", "yaml")
    assert code == 2
