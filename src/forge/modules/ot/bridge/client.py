"""Async HTTP client for the Ignition REST API.

Ignition 8.x exposes a REST API under ``/system/`` that allows external
clients to read tag values, browse the tag tree, and query system status.

Key endpoints used:
    POST /system/tag/read        — Batch read tag values
    GET  /system/tag/browse      — Browse tag hierarchy
    GET  /system/status           — Gateway health/version

The client handles:
    - Session-based authentication (login/logout)
    - Batch splitting (max N tags per request)
    - Timeout and retry with exponential backoff
    - Latency tracking per request
"""

from __future__ import annotations

import asyncio
import logging
import math
from datetime import datetime, timezone
from typing import Any, Protocol

from forge.modules.ot.bridge.models import (
    BridgeConfig,
    IgnitionTagResponse,
    IgnitionTagValue,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# HTTP transport protocol (injectable for testing)
# ---------------------------------------------------------------------------


class HttpTransport(Protocol):
    """Async HTTP transport interface.

    The bridge client uses this protocol instead of a concrete HTTP library
    so tests can inject a mock transport without network calls.
    """

    async def post(
        self,
        url: str,
        *,
        json: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        timeout_ms: int = 5000,
    ) -> dict[str, Any]:
        """Send an HTTP POST and return the parsed JSON response."""
        ...

    async def get(
        self,
        url: str,
        *,
        params: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
        timeout_ms: int = 5000,
    ) -> dict[str, Any]:
        """Send an HTTP GET and return the parsed JSON response."""
        ...


# ---------------------------------------------------------------------------
# Ignition REST client
# ---------------------------------------------------------------------------


class IgnitionRestClient:
    """Async client for the Ignition 8.x REST API.

    Usage::

        client = IgnitionRestClient(config, transport)
        await client.connect()
        response = await client.read_tags(["[WHK01]Distillery01/TIT_2010/Out_PV"])
        tags = await client.browse("[WHK01]")
        await client.disconnect()

    The client is stateful: ``connect()`` authenticates and stores the
    session token; ``disconnect()`` invalidates it.
    """

    def __init__(
        self,
        config: BridgeConfig,
        transport: HttpTransport,
    ) -> None:
        self._config = config
        self._transport = transport
        self._base_url = config.gateway_url.rstrip("/")
        self._session_token: str | None = None
        self._connected: bool = False

        # Retry configuration
        self._max_retries: int = 3
        self._base_delay_ms: int = 500

    # ------------------------------------------------------------------
    # Connection lifecycle
    # ------------------------------------------------------------------

    async def connect(self) -> bool:
        """Authenticate with the Ignition gateway.

        Uses the configured username/password to obtain a session token.
        Returns True on success, False on failure.
        """
        if not self._config.username:
            # No auth configured — anonymous access
            self._connected = True
            return True

        try:
            response = await self._transport.post(
                f"{self._base_url}/system/login",
                json={
                    "username": self._config.username,
                    "password": self._config.password,
                },
                timeout_ms=self._config.request_timeout_ms,
            )
            self._session_token = response.get("token") or response.get("sessionId")
            self._connected = True
            logger.info("Connected to Ignition gateway at %s", self._base_url)
            return True
        except Exception:
            logger.exception("Failed to connect to Ignition gateway")
            self._connected = False
            return False

    async def disconnect(self) -> None:
        """Invalidate the session and close the connection."""
        if self._session_token:
            try:
                await self._transport.post(
                    f"{self._base_url}/system/logout",
                    headers=self._auth_headers,
                    timeout_ms=self._config.request_timeout_ms,
                )
            except Exception:
                logger.debug("Logout request failed (non-critical)")

        self._session_token = None
        self._connected = False

    @property
    def is_connected(self) -> bool:
        return self._connected

    @property
    def _auth_headers(self) -> dict[str, str]:
        """HTTP headers with session authentication."""
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self._session_token:
            headers["Authorization"] = f"Bearer {self._session_token}"
        return headers

    # ------------------------------------------------------------------
    # Tag reading
    # ------------------------------------------------------------------

    async def read_tags(self, paths: list[str]) -> IgnitionTagResponse:
        """Read current values for a list of Ignition tag paths.

        Automatically batches large requests according to ``batch_size``.
        Returns a single aggregated IgnitionTagResponse.

        Args:
            paths: Ignition-style tag paths (bracket notation).

        Returns:
            IgnitionTagResponse with values for all requested tags.
        """
        if not paths:
            return IgnitionTagResponse(values=())

        request_time = datetime.now(timezone.utc)
        all_values: list[IgnitionTagValue] = []

        # Split into batches
        batches = _chunk(paths, self._config.batch_size)

        # Execute batches with bounded concurrency
        semaphore = asyncio.Semaphore(self._config.max_concurrent_requests)

        async def _read_batch(batch: list[str]) -> list[IgnitionTagValue]:
            async with semaphore:
                return await self._read_batch_inner(batch)

        tasks = [_read_batch(batch) for batch in batches]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, Exception):
                logger.warning("Batch read failed: %s", result)
                continue
            all_values.extend(result)

        response_time = datetime.now(timezone.utc)

        return IgnitionTagResponse(
            values=tuple(all_values),
            request_time=request_time,
            response_time=response_time,
        )

    async def _read_batch_inner(
        self, paths: list[str]
    ) -> list[IgnitionTagValue]:
        """Execute a single batch tag read with retry."""
        payload = {"paths": paths}

        for attempt in range(self._max_retries):
            try:
                response = await self._transport.post(
                    f"{self._base_url}/system/tag/read",
                    json=payload,
                    headers=self._auth_headers,
                    timeout_ms=self._config.request_timeout_ms,
                )
                return _parse_tag_response(paths, response)
            except Exception as e:
                if attempt < self._max_retries - 1:
                    delay = self._base_delay_ms * (2 ** attempt) / 1000.0
                    logger.debug(
                        "Tag read attempt %d failed, retrying in %.1fs: %s",
                        attempt + 1, delay, e,
                    )
                    await asyncio.sleep(delay)
                else:
                    raise

        return []  # pragma: no cover — unreachable after raise

    # ------------------------------------------------------------------
    # Tag browsing
    # ------------------------------------------------------------------

    async def browse(
        self,
        root_path: str = "",
        *,
        recursive: bool = False,
    ) -> list[dict[str, Any]]:
        """Browse the Ignition tag tree from a root path.

        Args:
            root_path: Starting path (empty string = top level).
            recursive: If True, recursively browse all children.

        Returns:
            List of tag node dicts with name, path, type, has_children.
        """
        results: list[dict[str, Any]] = []
        await self._browse_recursive(root_path, results, recursive)
        return results

    async def _browse_recursive(
        self,
        path: str,
        results: list[dict[str, Any]],
        recursive: bool,
    ) -> None:
        """Internal recursive browse implementation."""
        try:
            response = await self._transport.get(
                f"{self._base_url}/system/tag/browse",
                params={"path": path} if path else None,
                headers=self._auth_headers,
                timeout_ms=self._config.request_timeout_ms,
            )
        except Exception:
            logger.warning("Browse failed at path: %s", path)
            return

        nodes = response.get("nodes", response.get("results", []))
        for node in nodes:
            node_info = {
                "name": node.get("name", ""),
                "path": node.get("path", node.get("fullPath", "")),
                "type": node.get("tagType", node.get("type", "Unknown")),
                "has_children": node.get("hasChildren", False),
                "data_type": node.get("dataType", ""),
            }
            results.append(node_info)

            if recursive and node_info["has_children"]:
                child_path = node_info["path"] or f"{path}/{node_info['name']}"
                await self._browse_recursive(child_path, results, recursive)

    # ------------------------------------------------------------------
    # Gateway status
    # ------------------------------------------------------------------

    async def get_status(self) -> dict[str, Any]:
        """Query Ignition gateway health status.

        Returns:
            Dict with gateway_name, version, uptime, cpu, memory fields.
        """
        try:
            return await self._transport.get(
                f"{self._base_url}/system/status",
                headers=self._auth_headers,
                timeout_ms=self._config.request_timeout_ms,
            )
        except Exception:
            logger.warning("Gateway status check failed")
            return {"status": "unreachable"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_tag_response(
    paths: list[str],
    response: dict[str, Any],
) -> list[IgnitionTagValue]:
    """Parse the Ignition REST API tag read response.

    Ignition returns results in the same order as the requested paths.
    The response shape is::

        {
          "results": [
            {"value": 72.5, "quality": "Good", "timestamp": 1712678400000, "dataType": "Float8"},
            ...
          ]
        }
    """
    results_list = response.get("results", response.get("values", []))
    values: list[IgnitionTagValue] = []

    for i, path in enumerate(paths):
        if i < len(results_list):
            data = results_list[i] if isinstance(results_list[i], dict) else {}
            values.append(IgnitionTagValue.from_api_response(path, data))
        else:
            # Missing entry — mark as BAD
            from forge.modules.ot.bridge.models import IgnitionQuality
            values.append(
                IgnitionTagValue(
                    path=path,
                    quality=IgnitionQuality.BAD_NOT_FOUND,
                )
            )

    return values


def _chunk(items: list[str], size: int) -> list[list[str]]:
    """Split a list into chunks of at most ``size`` items."""
    if size <= 0:
        return [items]
    return [items[i : i + size] for i in range(0, len(items), size)]
