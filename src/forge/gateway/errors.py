"""RFC 7807 Problem Details error responses for Forge Gateway.

Every error returned by the Forge API conforms to RFC 7807
(application/problem+json). This ensures consistent error handling
across all clients and enables structured error processing.

Reference: https://www.rfc-editor.org/rfc/rfc7807
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import FastAPI, Request  # noqa: TC002
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


def problem_response(
    *,
    status: int,
    title: str,
    detail: str = "",
    type_uri: str = "about:blank",
    instance: str = "",
    forge_code: str = "",
    extra: dict[str, Any] | None = None,
) -> JSONResponse:
    """Build an RFC 7807 Problem Details JSON response."""
    body: dict[str, Any] = {
        "type": type_uri,
        "title": title,
        "status": status,
        "detail": detail,
        "instance": instance,
        "trace_id": uuid.uuid4().hex,
        "timestamp": datetime.now(UTC).isoformat(),
    }
    if forge_code:
        body["forge_code"] = forge_code
    if extra:
        body.update(extra)
    return JSONResponse(status_code=status, content=body)


def install_error_handlers(app: FastAPI) -> None:
    """Register global exception handlers that return RFC 7807 responses."""

    @app.exception_handler(StarletteHTTPException)
    async def _http_exception(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        return problem_response(
            status=exc.status_code,
            title=_status_title(exc.status_code),
            detail=detail,
            instance=str(request.url.path),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # Sanitize errors: convert any bytes values to strings for JSON safety
        errors = _sanitize_for_json(exc.errors())
        return problem_response(
            status=422,
            title="Validation Error",
            detail="Request body failed validation.",
            instance=str(request.url.path),
            forge_code="VALIDATION_ERROR",
            extra={"errors": errors},
        )

    @app.exception_handler(Exception)
    async def _unhandled(
        request: Request, exc: Exception
    ) -> JSONResponse:
        logger.exception("Unhandled exception on %s", request.url.path)
        return problem_response(
            status=500,
            title="Internal Server Error",
            detail="An unexpected error occurred.",
            instance=str(request.url.path),
            forge_code="INTERNAL_ERROR",
        )


def _sanitize_for_json(obj: Any) -> Any:
    """Recursively convert non-JSON-serializable values to strings."""
    if isinstance(obj, dict):
        return {k: _sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_for_json(v) for v in obj]
    if isinstance(obj, bytes):
        return obj.decode("utf-8", errors="replace")
    return obj


def _status_title(code: int) -> str:
    """Map common HTTP status codes to short titles."""
    titles = {
        400: "Bad Request",
        401: "Unauthorized",
        403: "Forbidden",
        404: "Not Found",
        405: "Method Not Allowed",
        409: "Conflict",
        422: "Unprocessable Entity",
        429: "Too Many Requests",
        500: "Internal Server Error",
        502: "Bad Gateway",
        503: "Service Unavailable",
    }
    return titles.get(code, "Error")
