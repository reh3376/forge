"""``forge governance specs | stamp | approve`` (FB-021) and ``run`` (FB-083)."""

from __future__ import annotations

import json
import re
import shutil
from typing import TYPE_CHECKING

import pytest
from typer.testing import CliRunner

from forge_core.fxts import locations
from forge_core.fxts.shared.runner import verify_spec_hash
from forge_hub.cli import governance
from forge_hub.cli.main import app

if TYPE_CHECKING:
    from pathlib import Path

runner = CliRunner()

SPECS = governance.SPEC_ROOT
FACTS_OT = locations.spec_path("facts", "forge-ot.facts.json")  # non-ASCII, hand-wrapped
FACTS_NMS = locations.spec_path("facts", "forge-nms.facts.json")  # ASCII-escaped
FACTS_WMS = locations.spec_path("facts", "forge-wms.facts.json")  # approved in the fixture
FVTS_OT = locations.spec_path("fvts", "forge-ot.fvts.json")
STAMP_RE = re.compile(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")


def strip_integrity(text: str) -> str:
    """Everything in the file except the integrity block (what a write must not touch)."""
    marker = governance._INTEGRITY_MARKER
    start = text.index(marker) + len(marker)
    _, end = json.JSONDecoder().raw_decode(text, start)
    return text[:start] + text[end:]


@pytest.fixture
def root(tmp_path: Path) -> Path:
    """A governance root with copies of real specs in a known state.

    The real specs' hash state is the owner's call (an agent never approves, FB-021), so
    the copies are put where the tests expect them: forge-wms approved by a test owner, the
    other three awaiting approval.
    """
    for src in (FACTS_OT, FACTS_NMS, FACTS_WMS, FVTS_OT):
        dest = tmp_path / src.parent.name / "specs" / src.name  # <framework>/specs/<file>
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(src, dest)
        text, spec = governance.load_spec(dest)
        integrity = spec["integrity"]
        if src is FACTS_WMS:
            integrity["hash_state"] = "approved"
            integrity["approved_by"] = "test-owner"
            integrity["approved_at"] = "2026-01-01T00:00:00Z"
        else:
            integrity["hash_state"] = "pending_review"
            integrity.pop("approved_by", None)
            integrity.pop("approved_at", None)
        governance.write_integrity(dest, text, integrity)
    return tmp_path


def run(*args: str) -> tuple[int, str]:
    result = runner.invoke(app, ["governance", *args])
    return result.exit_code, result.output


# -- specs ------------------------------------------------------------------


def test_specs_lists_state_approver_and_verification(root: Path) -> None:
    code, out = run("specs", "--root", str(root))
    assert code == 0, out
    assert "forge-wms.facts.json" in out and "approved" in out and "test-owner" in out
    assert "forge-ot.fvts.json" in out and "pending_review" in out
    assert "4 spec(s): 3 awaiting approval, 0 with a hash mismatch." in out

    code, out = run("specs", "--root", str(root), "--pending")
    assert code == 0 and "forge-wms.facts.json" not in out and "3 spec(s)" in out

    code, out = run("specs", "--root", str(root / "nowhere"))
    assert code == 0 and "No specs" in out


def test_specs_flags_a_hash_mismatch(root: Path) -> None:
    path = root / "facts" / "specs" / "forge-nms.facts.json"
    spec = json.loads(path.read_text())
    spec["adapter_identity"]["name"] += " (edited)"
    path.write_text(json.dumps(spec, indent=2) + "\n")
    code, out = run("specs", "--root", str(root))
    assert code == 0 and "1 with a hash mismatch" in out
    assert re.search(r"forge-nms\.facts\.json\s+pending_review\s+\S+\s+NO", out)


# -- approve ----------------------------------------------------------------


def test_approve_records_the_owner_and_touches_only_the_integrity_block(root: Path) -> None:
    path = root / "facts" / "specs" / "forge-ot.facts.json"
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
    path = root / "facts" / "specs" / "forge-nms.facts.json"
    assert path.read_text(encoding="utf-8").isascii()
    code, _ = run("approve", str(path), "--by", "reh3376")
    assert code == 0
    after = path.read_text(encoding="utf-8")
    assert after.isascii() and json.loads(after)["integrity"]["approved_by"] == "reh3376"


def test_approve_is_idempotent_for_the_same_approver(root: Path) -> None:
    path = root / "facts" / "specs" / "forge-wms.facts.json"
    before = path.read_text()
    code, out = run("approve", str(path), "--by", "test-owner")
    assert code == 0 and "already approved by test-owner" in out
    assert path.read_text() == before


def test_approve_refuses_when_the_hash_does_not_cover_the_content(root: Path) -> None:
    path = root / "fvts" / "specs" / "forge-ot.fvts.json"
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
    path = root / "facts" / "specs" / "forge-wms.facts.json"
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
    path = root / "facts" / "specs" / "forge-wms.facts.json"
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


def test_run_facts_by_adapter_id_and_by_file(root: Path) -> None:
    specs = root / "facts" / "specs"
    code, out = run("run", "facts", "forge-wms", "--specs", str(specs))
    assert code == 0, out
    assert "[PASS] FACTS — forge-wms" in out and "All checks passed." in out

    code, out = run("run", "facts", str(specs / "forge-wms.facts.json"), "--format", "json")
    assert code == 0, out
    report = json.loads(out)
    assert report["framework"] == "FACTS" and report["target"] == "forge-wms"
    assert report["metadata"]["spec_file"] == str(specs / "forge-wms.facts.json")
    assert {v["status"] for v in report["verdicts"]} <= {"PASS", "SKIP"}


def test_run_facts_reports_a_pending_stamp_as_the_one_failed_check(root: Path) -> None:
    """A stamp the owner has not approved fails the approval check alone, exit 1 (FB-021).

    The check is the one every framework gets from the shared runner (D-14, FB-159).
    """
    path = root / "facts" / "specs" / "forge-nms.facts.json"
    code, out = run("run", "facts", str(path))
    assert code == 1
    assert "[FAIL] FACTS — forge-nms" in out and "Failed checks:" in out
    assert out.count("[FAIL] facts:") == 1 and "facts:hash-approved" in out
    assert "pending_review" in out and "not binding until the owner approves it" in out


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
    code, out = run("run", "fvts", "forge-ot-views", "--format", "json", "--output", str(out_file))
    report = json.loads(out)
    assert report == json.loads(out_file.read_text(encoding="utf-8"))
    assert report["framework"] == "FVTS" and len(report["verdicts"]) == 21
    not_ok = {v["check_id"] for v in report["verdicts"] if v["status"] not in ("PASS", "SKIP")}
    assert not_ok <= {"fvts:hash-approved"}  # pending the owner's approval, nothing else
    assert code == (1 if not_ok else 0)


def test_run_ftts_and_fats_load_their_specs() -> None:
    # The FTTS spec is hashed since FB-160 and the owner approved it on 2026-11-18.
    code, out = run("run", "ftts", "grpc-hardened-transport")
    assert code == 0, out
    assert "[PASS] FTTS — grpc-hardened-transport: 41/41 checks passed" in out

    code, out = run("run", "fats", "/v1/health", "--format", "json")
    report = json.loads(out)
    assert report["framework"] == "FATS" and report["target"] == "/v1/health"
    assert report["metadata"]["spec_file"].endswith("v1_health.json")
    assert not [v for v in report["verdicts"] if v["check_id"] == "fats:spec-load"]
    by_id = {v["check_id"]: v["status"] for v in report["verdicts"]}
    assert by_id["fats:hash-verified"] == "PASS"  # every FATS spec carries a hash (FB-160)
    assert by_id["fats:hash-approved"] == "PASS"  # the owner approved all 28 on 2026-11-18


def test_run_rejects_unknown_frameworks_targets_and_formats(tmp_path: Path) -> None:
    code, out = run("run", "fqts", "anything")
    assert code == 1 and "no runner on the CLI" in out
    code, out = run("run", "facts", "no-such-adapter")
    assert code == 1 and "no FACTS spec for 'no-such-adapter'" in out
    code, out = run("run", "facts", "forge-wms", "--specs", str(tmp_path))
    assert code == 1 and str(tmp_path) in out
    code, _ = run("run", "facts", "forge-wms", "--format", "yaml")
    assert code == 2


# -- fmts -------------------------------------------------------------------


def test_run_fmts_names_what_it_did_not_check(tmp_path: Path) -> None:
    """A skipped requirement is printed on every run, and a failed one fails the run."""
    from forge_core.fxts.shared.runner import add_spec_hash, approve_spec_hash

    spec = {
        "spec_version": "2.0.0",
        "module_identity": {
            "module_id": "forge-wms",
            "name": "Warehouse management integration",
            "alias": "wms",
            "version": "0.1.0",
            "kind": "integration",
            "function": "wms",
            "language": "python",
            "source_paths": ["forge-modules/forge-wms/src/python/forge_wms"],
        },
        "hub_link": {"protocol": "grpc", "service": "forge.v1.AdapterService"},
        "transport": {
            "process_control_writes": False,
            "business_write_backs": False,
            "data_classes": ["raw", "historical", "status", "config"],
            "store_and_forward": {
                "size_bytes": {"min": 1_000_000, "max": 1_000_000_000},
                "age_seconds": {"min": 3600, "max": 604800},
                "pruning": ["drop-oldest"],
            },
            "last_will": {"message": "The warehouse module was lost.", "alarm_priority": "medium"},
        },
        "integration": {
            "product": "Example WMS",
            "supported_versions": ["4.x"],
            "interfaces": ["graphql"],
            "direction": "read",
            "site_owner": "warehouse operations",
            "credential": "example-wms-api",
        },
        "references": {
            "facts": {
                "path": "forge-modules/forge-wms/fxts/facts/forge-wms.facts.json",
                "adapter_id": "forge-wms",
            },
            "manifest": "forge-modules/forge-wms/src/python/forge_wms/manifest.json",
        },
        "baseline": {
            **{f"M-{n}": "met" for n in range(1, 15)},
            "M-15": "not_applicable",
            "M-16": "not_applicable",
        },
        "waivers": [],
        "time_contract": {
            "hub": {"exchange": "four-timestamp", "fail_closed": True},
            "plant_floor_devices": "none",
            "databases": [],
            "third_party_systems": [
                {
                    "name": "forge-wms",
                    "interface": "graphql",
                    "clock_read_method": "unreadable",
                    "polling_interval_seconds": 30,
                    "fail_closed": True,
                }
            ],
        },
        "user_interface": {"ships_ui_code": False, "screens": False},
        # off the template, so the conformance kit cannot drive it: M-4 to M-7 are skipped
        "scaffold": {"template": "none"},
    }
    add_spec_hash(spec, changed_by="test")
    approve_spec_hash(spec, approved_by="test-owner")
    path = tmp_path / "forge-wms.fmts.json"
    path.write_text(json.dumps(spec, indent=2) + "\n")

    code, out = run("run", "fmts", str(path))
    assert code == 1, out
    assert "[FAIL] fmts:m10" in out and "names no roles file" in out
    assert "Not checked:" in out
    for requirement in ("m4", "m5", "m6", "m7"):
        assert f"[SKIP] fmts:{requirement}: NOT CHECKED" in out
    assert "[FAIL] fmts:m1:" not in out and "[FAIL] fmts:m2:" not in out
    assert "[FAIL] fmts:m3:" not in out and "[FAIL] fmts:m11:" in out
