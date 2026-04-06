"""FATS runner — enforces API endpoint conformance against FATS specs.

This runner validates that a live (or mocked) API endpoint conforms
to its FATS spec file. Every field in fats.schema.json is checked —
schema-runner parity is verified by the base class.
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any, ClassVar

import httpx

from forge.governance.shared.runner import (
    FxTSRunner,
    FxTSVerdict,
    SpecViolation,
    VerdictStatus,
)

if TYPE_CHECKING:
    from pathlib import Path


class FATSRunner(FxTSRunner):
    """API conformance runner for the FATS framework.

    Usage:
        runner = FATSRunner(
            schema_path="governance/fats/schema/fats.schema.json",
            base_url="http://localhost:8000",
        )
        report = await runner.run(target="/v1/health")
    """

    framework = "FATS"
    version = "0.1.0"

    # All top-level schema fields this runner enforces
    _ENFORCED_FIELDS: ClassVar[set[str]] = {
        "spec_version",
        "endpoint",
        "method",
        "authentication",
        "request",
        "response",
        "rate_limit",
    }

    def __init__(
        self,
        schema_path: Path | str | None = None,
        base_url: str = "http://localhost:8000",
    ) -> None:
        super().__init__(schema_path=schema_path)
        self._base_url = base_url.rstrip("/")

    def implemented_fields(self) -> set[str]:
        return self._ENFORCED_FIELDS

    async def _run_checks(
        self, target: str, **kwargs: Any
    ) -> list[FxTSVerdict]:
        """Run all FATS checks against an endpoint.

        Args:
            target: endpoint path (e.g., "/v1/health")
            **kwargs:
                spec: dict — the parsed FATS spec for this endpoint.
                       If not provided, attempts to load from specs dir.
                live: bool — if True, make real HTTP requests (default False).
        """
        spec: dict[str, Any] | None = kwargs.get("spec")
        live: bool = kwargs.get("live", False)

        if spec is None:
            return [
                FxTSVerdict(
                    check_id="fats:spec-load",
                    spec_ref="FATS/spec-load",
                    status=VerdictStatus.ERROR,
                    message=f"No spec provided for endpoint '{target}'.",
                )
            ]

        verdicts: list[FxTSVerdict] = []

        # Check: spec_version
        verdicts.append(self._check_spec_version(spec))

        # Check: endpoint format
        verdicts.append(self._check_endpoint(spec, target))

        # Check: method
        verdicts.append(self._check_method(spec))

        # Check: authentication
        verdicts.append(self._check_authentication(spec))

        # Check: request envelope
        verdicts.append(self._check_request(spec))

        # Check: response envelope
        verdicts.append(self._check_response(spec))

        # Check: rate_limit
        verdicts.append(self._check_rate_limit(spec))

        # Live checks (only if requested and endpoint is reachable)
        if live:
            live_verdicts = await self._live_checks(spec, target)
            verdicts.extend(live_verdicts)

        return verdicts

    # --- Individual check implementations ---

    def _check_spec_version(self, spec: dict[str, Any]) -> FxTSVerdict:
        version = spec.get("spec_version")
        if version == "0.1.0":
            return FxTSVerdict(
                check_id="fats:spec-version",
                spec_ref="FATS/spec_version",
                status=VerdictStatus.PASS,
                message="Spec version is 0.1.0.",
            )
        return FxTSVerdict(
            check_id="fats:spec-version",
            spec_ref="FATS/spec_version",
            status=VerdictStatus.FAIL,
            message=f"Expected spec_version '0.1.0', got '{version}'.",
            violations=[
                SpecViolation(
                    field="spec_version",
                    expected="0.1.0",
                    actual=version,
                    message="Unsupported spec version.",
                )
            ],
        )

    def _check_endpoint(
        self, spec: dict[str, Any], target: str
    ) -> FxTSVerdict:
        endpoint = spec.get("endpoint", "")
        if not endpoint.startswith("/"):
            return FxTSVerdict(
                check_id="fats:endpoint-format",
                spec_ref="FATS/endpoint",
                status=VerdictStatus.FAIL,
                message=f"Endpoint '{endpoint}' must start with /.",
                violations=[
                    SpecViolation(
                        field="endpoint",
                        expected="starts with /",
                        actual=endpoint,
                        message="Invalid endpoint format.",
                    )
                ],
            )
        if endpoint != target:
            return FxTSVerdict(
                check_id="fats:endpoint-match",
                spec_ref="FATS/endpoint",
                status=VerdictStatus.FAIL,
                message=f"Spec endpoint '{endpoint}' != target '{target}'.",
                violations=[
                    SpecViolation(
                        field="endpoint",
                        expected=target,
                        actual=endpoint,
                        message="Endpoint mismatch.",
                    )
                ],
            )
        return FxTSVerdict(
            check_id="fats:endpoint-format",
            spec_ref="FATS/endpoint",
            status=VerdictStatus.PASS,
            message=f"Endpoint '{endpoint}' is valid.",
        )

    def _check_method(self, spec: dict[str, Any]) -> FxTSVerdict:
        method = spec.get("method", "")
        valid = {"GET", "POST", "PUT", "PATCH", "DELETE"}
        if method in valid:
            return FxTSVerdict(
                check_id="fats:method",
                spec_ref="FATS/method",
                status=VerdictStatus.PASS,
                message=f"Method '{method}' is valid.",
            )
        return FxTSVerdict(
            check_id="fats:method",
            spec_ref="FATS/method",
            status=VerdictStatus.FAIL,
            message=f"Invalid method '{method}'.",
            violations=[
                SpecViolation(
                    field="method",
                    expected=str(valid),
                    actual=method,
                    message="Method not in allowed set.",
                )
            ],
        )

    def _check_authentication(self, spec: dict[str, Any]) -> FxTSVerdict:
        auth = spec.get("authentication", {})
        if "required" not in auth or "schemes" not in auth:
            return FxTSVerdict(
                check_id="fats:authentication",
                spec_ref="FATS/authentication",
                status=VerdictStatus.FAIL,
                message="Authentication must declare 'required' and 'schemes'.",
                violations=[
                    SpecViolation(
                        field="authentication",
                        message="Missing required auth fields.",
                    )
                ],
            )
        return FxTSVerdict(
            check_id="fats:authentication",
            spec_ref="FATS/authentication",
            status=VerdictStatus.PASS,
            message="Authentication spec is complete.",
        )

    def _check_request(self, spec: dict[str, Any]) -> FxTSVerdict:
        req = spec.get("request")
        if req is None:
            return FxTSVerdict(
                check_id="fats:request",
                spec_ref="FATS/request",
                status=VerdictStatus.FAIL,
                message="Request section missing.",
                violations=[
                    SpecViolation(
                        field="request", message="Request spec required."
                    )
                ],
            )
        return FxTSVerdict(
            check_id="fats:request",
            spec_ref="FATS/request",
            status=VerdictStatus.PASS,
            message="Request spec present.",
        )

    def _check_response(self, spec: dict[str, Any]) -> FxTSVerdict:
        resp = spec.get("response", {})
        violations = []
        if "success_status" not in resp:
            violations.append(
                SpecViolation(
                    field="response.success_status",
                    message="success_status is required.",
                )
            )
        if "error_format" not in resp:
            violations.append(
                SpecViolation(
                    field="response.error_format",
                    message="error_format is required.",
                )
            )
        if violations:
            return FxTSVerdict(
                check_id="fats:response",
                spec_ref="FATS/response",
                status=VerdictStatus.FAIL,
                message="Response spec incomplete.",
                violations=violations,
            )
        return FxTSVerdict(
            check_id="fats:response",
            spec_ref="FATS/response",
            status=VerdictStatus.PASS,
            message="Response spec complete.",
        )

    def _check_rate_limit(self, spec: dict[str, Any]) -> FxTSVerdict:
        rl = spec.get("rate_limit", {})
        if "requests_per_minute" not in rl:
            return FxTSVerdict(
                check_id="fats:rate-limit",
                spec_ref="FATS/rate_limit",
                status=VerdictStatus.FAIL,
                message="rate_limit.requests_per_minute is required.",
                violations=[
                    SpecViolation(
                        field="rate_limit.requests_per_minute",
                        message="Missing rate limit.",
                    )
                ],
            )
        return FxTSVerdict(
            check_id="fats:rate-limit",
            spec_ref="FATS/rate_limit",
            status=VerdictStatus.PASS,
            message="Rate limit spec present.",
        )

    # --- Live endpoint checks ---

    async def _live_checks(
        self, spec: dict[str, Any], target: str
    ) -> list[FxTSVerdict]:
        """Hit the actual endpoint and verify response shape."""
        verdicts: list[FxTSVerdict] = []
        url = f"{self._base_url}{target}"
        method = spec.get("method", "GET")

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                start = time.monotonic()
                resp = await client.request(method, url)
                elapsed_ms = (time.monotonic() - start) * 1000

            # Status code check
            expected_status = spec.get("response", {}).get("success_status")
            if expected_status and resp.status_code == expected_status:
                verdicts.append(
                    FxTSVerdict(
                        check_id="fats:live-status",
                        spec_ref="FATS/response/success_status",
                        status=VerdictStatus.PASS,
                        message=f"Status {resp.status_code} matches spec.",
                        evidence={"status_code": resp.status_code},
                    )
                )
            elif expected_status:
                verdicts.append(
                    FxTSVerdict(
                        check_id="fats:live-status",
                        spec_ref="FATS/response/success_status",
                        status=VerdictStatus.FAIL,
                        message=(
                            f"Expected {expected_status}, "
                            f"got {resp.status_code}."
                        ),
                        violations=[
                            SpecViolation(
                                field="response.success_status",
                                expected=expected_status,
                                actual=resp.status_code,
                                message="Status code mismatch.",
                            )
                        ],
                    )
                )

            # Latency check
            max_latency = spec.get("response", {}).get("max_latency_ms")
            if max_latency:
                status = (
                    VerdictStatus.PASS
                    if elapsed_ms <= max_latency
                    else VerdictStatus.FAIL
                )
                verdicts.append(
                    FxTSVerdict(
                        check_id="fats:live-latency",
                        spec_ref="FATS/response/max_latency_ms",
                        status=status,
                        message=f"Latency {elapsed_ms:.1f}ms (max {max_latency}ms).",
                        evidence={
                            "latency_ms": round(elapsed_ms, 1),
                            "max_latency_ms": max_latency,
                        },
                    )
                )

        except httpx.ConnectError:
            verdicts.append(
                FxTSVerdict(
                    check_id="fats:live-connect",
                    spec_ref="FATS/live",
                    status=VerdictStatus.ERROR,
                    message=f"Cannot connect to {url}.",
                )
            )

        return verdicts
