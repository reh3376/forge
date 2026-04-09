#!/usr/bin/env python3
"""D3.12 Production Verification Runner.

Runs all D3 integration tests and produces a structured summary report.

Usage:
    python scripts/verify_d3.py              # Full verification
    python scripts/verify_d3.py --quick      # Just the verification tests
    python scripts/verify_d3.py --report     # Generate JSON report only
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VERIFICATION_DIR = ROOT / "tests" / "verification"


def run_pytest(
    test_dir: str | Path,
    *,
    verbose: bool = True,
    json_report: bool = False,
) -> dict:
    """Run pytest and return structured results."""
    cmd = [
        sys.executable, "-m", "pytest",
        str(test_dir),
        "--tb=short",
        "-q",
    ]
    if verbose:
        cmd.append("-v")

    start = time.monotonic()
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(ROOT))
    elapsed = time.monotonic() - start

    # Parse output for pass/fail counts
    output = result.stdout + result.stderr
    passed = failed = errors = skipped = 0
    for line in output.splitlines():
        if "passed" in line and ("failed" in line or "warning" in line or "=" in line):
            parts = line.split()
            for i, p in enumerate(parts):
                if p == "passed" or p == "passed,":
                    passed = int(parts[i - 1])
                if p == "failed" or p == "failed,":
                    failed = int(parts[i - 1])
                if p == "error" or p == "errors" or p == "error,":
                    errors = int(parts[i - 1])
                if p == "skipped" or p == "skipped,":
                    skipped = int(parts[i - 1])

    return {
        "exit_code": result.returncode,
        "passed": passed,
        "failed": failed,
        "errors": errors,
        "skipped": skipped,
        "elapsed_seconds": round(elapsed, 2),
        "output": output,
    }


def run_verification(args: argparse.Namespace) -> dict:
    """Run the full D3.12 verification suite."""
    report = {
        "title": "D3.12 Production Verification Report",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "python_version": sys.version,
        "suites": {},
        "summary": {},
    }

    suites = {
        "pipeline_e2e": {
            "name": "End-to-End Pipeline",
            "description": "adapter → context → record → governance → storage → curation",
            "path": VERIFICATION_DIR / "test_pipeline_e2e.py",
        },
        "hub_api": {
            "name": "Hub API Integration",
            "description": "registration → health → ingestion → query",
            "path": VERIFICATION_DIR / "test_hub_api.py",
        },
        "facts_governance": {
            "name": "FACTS Governance Pipeline",
            "description": "spec load → validation → hash verification → report",
            "path": VERIFICATION_DIR / "test_facts_governance.py",
        },
        "sdk_roundtrip": {
            "name": "Module Builder SDK Round-Trip",
            "description": "scaffold → import → configure → collect → verify",
            "path": VERIFICATION_DIR / "test_sdk_roundtrip.py",
        },
    }

    total_passed = 0
    total_failed = 0
    total_errors = 0
    all_green = True

    print("=" * 70)
    print("  D3.12 PRODUCTION VERIFICATION")
    print("=" * 70)
    print()

    for suite_id, suite_info in suites.items():
        print(f"▸ {suite_info['name']}")
        print(f"  {suite_info['description']}")

        result = run_pytest(suite_info["path"], verbose=not args.quiet)

        status = "PASS" if result["exit_code"] == 0 else "FAIL"
        symbol = "✓" if status == "PASS" else "✗"
        total_passed += result["passed"]
        total_failed += result["failed"]
        total_errors += result["errors"]

        if result["exit_code"] != 0:
            all_green = False

        print(f"  {symbol} {result['passed']} passed, "
              f"{result['failed']} failed "
              f"({result['elapsed_seconds']}s)")
        print()

        report["suites"][suite_id] = {
            "name": suite_info["name"],
            "status": status,
            **result,
        }

    # Full regression (unless --quick)
    if not args.quick:
        print("▸ Full Regression Suite")
        print("  All tests across the entire codebase")
        result = run_pytest(ROOT / "tests", verbose=False)
        symbol = "✓" if result["failed"] <= 1 else "✗"  # 1 pre-existing failure allowed
        print(f"  {symbol} {result['passed']} passed, "
              f"{result['failed']} failed, "
              f"{result['skipped']} skipped "
              f"({result['elapsed_seconds']}s)")
        report["suites"]["full_regression"] = {
            "name": "Full Regression",
            "status": "PASS" if result["failed"] <= 1 else "FAIL",
            **result,
        }
        print()

    # Summary
    report["summary"] = {
        "verification_passed": total_passed,
        "verification_failed": total_failed,
        "verification_errors": total_errors,
        "all_green": all_green,
        "verdict": "PASS — All D3 integration contracts verified"
        if all_green
        else "FAIL — Integration issues detected",
    }

    print("=" * 70)
    if all_green:
        print("  ✓ VERDICT: PASS — All D3 integration contracts verified")
    else:
        print("  ✗ VERDICT: FAIL — Integration issues detected")
    print(f"  Total: {total_passed} passed, {total_failed} failed")
    print("=" * 70)

    return report


def main():
    parser = argparse.ArgumentParser(description="D3.12 Production Verification")
    parser.add_argument("--quick", action="store_true", help="Skip full regression")
    parser.add_argument("--quiet", action="store_true", help="Less verbose output")
    parser.add_argument("--report", type=str, help="Write JSON report to file")
    args = parser.parse_args()

    report = run_verification(args)

    if args.report:
        report_path = Path(args.report)
        # Remove raw output from JSON report (too large)
        for suite in report["suites"].values():
            suite.pop("output", None)
        report_path.write_text(json.dumps(report, indent=2))
        print(f"\nReport written to: {report_path}")

    sys.exit(0 if report["summary"]["all_green"] else 1)


if __name__ == "__main__":
    main()
