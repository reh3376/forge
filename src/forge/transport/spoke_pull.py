"""Hub-side consumers of the spoke-hosted pull RPCs (BACKLOG FB-061).

The hub reaches a spoke through the callback target it advertised on
Configure (see :mod:`forge.transport.spoke_callback`). Two pull modes sit
on top of that:

* :func:`backfill_into_pipeline` — ``Backfill`` for a time range, streamed
  into the :class:`~forge.ingest.pipeline.IngestPipeline` in batches, with
  one ingest-log row per batch (session ``backfill``).
* :func:`collect_into_pipeline` — ``Collect`` (FB-071): a one-shot pull of
  what the spoke has queued for push, each record delivered once (session
  ``collect``).
* :class:`SubscriptionManager` — ``Subscribe`` as a background task per
  subscription: records arrive as the spoke queues them for its own push
  path and are ingested in small batches; ``Unsubscribe`` ends the stream.

All are driven from the hub REST API (``/v1/adapters/{id}/backfill``,
``/v1/adapters/{id}/collect`` and ``/v1/adapters/{id}/subscriptions``).
"""

from __future__ import annotations

import asyncio
import contextlib
import inspect
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Callable, Iterable

    from forge.core.models.adapter import AdapterManifest
    from forge.core.models.contextual_record import ContextualRecord
    from forge.ingest.pipeline import IngestOutcome, IngestPipeline
    from forge.transport.spoke_callback import WriteDispatcher

logger = logging.getLogger(__name__)

BACKFILL_SESSION = "backfill"
COLLECT_SESSION = "collect"


async def _maybe_await(result: Any) -> Any:
    if inspect.isawaitable(result):
        return await result
    return result


# ---------------------------------------------------------------------------
# Backfill
# ---------------------------------------------------------------------------


@dataclass
class PullOutcome:
    """What a backfill (or a subscription so far) delivered."""

    adapter_id: str
    mode: str
    received: int = 0
    accepted: int = 0
    rejected: int = 0
    persisted: int = 0
    failed: int = 0
    batches: int = 0
    errors: list[str] = field(default_factory=list)
    started_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    completed_at: datetime | None = None

    def add(self, outcome: IngestOutcome) -> None:
        self.received += outcome.received
        self.accepted += outcome.accepted
        self.rejected += outcome.rejected
        self.persisted += outcome.persisted
        self.failed += outcome.failed
        self.batches += 1
        self.errors.extend(outcome.errors[:5])

    def to_dict(self) -> dict[str, Any]:
        return {
            "adapter_id": self.adapter_id,
            "mode": self.mode,
            "received": self.received,
            "accepted": self.accepted,
            "rejected": self.rejected,
            "persisted": self.persisted,
            "failed": self.failed,
            "batches": self.batches,
            "errors": list(self.errors[:20]),
            "started_at": self.started_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


async def _pump(
    stream: AsyncIterator[ContextualRecord],
    pipeline: IngestPipeline,
    outcome: PullOutcome,
    *,
    session: str,
    manifest: AdapterManifest | None,
    batch_size: int,
    on_batch: Callable[[str, str, IngestOutcome], Any] | None,
) -> PullOutcome:
    """Ingest ``stream`` in batches, logging each batch under ``session``."""
    batch: list[ContextualRecord] = []

    async def flush() -> None:
        if not batch:
            return
        result = await pipeline.ingest(
            list(batch), adapter_id=outcome.adapter_id, manifest=manifest
        )
        batch.clear()
        outcome.add(result)
        if on_batch is not None:
            try:
                await _maybe_await(on_batch(outcome.adapter_id, session, result))
            except Exception:  # pragma: no cover - logging never blocks the pull
                logger.exception("%s on_batch callback failed for %s", session, outcome.adapter_id)

    try:
        async for record in stream:
            batch.append(record)
            if len(batch) >= max(batch_size, 1):
                await flush()
    finally:
        await flush()
        outcome.completed_at = datetime.now(UTC)
    logger.info(
        "%s from %s: %d received, %d persisted in %d batches",
        session.capitalize(),
        outcome.adapter_id,
        outcome.received,
        outcome.persisted,
        outcome.batches,
    )
    return outcome


async def backfill_into_pipeline(
    dispatcher: WriteDispatcher,
    pipeline: IngestPipeline,
    *,
    adapter_id: str,
    start: datetime,
    end: datetime,
    tags: Iterable[str] = (),
    max_records: int = 0,
    manifest: AdapterManifest | None = None,
    batch_size: int = 100,
    on_batch: Callable[[str, str, IngestOutcome], Any] | None = None,
) -> PullOutcome:
    """Replay ``[start, end]`` from the spoke into the ingest pipeline.

    Raises :class:`~forge.transport.spoke_callback.WriteDispatchError` when
    the spoke cannot be reached; records already ingested stay ingested.
    """
    stream = dispatcher.backfill(adapter_id, start, end, tags=list(tags), max_records=max_records)
    return await _pump(
        stream,
        pipeline,
        PullOutcome(adapter_id=adapter_id, mode="backfill"),
        session=BACKFILL_SESSION,
        manifest=manifest,
        batch_size=batch_size,
        on_batch=on_batch,
    )


async def collect_into_pipeline(
    dispatcher: WriteDispatcher,
    pipeline: IngestPipeline,
    *,
    adapter_id: str,
    max_records: int = 0,
    manifest: AdapterManifest | None = None,
    batch_size: int = 100,
    on_batch: Callable[[str, str, IngestOutcome], Any] | None = None,
) -> PullOutcome:
    """Pull what the spoke has queued for push (``Collect``, FB-071).

    The spoke hands each record over once (it leaves the spoke's push queue),
    so this is the pull-model counterpart of the push ``Ingest`` stream.
    Batches are logged under session ``collect``; ``max_records`` 0 = all.
    """
    stream = dispatcher.collect(adapter_id, max_records=max_records)
    return await _pump(
        stream,
        pipeline,
        PullOutcome(adapter_id=adapter_id, mode="collect"),
        session=COLLECT_SESSION,
        manifest=manifest,
        batch_size=batch_size,
        on_batch=on_batch,
    )


# ---------------------------------------------------------------------------
# Subscriptions
# ---------------------------------------------------------------------------


@dataclass
class SubscriptionHandle:
    adapter_id: str
    subscription_id: str
    tags: list[str]
    outcome: PullOutcome
    buffer: list[ContextualRecord] = field(default_factory=list)
    task: asyncio.Task[None] | None = None
    flusher: asyncio.Task[None] | None = None
    ended: bool = False
    last_error: str | None = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    @property
    def key(self) -> tuple[str, str]:
        return (self.adapter_id, self.subscription_id)

    def to_dict(self) -> dict[str, Any]:
        return {
            **self.outcome.to_dict(),
            "subscription_id": self.subscription_id,
            "tags": list(self.tags),
            "active": not self.ended,
            "buffered": len(self.buffer),
            "last_error": self.last_error,
        }


class SubscriptionManager:
    """Run spoke subscriptions as background tasks feeding the pipeline."""

    def __init__(
        self,
        dispatcher: WriteDispatcher,
        pipeline: IngestPipeline,
        *,
        manifest_for: Callable[[str], AdapterManifest | None] | None = None,
        on_batch: Callable[[str, str, IngestOutcome], Any] | None = None,
        batch_size: int = 50,
        flush_interval: float = 1.0,
    ) -> None:
        self._dispatcher = dispatcher
        self._pipeline = pipeline
        self._manifest_for = manifest_for
        self._on_batch = on_batch
        self._batch_size = max(batch_size, 1)
        self._flush_interval = flush_interval
        self._handles: dict[tuple[str, str], SubscriptionHandle] = {}

    # -- lifecycle ------------------------------------------------------------

    async def start(self, adapter_id: str, tags: Iterable[str] = ()) -> SubscriptionHandle:
        """Open a ``Subscribe`` stream and ingest it until stopped."""
        tag_list = [str(t) for t in tags]
        subscription_id, stream = await self._dispatcher.subscribe(adapter_id, tag_list)
        handle = SubscriptionHandle(
            adapter_id=adapter_id,
            subscription_id=subscription_id,
            tags=tag_list,
            outcome=PullOutcome(adapter_id=adapter_id, mode="subscription"),
        )
        self._handles[handle.key] = handle
        handle.task = asyncio.create_task(
            self._consume(handle, stream), name=f"forge-subscription-{subscription_id}"
        )
        if self._flush_interval > 0:
            handle.flusher = asyncio.create_task(
                self._flush_periodically(handle), name=f"forge-subscription-flush-{subscription_id}"
            )
        logger.info(
            "Subscription %s to %s started (tags=%s)", subscription_id, adapter_id, tag_list
        )
        return handle

    async def stop(self, adapter_id: str, subscription_id: str) -> SubscriptionHandle:
        """Unsubscribe at the spoke (best effort), stop the task, flush what is buffered."""
        handle = self._handles.pop((adapter_id, subscription_id), None)
        if handle is None:
            msg = f"unknown subscription '{subscription_id}' for adapter '{adapter_id}'"
            raise KeyError(msg)
        try:
            await self._dispatcher.unsubscribe(adapter_id, subscription_id)
        except Exception as exc:
            handle.last_error = f"unsubscribe: {type(exc).__name__}: {exc}"
            logger.warning("Unsubscribe %s at %s failed: %s", subscription_id, adapter_id, exc)
        await self._cancel(handle)
        await self._flush(handle)
        handle.ended = True
        handle.outcome.completed_at = datetime.now(UTC)
        return handle

    async def close(self) -> None:
        for key in list(self._handles):
            with contextlib.suppress(Exception):
                await self.stop(*key)

    # -- introspection --------------------------------------------------------

    def get(self, adapter_id: str, subscription_id: str) -> SubscriptionHandle | None:
        return self._handles.get((adapter_id, subscription_id))

    def list(self, adapter_id: str | None = None) -> list[SubscriptionHandle]:
        return [
            h for h in self._handles.values() if adapter_id is None or h.adapter_id == adapter_id
        ]

    def snapshot(self) -> dict[str, Any]:
        return {
            "active": sum(1 for h in self._handles.values() if not h.ended),
            "subscriptions": [h.to_dict() for h in self._handles.values()],
        }

    # -- internals ------------------------------------------------------------

    async def _consume(
        self, handle: SubscriptionHandle, stream: AsyncIterator[ContextualRecord]
    ) -> None:
        try:
            async for record in stream:
                handle.buffer.append(record)
                if len(handle.buffer) >= self._batch_size:
                    await self._flush(handle)
            await self._flush(handle)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            handle.last_error = f"{type(exc).__name__}: {exc}"
            logger.warning(
                "Subscription %s to %s ended with an error: %s",
                handle.subscription_id,
                handle.adapter_id,
                handle.last_error,
            )
        finally:
            handle.ended = True
            handle.outcome.completed_at = datetime.now(UTC)
            if handle.flusher is not None and not handle.flusher.done():
                handle.flusher.cancel()

    async def _flush_periodically(self, handle: SubscriptionHandle) -> None:
        while not handle.ended:
            await asyncio.sleep(self._flush_interval)
            await self._flush(handle)

    async def _flush(self, handle: SubscriptionHandle) -> None:
        async with handle.lock:
            if not handle.buffer:
                return
            batch, handle.buffer = handle.buffer, []
            manifest = self._manifest_for(handle.adapter_id) if self._manifest_for else None
            result = await self._pipeline.ingest(
                batch, adapter_id=handle.adapter_id, manifest=manifest
            )
            handle.outcome.add(result)
            if self._on_batch is not None:
                try:
                    await _maybe_await(
                        self._on_batch(
                            handle.adapter_id, f"subscription:{handle.subscription_id}", result
                        )
                    )
                except Exception:  # pragma: no cover - logging never blocks ingestion
                    logger.exception("subscription on_batch callback failed")

    async def _cancel(self, handle: SubscriptionHandle) -> None:
        for task in (handle.task, handle.flusher):
            if task is not None and not task.done():
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await task
