"""Check an adapter manifest against its FACTS spec at registration time.

A spoke announces itself with an ``AdapterManifest``; the governance
record of what that spoke is allowed to be is its FACTS spec in
``forge/governance/facts/specs/<adapter_id>.facts.json``. The two must
agree on identity, capabilities and the data contract before the hub
accepts records from it.

Severity:
    * **problem** (registration rejected): capabilities differ, the
      ``schema_ref`` differs, the spec's integrity hash does not verify,
      or the spec is required but missing.
    * **warning** (registration accepted, logged): version / type /
      tier / protocol / output_format / context_fields differ, or no spec
      exists and specs are not required.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from forge.core.models.adapter import AdapterManifest


logger = logging.getLogger(__name__)

DEFAULT_SPECS_DIR = Path(__file__).resolve().parent.parent / "governance" / "facts" / "specs"

_CAPABILITY_NAMES = ("read", "write", "subscribe", "backfill", "discover")


@dataclass
class FactsCheckResult:
    """Outcome of comparing a manifest with its FACTS spec."""

    adapter_id: str
    spec_found: bool
    spec_path: Path | None = None
    spec_version: str | None = None
    problems: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.problems

    def summary(self) -> str:
        if not self.spec_found:
            base = "no FACTS spec"
        elif self.ok:
            base = f"FACTS spec {self.spec_path.name if self.spec_path else ''} ok"
        else:
            base = "FACTS conformance failed: " + "; ".join(self.problems)
        if self.warnings:
            base += f" ({len(self.warnings)} warning(s))"
        return base

    def to_dict(self) -> dict[str, Any]:
        return {
            "adapter_id": self.adapter_id,
            "spec_found": self.spec_found,
            "spec_path": str(self.spec_path) if self.spec_path else None,
            "spec_version": self.spec_version,
            "ok": self.ok,
            "problems": list(self.problems),
            "warnings": list(self.warnings),
        }


def load_facts_spec(
    adapter_id: str, specs_dir: Path | None = None
) -> tuple[dict[str, Any] | None, Path | None]:
    """Return ``(spec, path)`` for ``adapter_id`` or ``(None, None)``."""
    directory = specs_dir or DEFAULT_SPECS_DIR
    path = directory / f"{adapter_id}.facts.json"
    if not path.is_file():
        return None, None
    with path.open(encoding="utf-8") as fh:
        return json.load(fh), path


def _verify_integrity(spec: dict[str, Any]) -> tuple[bool | None, str]:
    """Delegate to the governance hash verifier when available."""
    try:
        from forge.governance.shared.runner import verify_spec_hash
    except Exception:  # pragma: no cover - governance package optional at runtime
        return None, "integrity verifier unavailable"
    try:
        return verify_spec_hash(spec)
    except Exception as exc:  # pragma: no cover - defensive
        return None, f"integrity check error: {exc}"


def _norm(value: Any) -> str:
    return str(value or "").strip().upper()


def check_manifest_against_facts(
    manifest: AdapterManifest,
    *,
    specs_dir: Path | None = None,
    require_spec: bool = False,
) -> FactsCheckResult:
    """Compare a manifest with the FACTS spec of the same adapter id."""
    spec, path = load_facts_spec(manifest.adapter_id, specs_dir)
    result = FactsCheckResult(
        adapter_id=manifest.adapter_id, spec_found=spec is not None, spec_path=path
    )
    if spec is None:
        msg = f"no FACTS spec for adapter '{manifest.adapter_id}'"
        (result.problems if require_spec else result.warnings).append(msg)
        return result

    identity = spec.get("adapter_identity") or {}
    result.spec_version = identity.get("version")

    verified, detail = _verify_integrity(spec)
    if verified is False:
        result.problems.append(f"FACTS spec integrity hash does not verify ({detail})")
    elif verified is None:
        result.warnings.append(f"FACTS spec integrity not verified ({detail})")

    spec_id = identity.get("adapter_id")
    if spec_id and spec_id != manifest.adapter_id:
        result.problems.append(
            f"spec adapter_id '{spec_id}' != manifest adapter_id '{manifest.adapter_id}'"
        )

    for key in ("version", "type", "protocol"):
        spec_val = identity.get(key)
        man_val = getattr(manifest, key, None)
        if spec_val is not None and str(spec_val) != str(man_val):
            result.warnings.append(f"{key}: spec '{spec_val}' != manifest '{man_val}'")
    spec_tier = identity.get("tier")
    if spec_tier is not None and _norm(spec_tier) != _norm(manifest.tier.value):
        result.warnings.append(f"tier: spec '{spec_tier}' != manifest '{manifest.tier.value}'")

    caps = spec.get("capabilities") or {}
    diffs = [
        f"{name}={getattr(manifest.capabilities, name)} (spec {caps[name]})"
        for name in _CAPABILITY_NAMES
        if name in caps and bool(caps[name]) != bool(getattr(manifest.capabilities, name))
    ]
    if diffs:
        result.problems.append("capabilities differ: " + ", ".join(diffs))

    contract = spec.get("data_contract") or {}
    spec_ref = contract.get("schema_ref")
    if spec_ref and spec_ref != manifest.data_contract.schema_ref:
        result.problems.append(
            f"schema_ref: spec '{spec_ref}' != manifest '{manifest.data_contract.schema_ref}'"
        )
    spec_fmt = contract.get("output_format")
    if spec_fmt and spec_fmt != manifest.data_contract.output_format:
        result.warnings.append(
            f"output_format: spec '{spec_fmt}' != manifest '{manifest.data_contract.output_format}'"
        )
    spec_fields = set(contract.get("context_fields") or [])
    man_fields = set(manifest.data_contract.context_fields)
    if spec_fields and spec_fields != man_fields:
        missing = sorted(spec_fields - man_fields)
        extra = sorted(man_fields - spec_fields)
        parts = []
        if missing:
            parts.append(f"missing {missing}")
        if extra:
            parts.append(f"extra {extra}")
        result.warnings.append("context_fields differ: " + ", ".join(parts))

    if result.problems:
        logger.warning("FACTS check failed for %s: %s", manifest.adapter_id, result.summary())
    elif result.warnings:
        logger.info("FACTS check for %s: %s", manifest.adapter_id, "; ".join(result.warnings))
    return result
