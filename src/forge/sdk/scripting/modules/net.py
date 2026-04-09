"""forge.net — HTTP client SDK module.

Replaces Ignition's ``system.net.httpGet()``, ``system.net.httpPost()``, etc.
with a modern async HTTP client backed by httpx.

All requests are async, typed, and include configurable timeout/retry.

Usage in scripts::

    import forge

    resp = await forge.net.http_get("https://api.example.com/data")
    resp = await forge.net.http_post("https://api.example.com/webhook", json={"key": "value"})
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger("forge.net")


@dataclass(frozen=True)
class HttpResponse:
    """Result of an HTTP request."""

    status_code: int
    headers: dict[str, str]
    body: str
    json_data: Any = None
    elapsed_ms: float = 0.0

    @property
    def ok(self) -> bool:
        return 200 <= self.status_code < 300

    def json(self) -> Any:
        """Return parsed JSON body."""
        if self.json_data is not None:
            return self.json_data
        import json
        return json.loads(self.body)


class NetModule:
    """The forge.net SDK module — async HTTP client."""

    def __init__(self) -> None:
        self._client: Any = None  # httpx.AsyncClient, set via bind()
        self._default_timeout: float = 30.0
        self._max_retries: int = 3

    def bind(self, client: Any = None, timeout: float = 30.0, max_retries: int = 3) -> None:
        """Bind an HTTP client. If None, creates one on first use."""
        self._client = client
        self._default_timeout = timeout
        self._max_retries = max_retries
        logger.debug("forge.net bound (timeout=%ss, retries=%d)", timeout, max_retries)

    async def _get_client(self) -> Any:
        """Get or lazily create the HTTP client."""
        if self._client is None:
            try:
                import httpx
                self._client = httpx.AsyncClient(timeout=self._default_timeout)
            except ImportError:
                raise RuntimeError(
                    "httpx is required for forge.net. "
                    "Install with: pip install httpx"
                )
        return self._client

    async def _request(
        self,
        method: str,
        url: str,
        *,
        json: Any = None,
        data: Any = None,
        headers: dict[str, str] | None = None,
        params: dict[str, Any] | None = None,
        timeout: float | None = None,
    ) -> HttpResponse:
        """Execute an HTTP request with retry logic."""
        client = await self._get_client()
        import time

        last_exc: Exception | None = None
        for attempt in range(self._max_retries):
            try:
                start = time.monotonic()
                resp = await client.request(
                    method,
                    url,
                    json=json,
                    data=data,
                    headers=headers,
                    params=params,
                    timeout=timeout or self._default_timeout,
                )
                elapsed = (time.monotonic() - start) * 1000

                json_data = None
                content_type = resp.headers.get("content-type", "")
                if "json" in content_type:
                    try:
                        json_data = resp.json()
                    except Exception:
                        pass

                return HttpResponse(
                    status_code=resp.status_code,
                    headers=dict(resp.headers),
                    body=resp.text,
                    json_data=json_data,
                    elapsed_ms=elapsed,
                )
            except Exception as exc:
                last_exc = exc
                if attempt < self._max_retries - 1:
                    import asyncio
                    await asyncio.sleep(0.5 * (attempt + 1))
                    logger.warning(
                        "HTTP %s %s attempt %d failed: %s",
                        method, url, attempt + 1, exc,
                    )

        raise ConnectionError(
            f"HTTP {method} {url} failed after {self._max_retries} attempts: {last_exc}"
        )

    async def http_get(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        params: dict[str, Any] | None = None,
        timeout: float | None = None,
    ) -> HttpResponse:
        """Perform an HTTP GET request."""
        return await self._request("GET", url, headers=headers, params=params, timeout=timeout)

    async def http_post(
        self,
        url: str,
        *,
        json: Any = None,
        data: Any = None,
        headers: dict[str, str] | None = None,
        timeout: float | None = None,
    ) -> HttpResponse:
        """Perform an HTTP POST request."""
        return await self._request("POST", url, json=json, data=data, headers=headers, timeout=timeout)

    async def http_put(
        self,
        url: str,
        *,
        json: Any = None,
        data: Any = None,
        headers: dict[str, str] | None = None,
        timeout: float | None = None,
    ) -> HttpResponse:
        """Perform an HTTP PUT request."""
        return await self._request("PUT", url, json=json, data=data, headers=headers, timeout=timeout)

    async def http_delete(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        timeout: float | None = None,
    ) -> HttpResponse:
        """Perform an HTTP DELETE request."""
        return await self._request("DELETE", url, headers=headers, timeout=timeout)

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client is not None:
            await self._client.aclose()
            self._client = None


# Module-level singleton
_instance = NetModule()

http_get = _instance.http_get
http_post = _instance.http_post
http_put = _instance.http_put
http_delete = _instance.http_delete
bind = _instance.bind
close = _instance.close
