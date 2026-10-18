"""Hub → spoke write-back (BACKLOG FB-054).

``AdapterService`` is one contract with two halves. The hub serves the
spoke-to-hub half (``Register`` … ``Ingest``); a spoke that can accept
writes serves the hub-to-spoke half (``Write``, ``Discover``, ``Health``)
on its own gRPC port and announces that address in its ``Configure``
params as ``grpc_callback_url``.

This module is the hub side of that second half:

* :class:`WriteDispatcher` remembers the callback address per session
  (fed by :class:`~forge.transport.hub_ingest.HubIngestServicer`), dials
  the spoke on demand, enforces the manifest's ``capabilities.write`` and
  keeps per-adapter counters for ``GET /v1/writes``.
* :class:`SpokeCallbackClient` is the typed wrapper over a
  :class:`~forge.transport.spoke_client.TransportChannel` for the three
  spoke-hosted RPCs, so the same code runs over gRPC and in memory.

Nothing here decides *what* to write; modules (OT changeover, operator
actions, the REST passthrough) call ``dispatcher.write(adapter_id,
tag_path, value)`` and get a :class:`WriteOutcome` back, including the
spoke's read-back record when ``confirm`` was requested.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from forge.transport.serialization import proto_to_pydantic
from forge.transport.spoke_client import ChannelTls  # noqa: TC001 — runtime default factory

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Awaitable, Callable, Iterable

    from forge.core.models.contextual_record import ContextualRecord
    from forge.transport.spoke_client import TransportChannel

logger = logging.getLogger(__name__)

#: Configure param a spoke sets to receive hub → spoke RPCs.
CALLBACK_PARAM = "grpc_callback_url"
#: Configure param carrying the spoke-minted callback token (FB-063).
CALLBACK_TOKEN_PARAM = "grpc_callback_token"
#: gRPC metadata key the hub presents the token in.
CALLBACK_TOKEN_HEADER = "x-forge-callback-token"


class WriteDispatchError(Exception):
    """A write could not be dispatched; ``code`` tells the caller why.

    Codes: ``unknown_adapter`` (never registered), ``no_callback`` (the
    spoke did not advertise ``grpc_callback_url`` or has stopped),
    ``not_writable`` (manifest ``capabilities.write`` is false),
    ``transport`` (the spoke could not be reached or answered with an
    RPC error).
    """

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class WriteOutcome:
    """Result of one ``Write`` as seen by the hub."""

    adapter_id: str
    tag_path: str
    success: bool
    message: str = ""
    readback: ContextualRecord | None = None
    requested_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    completed_at: datetime | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "adapter_id": self.adapter_id,
            "tag_path": self.tag_path,
            "success": self.success,
            "message": self.message,
            "readback": self.readback.model_dump(mode="json") if self.readback else None,
            "requested_at": self.requested_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


@dataclass
class CallbackTarget:
    """Where (and how well) the hub can reach one spoke."""

    adapter_id: str
    session_id: str
    url: str
    registered_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    writes: int = 0
    succeeded: int = 0
    failed: int = 0
    last_write_at: datetime | None = None
    last_error: str | None = None
    last_outcome: WriteOutcome | None = None
    #: Shared secret the spoke advertised (``grpc_callback_token``); sent as metadata.
    token: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "adapter_id": self.adapter_id,
            "session_id": self.session_id,
            "url": self.url,
            "token_set": self.token is not None,
            "registered_at": self.registered_at.isoformat(),
            "writes": self.writes,
            "succeeded": self.succeeded,
            "failed": self.failed,
            "last_write_at": self.last_write_at.isoformat() if self.last_write_at else None,
            "last_error": self.last_error,
            "last_outcome": self.last_outcome.to_dict() if self.last_outcome else None,
        }


class SpokeCallbackClient:
    """Typed client for the spoke-hosted half of ``AdapterService``."""

    def __init__(self, channel: TransportChannel, adapter_id: str, session_id: str) -> None:
        self.channel = channel
        self.adapter_id = adapter_id
        self.session_id = session_id

    async def write(self, tag_path: str, value: Any, *, confirm: bool = False) -> dict[str, Any]:
        """``Write`` RPC. Returns ``{success, message, readback: dict | None}``."""
        return await self.channel.send_unary(
            "Write",
            {
                "adapter_id": self.adapter_id,
                "session_id": self.session_id,
                "tag_path": tag_path,
                "value": value,
                "confirm": confirm,
            },
        )

    async def discover(self) -> list[dict[str, Any]]:
        """``Discover`` RPC. Returns the spoke's tag descriptors."""
        response = await self.channel.send_unary(
            "Discover", {"adapter_id": self.adapter_id, "session_id": self.session_id}
        )
        return list(response.get("tags", []))

    async def health(self) -> dict[str, Any]:
        """``Health`` RPC answered by the spoke itself."""
        return await self.channel.send_unary(
            "Health", {"adapter_id": self.adapter_id, "session_id": self.session_id}
        )

    # -- pull RPCs (FB-061) ---------------------------------------------------

    async def backfill(
        self,
        start: datetime,
        end: datetime,
        *,
        tags: Iterable[str] = (),
        max_records: int = 0,
    ) -> AsyncIterator[ContextualRecord]:
        """``Backfill`` RPC: the spoke replays ``[start, end]`` as records."""
        stream = self.channel.receive_stream(
            "Backfill",
            {
                "adapter_id": self.adapter_id,
                "session_id": self.session_id,
                "tags": list(tags),
                "start_time": start,
                "end_time": end,
                "max_records": int(max_records),
            },
        )
        async for item in stream:
            yield proto_to_pydantic(item, "ContextualRecord")

    async def collect(self, *, max_records: int = 0) -> AsyncIterator[ContextualRecord]:
        """``Collect`` RPC (FB-071): the spoke hands over what it has queued for push."""
        stream = self.channel.receive_stream(
            "Collect",
            {
                "adapter_id": self.adapter_id,
                "session_id": self.session_id,
                "max_batch_size": int(max_records),
            },
        )
        async for item in stream:
            yield proto_to_pydantic(item, "ContextualRecord")

    async def subscribe(
        self, tags: Iterable[str] = ()
    ) -> tuple[str, AsyncIterator[ContextualRecord]]:
        """``Subscribe`` RPC: ``(subscription_id, records)``."""
        stream = self.channel.receive_stream(
            "Subscribe",
            {"adapter_id": self.adapter_id, "session_id": self.session_id, "tags": list(tags)},
        )
        first = await anext(stream, None)
        subscription_id = str((first or {}).get("subscription_id") or "")

        async def records() -> AsyncIterator[ContextualRecord]:
            async for item in stream:
                yield proto_to_pydantic(item, "ContextualRecord")

        return subscription_id, records()

    async def unsubscribe(self, subscription_id: str) -> dict[str, Any]:
        """``Unsubscribe`` RPC. Returns ``{success, message}``."""
        return await self.channel.send_unary(
            "Unsubscribe",
            {
                "adapter_id": self.adapter_id,
                "session_id": self.session_id,
                "subscription_id": subscription_id,
            },
        )

    async def close(self) -> None:
        await self.channel.close()


def _callback_metadata(token: str | None) -> list[tuple[str, str]]:
    return [(CALLBACK_TOKEN_HEADER, token)] if token else []


async def _grpc_channel_factory(url: str, tls: ChannelTls | None = None) -> TransportChannel:
    from forge.transport.grpc_channel import GrpcChannel

    channel = GrpcChannel(url, tls=tls)
    await channel.connect()
    return channel


class WriteDispatcher:
    """Route hub-originated writes to the spoke that owns the target.

    Args:
        channel_factory: Opens a :class:`TransportChannel` to a callback
            URL. Defaults to a real gRPC channel; tests inject an
            in-memory one.
        can_write: Returns the adapter's ``capabilities.write`` (``None``
            when the adapter is unknown). Usually backed by the hub's
            adapter registry.
    """

    def __init__(
        self,
        *,
        channel_factory: Callable[[str], Awaitable[TransportChannel]] | None = None,
        can_write: Callable[[str], bool | None] | None = None,
        tls: ChannelTls | None = None,
    ) -> None:
        self._tls = tls
        self._channel_factory = channel_factory or (lambda url: _grpc_channel_factory(url, tls=tls))
        self._can_write = can_write
        self._targets: dict[str, CallbackTarget] = {}
        self._channels: dict[str, TransportChannel] = {}
        self._closing: set[asyncio.Task[None]] = set()

    # -- registration (driven by the hub servicer) ---------------------------

    def register_callback(
        self, adapter_id: str, session_id: str, params: dict[str, str]
    ) -> CallbackTarget | None:
        """Record the callback URL a spoke sent on ``Configure``."""
        url = (params.get(CALLBACK_PARAM) or "").strip()
        if not url:
            if adapter_id in self._targets:
                logger.info("Adapter %s re-configured without a callback; dropping it", adapter_id)
                self.forget(self._targets[adapter_id].session_id)
            return None
        previous = self._targets.get(adapter_id)
        if previous is not None and previous.url != url:
            self._drop_channel(adapter_id)
        token = (params.get(CALLBACK_TOKEN_PARAM) or "").strip() or None
        target = CallbackTarget(adapter_id=adapter_id, session_id=session_id, url=url, token=token)
        channel = self._channels.get(adapter_id)
        if channel is not None:
            channel.set_metadata(_callback_metadata(token))
        if previous is not None:
            target.writes, target.succeeded, target.failed = (
                previous.writes,
                previous.succeeded,
                previous.failed,
            )
        self._targets[adapter_id] = target
        logger.info("Write-back callback for %s: %s (session %s)", adapter_id, url, session_id)
        return target

    def forget(self, session_id: str) -> None:
        """Drop the callback of the session that just stopped."""
        for adapter_id, target in list(self._targets.items()):
            if target.session_id == session_id:
                del self._targets[adapter_id]
                self._drop_channel(adapter_id)
                logger.info("Write-back callback for %s removed", adapter_id)

    def target_for(self, adapter_id: str) -> CallbackTarget | None:
        return self._targets.get(adapter_id)

    # -- dispatch -------------------------------------------------------------

    async def write(
        self, adapter_id: str, tag_path: str, value: Any, *, confirm: bool = False
    ) -> WriteOutcome:
        """Dispatch one write. Raises :class:`WriteDispatchError` when it cannot."""
        target = self._resolve(adapter_id)
        outcome = WriteOutcome(adapter_id=adapter_id, tag_path=tag_path, success=False)
        target.writes += 1
        target.last_write_at = outcome.requested_at
        try:
            client = await self._client(target)
            response = await client.write(tag_path, value, confirm=confirm)
        except Exception as exc:
            target.failed += 1
            target.last_error = f"{type(exc).__name__}: {exc}"
            outcome.message = target.last_error
            outcome.completed_at = datetime.now(UTC)
            target.last_outcome = outcome
            self._drop_channel(adapter_id)
            logger.warning("Write to %s (%s) failed: %s", adapter_id, tag_path, target.last_error)
            raise WriteDispatchError("transport", target.last_error) from exc

        outcome.success = bool(response.get("success"))
        outcome.message = str(response.get("message") or "")
        readback = response.get("readback")
        if readback:
            try:
                outcome.readback = proto_to_pydantic(readback, "ContextualRecord")
            except Exception as exc:  # pragma: no cover - defensive
                outcome.message = f"{outcome.message} (unparseable readback: {exc})".strip()
        outcome.completed_at = datetime.now(UTC)
        if outcome.success:
            target.succeeded += 1
        else:
            target.failed += 1
            target.last_error = outcome.message or "spoke refused the write"
        target.last_outcome = outcome
        logger.info(
            "Write to %s %s: %s (%s)",
            adapter_id,
            tag_path,
            "ok" if outcome.success else "refused",
            outcome.message,
        )
        return outcome

    async def discover(self, adapter_id: str) -> list[dict[str, Any]]:
        """Ask the spoke which tags it exposes (``Discover``)."""
        target = self._resolve(adapter_id, require_write=False)
        try:
            client = await self._client(target)
            return await client.discover()
        except Exception as exc:
            target.last_error = f"{type(exc).__name__}: {exc}"
            self._drop_channel(adapter_id)
            raise WriteDispatchError("transport", target.last_error) from exc

    # -- pull RPCs (FB-061) ---------------------------------------------------

    async def backfill(
        self,
        adapter_id: str,
        start: datetime,
        end: datetime,
        *,
        tags: Iterable[str] = (),
        max_records: int = 0,
    ) -> AsyncIterator[ContextualRecord]:
        """Replay ``[start, end]`` from the spoke (``Backfill``)."""
        target = self._resolve(adapter_id, require_write=False)
        try:
            client = await self._client(target)
            async for record in client.backfill(start, end, tags=tags, max_records=max_records):
                yield record
        except WriteDispatchError:
            raise
        except Exception as exc:
            target.last_error = f"{type(exc).__name__}: {exc}"
            self._drop_channel(adapter_id)
            raise WriteDispatchError("transport", target.last_error) from exc

    async def collect(
        self, adapter_id: str, *, max_records: int = 0
    ) -> AsyncIterator[ContextualRecord]:
        """Pull what the spoke has queued (``Collect``, FB-071); each record once."""
        target = self._resolve(adapter_id, require_write=False)
        try:
            client = await self._client(target)
            async for record in client.collect(max_records=max_records):
                yield record
        except WriteDispatchError:
            raise
        except Exception as exc:
            target.last_error = f"{type(exc).__name__}: {exc}"
            self._drop_channel(adapter_id)
            raise WriteDispatchError("transport", target.last_error) from exc

    async def subscribe(
        self, adapter_id: str, tags: Iterable[str] = ()
    ) -> tuple[str, AsyncIterator[ContextualRecord]]:
        """Open a ``Subscribe`` stream: ``(subscription_id, records)``."""
        target = self._resolve(adapter_id, require_write=False)
        try:
            client = await self._client(target)
            return await client.subscribe(tags)
        except Exception as exc:
            target.last_error = f"{type(exc).__name__}: {exc}"
            self._drop_channel(adapter_id)
            raise WriteDispatchError("transport", target.last_error) from exc

    async def unsubscribe(self, adapter_id: str, subscription_id: str) -> dict[str, Any]:
        target = self._resolve(adapter_id, require_write=False)
        try:
            client = await self._client(target)
            return await client.unsubscribe(subscription_id)
        except Exception as exc:
            target.last_error = f"{type(exc).__name__}: {exc}"
            self._drop_channel(adapter_id)
            raise WriteDispatchError("transport", target.last_error) from exc

    async def close(self) -> None:
        for adapter_id in list(self._channels):
            await self._close_channel(adapter_id)

    def snapshot(self) -> dict[str, Any]:
        return {
            "callback_param": CALLBACK_PARAM,
            "token_param": CALLBACK_TOKEN_PARAM,
            "tls": self._tls.describe() if self._tls is not None else None,
            "targets": [t.to_dict() for t in self._targets.values()],
        }

    # -- internals ------------------------------------------------------------

    def _resolve(self, adapter_id: str, *, require_write: bool = True) -> CallbackTarget:
        target = self._targets.get(adapter_id)
        writable = self._can_write(adapter_id) if self._can_write is not None else None
        if target is None:
            if writable is None and self._can_write is not None:
                raise WriteDispatchError(
                    "unknown_adapter", f"adapter '{adapter_id}' is not registered"
                )
            raise WriteDispatchError(
                "no_callback",
                f"adapter '{adapter_id}' has not advertised '{CALLBACK_PARAM}' "
                "(or its session stopped)",
            )
        if require_write and writable is False:
            raise WriteDispatchError(
                "not_writable", f"adapter '{adapter_id}' is registered without write capability"
            )
        return target

    async def _client(self, target: CallbackTarget) -> SpokeCallbackClient:
        channel = self._channels.get(target.adapter_id)
        if channel is None:
            channel = await self._channel_factory(target.url)
            channel.set_metadata(_callback_metadata(target.token))
            self._channels[target.adapter_id] = channel
        return SpokeCallbackClient(channel, target.adapter_id, target.session_id)

    def _drop_channel(self, adapter_id: str) -> None:
        channel = self._channels.pop(adapter_id, None)
        if channel is None:
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:  # pragma: no cover - no loop, nothing to await
            return
        task = loop.create_task(_close_quietly(channel))
        self._closing.add(task)
        task.add_done_callback(self._closing.discard)

    async def _close_channel(self, adapter_id: str) -> None:
        channel = self._channels.pop(adapter_id, None)
        if channel is not None:
            await _close_quietly(channel)


async def _close_quietly(channel: TransportChannel) -> None:
    try:
        await channel.close()
    except Exception:  # pragma: no cover - best effort
        logger.debug("closing spoke channel failed", exc_info=True)
