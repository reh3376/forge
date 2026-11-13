"""The OPC-UA response-header tap: T3 from every service call (one clock, FB-094 step 2)."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import TYPE_CHECKING

import pytest
from asyncua import ua
from asyncua.common.utils import Buffer
from asyncua.ua.ua_binary import struct_to_binary

from forge.modules.ot.opcua_client.clock_tap import (
    ResponseHeaderTap,
    install_response_header_tap,
)

if TYPE_CHECKING:
    from forge.core.clock import ClockSample

T1 = datetime(2026, 6, 1, 12, 0, 0, tzinfo=UTC)
T3 = T1 + timedelta(seconds=2, milliseconds=5)
T4 = T1 + timedelta(milliseconds=10)


def _read_response(sent_by_server_at: datetime) -> Buffer:
    """A ReadResponse the way the wire carries it: TypeId, then the body."""
    response = ua.ReadResponse()  # its TypeId is the struct's first field, as on the wire
    response.ResponseHeader.Timestamp = sent_by_server_at
    return Buffer(struct_to_binary(response))


class _LowLevel:
    """asyncua's UaClient surface the tap wraps."""

    def __init__(self, answer: Buffer) -> None:
        self.answer = answer
        self.calls = 0

    async def _send_request(self, request, timeout=None, message_type=None):
        self.calls += 1
        return self.answer


def _request() -> ua.ReadRequest:
    request = ua.ReadRequest()
    request.RequestHeader.Timestamp = T1
    return request


@pytest.mark.asyncio
async def test_every_response_yields_a_sample_of_the_server_clock() -> None:
    low = _LowLevel(_read_response(T3))
    samples: list[ClockSample] = []
    tap = install_response_header_tap(SimpleNamespace(uaclient=low), samples.append, now=lambda: T4)
    assert tap.installed and low._send_request is tap

    data = await low._send_request(_request(), 5.0)
    assert isinstance(data, Buffer) and low.calls == 1  # the request went through untouched
    assert len(samples) == 1 and tap.samples == 1
    sample = samples[0]
    assert (sample.sent_at, sample.server_time, sample.received_at) == (T1, T3, T4)
    assert sample.service == "ReadRequest"
    assert sample.offset_seconds == pytest.approx(2.0)  # 2.005 - the 5 ms midpoint
    assert sample.uncertainty_seconds == pytest.approx(0.005)

    tap.uninstall()
    assert not tap.installed and low._send_request.__func__ is _LowLevel._send_request


@pytest.mark.asyncio
async def test_an_unreadable_header_is_counted_and_never_breaks_the_request(
    caplog: pytest.LogCaptureFixture,
) -> None:
    low = _LowLevel(Buffer(b"\x01\x00\x02"))  # not a response
    samples: list[ClockSample] = []
    tap = ResponseHeaderTap(low, samples.append, now=lambda: T4).install()
    with caplog.at_level(logging.DEBUG, logger="forge.modules.ot.opcua_client.clock_tap"):
        data = await low._send_request(_request())
    assert data.read(3) == b"\x01\x00\x02" and samples == []
    assert tap.unreadable == 1 and tap.samples == 0
    assert "unreadable" in caplog.text


@pytest.mark.asyncio
async def test_a_failing_sink_is_logged_and_the_request_still_succeeds(
    caplog: pytest.LogCaptureFixture,
) -> None:
    low = _LowLevel(_read_response(T3))

    def explode(sample: ClockSample) -> None:
        raise RuntimeError("sink down")

    tap = ResponseHeaderTap(low, explode, now=lambda: T4).install()
    with caplog.at_level(logging.ERROR, logger="forge.modules.ot.opcua_client.clock_tap"):
        assert isinstance(await low._send_request(_request()), Buffer)
    assert tap.samples == 1 and "clock sink failed" in caplog.text


@pytest.mark.asyncio
async def test_a_request_without_a_header_timestamp_yields_no_sample() -> None:
    low = _LowLevel(_read_response(T3))
    samples: list[ClockSample] = []
    tap = ResponseHeaderTap(low, samples.append, now=lambda: T4).install()
    await low._send_request(SimpleNamespace())  # no RequestHeader at all
    assert samples == [] and tap.unreadable == 1
