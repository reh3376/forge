"""Tests for RFC 7807 error handling."""

from __future__ import annotations

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from forge.gateway.errors import install_error_handlers, problem_response


@pytest.fixture
def error_app() -> FastAPI:
    """App with RFC 7807 error handlers and test routes."""
    app = FastAPI()
    install_error_handlers(app)

    @app.get("/ok")
    async def ok():
        return {"status": "ok"}

    @app.get("/not-found")
    async def not_found():
        raise HTTPException(status_code=404, detail="Resource not found")

    @app.get("/forbidden")
    async def forbidden():
        raise HTTPException(status_code=403, detail="Access denied")

    @app.get("/crash")
    async def crash():
        raise RuntimeError("unexpected failure")

    @app.post("/validate")
    async def validate(data: dict):
        return data

    return app


@pytest.fixture
def client(error_app: FastAPI) -> TestClient:
    return TestClient(error_app, raise_server_exceptions=False)


class TestProblemResponse:
    """Test the problem_response builder."""

    def test_minimal_response(self):
        resp = problem_response(status=400, title="Bad Request")
        assert resp.status_code == 400
        import json

        body = json.loads(resp.body)
        assert body["status"] == 400
        assert body["title"] == "Bad Request"
        assert body["type"] == "about:blank"
        assert "trace_id" in body
        assert "timestamp" in body

    def test_full_response(self):
        resp = problem_response(
            status=429,
            title="Too Many Requests",
            detail="Rate limit exceeded",
            type_uri="forge://errors/rate-limit",
            instance="/v1/records",
            forge_code="RATE_LIMIT_EXCEEDED",
            extra={"retry_after": 30},
        )
        import json

        body = json.loads(resp.body)
        assert body["status"] == 429
        assert body["forge_code"] == "RATE_LIMIT_EXCEEDED"
        assert body["retry_after"] == 30
        assert body["instance"] == "/v1/records"


class TestErrorHandlers:
    """Test global exception handlers return RFC 7807."""

    def test_http_exception_returns_rfc7807(self, client: TestClient):
        resp = client.get("/not-found")
        assert resp.status_code == 404
        body = resp.json()
        assert body["title"] == "Not Found"
        assert body["status"] == 404
        assert body["detail"] == "Resource not found"
        assert body["instance"] == "/not-found"
        assert "trace_id" in body

    def test_403_returns_rfc7807(self, client: TestClient):
        resp = client.get("/forbidden")
        assert resp.status_code == 403
        body = resp.json()
        assert body["title"] == "Forbidden"
        assert body["status"] == 403

    def test_unhandled_exception_returns_500(self, client: TestClient):
        resp = client.get("/crash")
        assert resp.status_code == 500
        body = resp.json()
        assert body["title"] == "Internal Server Error"
        assert body["forge_code"] == "INTERNAL_ERROR"
        # Should NOT leak the actual error message
        assert "unexpected failure" not in body["detail"]

    def test_validation_error_returns_422(self, client: TestClient):
        resp = client.post("/validate", content="not json")
        assert resp.status_code == 422
        body = resp.json()
        assert body["title"] == "Validation Error"
        assert body["forge_code"] == "VALIDATION_ERROR"
        assert "errors" in body

    def test_success_not_affected(self, client: TestClient):
        resp = client.get("/ok")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}
