"""Tests for gateway middleware stack."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from forge.gateway.auth import configure_auth
from forge.gateway.middleware import _get_limit_for_path, create_gateway_app
from forge.gateway.models import AuthConfig


@pytest.fixture(autouse=True)
def _disable_auth():
    """Disable auth for middleware tests (auth tested separately)."""
    configure_auth(AuthConfig(enabled=False))
    yield
    configure_auth(AuthConfig(enabled=False))


@pytest.fixture
def client() -> TestClient:
    app = create_gateway_app()
    return TestClient(app, raise_server_exceptions=False)


class TestTraceMiddleware:
    """Tests for request tracing headers."""

    def test_adds_trace_id(self, client: TestClient):
        resp = client.get("/healthz")
        assert "X-Trace-ID" in resp.headers

    def test_preserves_incoming_trace_id(self, client: TestClient):
        resp = client.get(
            "/healthz", headers={"X-Trace-ID": "my-trace-123"}
        )
        assert resp.headers["X-Trace-ID"] == "my-trace-123"

    def test_adds_response_time(self, client: TestClient):
        resp = client.get("/healthz")
        assert "X-Response-Time-Ms" in resp.headers
        ms = float(resp.headers["X-Response-Time-Ms"])
        assert ms >= 0


class TestRateLimitMiddleware:
    """Tests for rate limiting middleware integration."""

    def test_rate_limit_header_present(self, client: TestClient):
        resp = client.get("/v1/info")
        assert "X-RateLimit-Limit" in resp.headers

    def test_healthz_no_rate_limit(self, client: TestClient):
        # /healthz has rpm=0 (unlimited)
        resp = client.get("/healthz")
        assert resp.status_code == 200
        # No rate limit header for unlimited endpoints
        assert "X-RateLimit-Limit" not in resp.headers


class TestErrorHandling:
    """Tests for RFC 7807 error handling in the gateway."""

    def test_404_returns_rfc7807(self, client: TestClient):
        resp = client.get("/nonexistent")
        assert resp.status_code == 404
        body = resp.json()
        assert body["title"] == "Not Found"
        assert body["status"] == 404
        assert "trace_id" in body


class TestGetLimitForPath:
    """Tests for endpoint limit resolution."""

    def test_exact_match(self):
        limit = _get_limit_for_path("/healthz")
        assert limit is not None
        assert limit.requests_per_minute == 0

    def test_prefix_match(self):
        limit = _get_limit_for_path("/v1/adapters/some-adapter/health")
        assert limit is not None
        assert limit.requests_per_minute == 120

    def test_default_for_unknown(self):
        limit = _get_limit_for_path("/unknown/path")
        assert limit is not None
        assert limit.requests_per_minute == 120  # default

    def test_records_endpoint(self):
        limit = _get_limit_for_path("/v1/records")
        assert limit is not None
        assert limit.requests_per_minute == 300
