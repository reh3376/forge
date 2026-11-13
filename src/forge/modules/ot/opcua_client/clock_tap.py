"""Read the OPC-UA server's clock on every service call (one clock, FB-094 step 2).

OPC UA Part 4 puts the time the client sent a request in ``RequestHeader.Timestamp``
and the time the server sent the response in ``ResponseHeader.Timestamp``, so every
service call carries T1 and T3 of the NTP exchange, and T4 is our receipt. asyncua
decodes each response header and discards it (``UaClient.read`` returns
``response.Results``); :func:`install_response_header_tap` wraps the client's
low-level ``_send_request`` so the header is read off a copy of the response buffer,
the way asyncua's own ``check_answer`` reads it for faults, and handed to a sink as a
:class:`~forge.core.clock.ClockSample`. The tap never touches the request itself: a
header that cannot be read is counted and skipped.

The design is the one-clock record's §4.2 and P-2 (``docs/decisions/one-clock-ot-
source-time.md``, signed 2026-11-03). The explicit ``ServerStatus.CurrentTime`` read
on the probe cadence lives with the supervisor that runs it
(:mod:`forge.modules.ot.control.connections`).
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from asyncua import ua
from asyncua.ua.ua_binary import nodeid_from_binary, struct_from_binary

from forge.core.clock import ClockSample, utc_now

if TYPE_CHECKING:
    from collections.abc import Callable

    from forge.core.clock import ClockSink

logger = logging.getLogger(__name__)


def _aware(stamp: datetime) -> datetime:
    """OPC UA ``DateTime`` is UTC by definition; asyncua hands it back aware, but be sure."""
    return stamp if stamp.tzinfo is not None else stamp.replace(tzinfo=UTC)


class ResponseHeaderTap:
    """The wrapper installed on an asyncua client's ``_send_request``."""

    def __init__(
        self,
        low_level: Any,
        sink: ClockSink,
        *,
        now: Callable[[], datetime] = utc_now,
    ) -> None:
        self._low = low_level
        self._original = low_level._send_request
        self._sink = sink
        self._now = now
        self.samples = 0
        self.unreadable = 0
        self.installed = False

    async def __call__(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        data = await self._original(request, *args, **kwargs)
        received_at = self._now()
        try:
            copy = data.copy()
            nodeid_from_binary(copy)  # the response's TypeId precedes its header
            header = struct_from_binary(ua.ResponseHeader, copy)
            sent_at = getattr(getattr(request, "RequestHeader", None), "Timestamp", None)
            server_time = header.Timestamp
            if not isinstance(sent_at, datetime) or not isinstance(server_time, datetime):
                self.unreadable += 1
                return data
            sample = ClockSample(
                sent_at=_aware(sent_at),
                server_time=_aware(server_time),
                received_at=received_at,
                service=type(request).__name__,
            )
        except Exception:  # the tap never breaks a request
            self.unreadable += 1
            logger.debug(
                "response header tap: %s unreadable", type(request).__name__, exc_info=True
            )
            return data
        self.samples += 1
        try:
            self._sink(sample)
        except Exception:
            logger.exception("clock sink failed on a %s sample", sample.service)
        return data

    def install(self) -> ResponseHeaderTap:
        self._low._send_request = self
        self.installed = True
        return self

    def uninstall(self) -> None:
        if self._low._send_request is self:
            self._low._send_request = self._original
        self.installed = False


def install_response_header_tap(
    ua_client: Any, sink: ClockSink, *, now: Callable[[], datetime] = utc_now
) -> ResponseHeaderTap:
    """Surface T3 from every service response of ``ua_client`` (an ``asyncua.Client``).

    Returns the installed tap; ``tap.uninstall()`` restores the client. T1 is the
    request header's ``Timestamp`` (asyncua sets it when the request is built, which
    precedes the send by the time the request waited for the client's request slot, so
    the round trip, and the uncertainty it bounds, lean long rather than short).
    """
    return ResponseHeaderTap(ua_client.uaclient, sink, now=now).install()
