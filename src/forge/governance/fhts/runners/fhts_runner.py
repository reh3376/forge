"""FHTS Runner — Forge Hash Test Specification runner.

Validates hash integrity across all FxTS framework specs.
Adapted from MDEMG UNTS gRPC service + UATS runner hash utilities.

Usage (planned CLI integration)::

    # Add hashes to all specs in a framework
    forge governance run fhts --add-hashes --framework facts --spec-dir specs/

    # Verify hashes without running assertions
    forge governance run fhts --verify-hashes --framework facts --spec-dir specs/

    # Full registry verification
    forge governance run fhts --verify-all

    # JSON report output
    forge governance run fhts --verify-all --format json --output reports/fhts.json
"""

from __future__ import annotations

import json
import time
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from pathlib import Path

    from forge.governance.fhts.registry import FHTSRegistry

from forge.governance.shared.runner import (
    FxTSRunner,
    FxTSVerdict,
    SpecViolation,
    VerdictStatus,
    add_spec_hash,
    verify_spec_hash,
    verify_spec_integrity,
)


class FHTSRunner(FxTSRunner):
    """Runner for the Forge Hash Test Specification framework.

    Unlike other FxTS runners that validate a single spec against a target,
    FHTS operates across ALL specs in ALL frameworks.  It:

      1. Scans spec directories for each registered framework
      2. Verifies each spec's self-contained hash (Layer 1)
      3. Cross-references with the FHTS registry (Layer 2)
      4. Reports on hash state, approval status, and governance warnings
      5. Detects AI agent modifications awaiting review

    Check catalog:
      - ``fhts:hash-present``     — Spec has an integrity block with hash
      - ``fhts:hash-verified``    — Current content matches stored hash
      - ``fhts:hash-approved``    — Hash state is approved by authorized actor
      - ``fhts:registry-tracked`` — Spec is registered in FHTS registry
      - ``fhts:registry-match``   — Registry hash matches spec's self-contained hash
      - ``fhts:no-agent-pending`` — No unapproved agent-sourced changes
      - ``fhts:history-healthy``  — Change history shows no churn pattern
    """

    framework = "FHTS"
    version = "0.1.0"

    def __init__(
        self,
        schema_path: Path | str | None = None,
        registry: FHTSRegistry | None = None,
    ) -> None:
        super().__init__(schema_path=schema_path)
        self._registry = registry

    def implemented_fields(self) -> set[str]:
        """FHTS doesn't have a traditional schema — it validates integrity blocks."""
        return {
            "integrity",
            "integrity.hash_method",
            "integrity.spec_hash",
            "integrity.hash_state",
            "integrity.previous_hash",
            "integrity.approved_by",
            "integrity.approved_at",
            "integrity.change_history",
        }

    async def _run_checks(
        self,
        target: str,
        **kwargs: Any,
    ) -> list[FxTSVerdict]:
        """Run FHTS checks against a spec or set of specs.

        Args:
            target: Framework name (e.g., "facts") or spec path.
            **kwargs:
                spec: Single spec dict to check.
                spec_path: Path to spec file (for registry cross-reference).
                specs: List of (path, spec_dict) tuples for batch checking.
        """
        verdicts: list[FxTSVerdict] = []

        spec = kwargs.get("spec")
        spec_path = kwargs.get("spec_path", target)

        if spec is not None:
            verdicts.extend(self._check_single_spec(spec, spec_path))

        # Batch mode
        specs: list[tuple[str, dict[str, Any]]] = kwargs.get("specs", [])
        for path, spec_dict in specs:
            verdicts.extend(self._check_single_spec(spec_dict, path))

        return verdicts

    def _check_single_spec(
        self,
        spec: dict[str, Any],
        spec_path: str,
    ) -> list[FxTSVerdict]:
        """Run all FHTS checks on a single spec."""
        verdicts: list[FxTSVerdict] = []

        # fhts:hash-present — spec has an integrity block with hash
        integrity = spec.get("integrity")
        has_hash = integrity is not None and bool(integrity.get("spec_hash"))
        verdicts.append(FxTSVerdict(
            check_id="fhts:hash-present",
            spec_ref=spec_path,
            status=VerdictStatus.PASS if has_hash else VerdictStatus.FAIL,
            message=(
                "Integrity block with hash found."
                if has_hash else
                "Missing integrity block or spec_hash — spec is not hash-protected."
            ),
            evidence={"has_integrity_block": integrity is not None, "has_hash": has_hash},
        ))

        if not has_hash:
            # Remaining checks require a hash
            return verdicts

        # fhts:hash-verified — current content matches stored hash
        start = time.monotonic()
        hash_verified, hash_msg = verify_spec_hash(spec)
        duration = (time.monotonic() - start) * 1000
        verdicts.append(FxTSVerdict(
            check_id="fhts:hash-verified",
            spec_ref=spec_path,
            status=VerdictStatus.PASS if hash_verified else VerdictStatus.FAIL,
            message=hash_msg,
            duration_ms=duration,
            evidence={
                "hash_verified": hash_verified,
                "stored_hash": integrity.get("spec_hash", "")[:16] + "…",
            },
            violations=[] if hash_verified else [SpecViolation(
                field="integrity.spec_hash",
                message=hash_msg,
                expected=integrity.get("spec_hash", "")[:16] + "…",
                actual="(recomputed, differs)",
            )],
        ))

        # fhts:hash-approved — hash state is approved
        full_result = verify_spec_integrity(spec)
        hash_state = full_result["hash_state"]
        state_approved = full_result["state_approved"]
        verdicts.append(FxTSVerdict(
            check_id="fhts:hash-approved",
            spec_ref=spec_path,
            status=VerdictStatus.PASS if state_approved else VerdictStatus.FAIL,
            message=(
                f"Hash state is '{hash_state}', approved by "
                    f"{integrity.get('approved_by', '(none)')}."
                if state_approved else
                f"Hash state is '{hash_state}' — not approved."
            ),
            evidence={
                "hash_state": hash_state,
                "approved_by": integrity.get("approved_by", ""),
                "approved_at": integrity.get("approved_at", ""),
            },
        ))

        # fhts:no-agent-pending — no unapproved agent changes
        change_history = integrity.get("change_history", [])
        agent_changes = [h for h in change_history if h.get("source") == "agent"]
        has_pending_agent = bool(agent_changes) and hash_state != "approved"
        verdicts.append(FxTSVerdict(
            check_id="fhts:no-agent-pending",
            spec_ref=spec_path,
            status=VerdictStatus.FAIL if has_pending_agent else VerdictStatus.PASS,
            message=(
                f"{len(agent_changes)} agent change(s) pending review."
                if has_pending_agent else
                "No unapproved agent changes."
            ),
            evidence={
                "agent_changes_count": len(agent_changes),
                "hash_state": hash_state,
            },
        ))

        # fhts:history-healthy — no excessive churn
        from forge.governance.shared.runner import MAX_HASH_HISTORY
        is_churning = len(change_history) >= MAX_HASH_HISTORY
        verdicts.append(FxTSVerdict(
            check_id="fhts:history-healthy",
            spec_ref=spec_path,
            status=VerdictStatus.FAIL if is_churning else VerdictStatus.PASS,
            message=(
                f"Change history at capacity ({len(change_history)}/{MAX_HASH_HISTORY}). "
                "Possible thrashing — investigate agent behavior."
                if is_churning else
                f"Change history healthy ({len(change_history)}/{MAX_HASH_HISTORY} entries)."
            ),
            evidence={
                "history_depth": len(change_history),
                "max_history": MAX_HASH_HISTORY,
            },
        ))

        # fhts:registry-tracked — spec is in FHTS registry (if registry available)
        if self._registry is not None:
            record = self._registry.get(spec_path)
            verdicts.append(FxTSVerdict(
                check_id="fhts:registry-tracked",
                spec_ref=spec_path,
                status=VerdictStatus.PASS if record else VerdictStatus.FAIL,
                message=(
                    f"Spec registered in FHTS registry (framework: {record.framework})."
                    if record else
                    "Spec not found in FHTS registry — register it for cross-cutting governance."
                ),
            ))

            # fhts:registry-match — registry hash matches spec hash
            if record:
                spec_hash = integrity.get("spec_hash", "")
                matches = record.current_hash == spec_hash
                verdicts.append(FxTSVerdict(
                    check_id="fhts:registry-match",
                    spec_ref=spec_path,
                    status=VerdictStatus.PASS if matches else VerdictStatus.FAIL,
                    message=(
                        "Registry hash matches spec's self-contained hash."
                        if matches else
                        "Registry hash does NOT match spec — registry is out of sync."
                    ),
                    evidence={
                        "registry_hash": record.current_hash[:16] + "…",
                        "spec_hash": spec_hash[:16] + "…",
                    },
                ))

        return verdicts

    # -- CLI helper methods -------------------------------------------------

    @staticmethod
    def add_hashes_to_dir(
        spec_dir: Path,
        source: str = "manual",
        changed_by: str = "",
    ) -> list[tuple[str, str]]:
        """Add or update integrity hashes for all spec files in a directory.

        Mirrors MDEMG UATS runner ``add-hashes`` command.

        Returns list of (filename, message) tuples.
        """
        results = []
        for spec_path in sorted(spec_dir.glob("*.json")):
            if not spec_path.is_file():
                continue
            try:
                spec = json.loads(spec_path.read_text(encoding="utf-8"))
                old_hash = spec.get("integrity", {}).get("spec_hash")
                add_spec_hash(
                    spec,
                    source=source,
                    changed_by=changed_by,
                    change_type="spec_update",
                    reason="Hash added/updated by FHTS runner",
                )
                new_hash = spec["integrity"]["spec_hash"]
                spec_path.write_text(
                    json.dumps(spec, indent=2) + "\n",
                    encoding="utf-8",
                )
                if old_hash == new_hash:
                    results.append((spec_path.name, f"Unchanged: {new_hash[:12]}…"))
                elif old_hash:
                    msg = f"Updated: {old_hash[:12]}… → {new_hash[:12]}…"
                    results.append((spec_path.name, msg))
                else:
                    results.append((spec_path.name, f"Added: {new_hash[:12]}…"))
            except Exception as exc:
                results.append((spec_path.name, f"Error: {exc}"))
        return results

    @staticmethod
    def verify_hashes_in_dir(spec_dir: Path) -> list[tuple[str, bool, str]]:
        """Verify integrity hashes for all spec files in a directory.

        Mirrors MDEMG UATS runner ``verify-hashes`` command.

        Returns list of (filename, valid, message) tuples.
        """
        results = []
        for spec_path in sorted(spec_dir.glob("*.json")):
            if not spec_path.is_file():
                continue
            try:
                spec = json.loads(spec_path.read_text(encoding="utf-8"))
                verified, msg = verify_spec_hash(spec)
                if verified is None:
                    results.append((spec_path.name, False, "No hash in spec"))
                else:
                    results.append((spec_path.name, bool(verified), msg))
            except Exception as exc:
                results.append((spec_path.name, False, f"Error: {exc}"))
        return results
