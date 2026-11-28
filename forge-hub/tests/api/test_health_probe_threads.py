"""The health probes' threads, with the real S3 client and real sockets (FB-326).

A store that accepted a connection and never answered left a thread behind on every health
call: the probe was given up after the check's limit, and its thread stayed on the S3
library's own five minutes, on the pool the whole hub shares. When that pool was full, the
hub could not resolve a host name.

``test_health_probes_exhaustive.py`` holds the orchestrator's rule on every sequence in a
bound, with stand-in probes. This file holds the parts that only real threads show: the real
client gives up at its limit, a silent store holds one thread and none of the hub's pool,
the health module has no path to that pool, and a probe that never returns does not hold
the process open.
"""

from __future__ import annotations

import ast
import asyncio
import socket
import subprocess
import sys
import threading
import time
from functools import partial
from pathlib import Path
from typing import TYPE_CHECKING

import pytest

from forge_hub.api import health
from forge_hub.api.health import HealthOrchestrator, probe_object_store
from forge_hub.storage.object_store_check import client_for

if TYPE_CHECKING:
    from collections.abc import Callable, Iterator


@pytest.fixture
def silent_store() -> Iterator[str]:
    """A listener that accepts every connection and never answers, as a store behind a
    dropped route or a hung process does."""
    server = socket.socket()
    server.bind(("127.0.0.1", 0))
    server.listen(256)
    server.settimeout(0.05)
    held: list[socket.socket] = []
    stop = threading.Event()

    def accept() -> None:
        while not stop.is_set():
            try:
                held.append(server.accept()[0])
            except TimeoutError:
                continue
            except OSError:
                return

    thread = threading.Thread(target=accept, daemon=True)
    thread.start()
    yield f"127.0.0.1:{server.getsockname()[1]}"
    stop.set()
    thread.join(timeout=2)
    for connection in held:
        connection.close()
    server.close()


@pytest.fixture
def refusing_store() -> str:
    """An address nothing listens on: a connection is refused at once."""
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return f"127.0.0.1:{probe.getsockname()[1]}"


def probe_threads() -> list[threading.Thread]:
    return [t for t in threading.enumerate() if t.name.startswith("forge-health-")]


def shared_pool_threads() -> set[threading.Thread]:
    return {t for t in threading.enumerate() if t.name.startswith("asyncio_")}


def waited(call: Callable[[], object], patience: float = 8.0) -> tuple[float, str]:
    """Make a blocking call on a daemon thread: how long it took, and what it raised.

    A call still waiting after ``patience`` seconds fails the test at once. Without that, a
    client back on the library's own limits would hold this test for half an hour.
    """
    raised: list[str] = []

    def run() -> None:
        try:
            call()
            raised.append("")
        except Exception as exc:
            raised.append(f"{type(exc).__name__}: {exc}")

    began = time.monotonic()
    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    thread.join(patience)
    if thread.is_alive():
        pytest.fail(f"the call was still waiting on the store after {patience:g} s")
    return time.monotonic() - began, raised[0]


def test_the_real_client_gives_up_on_a_silent_store_at_its_limit(silent_store: str) -> None:
    client = client_for(silent_store, "forge", "secret", limit=0.3)
    took, raised = waited(client.list_buckets)
    assert "timed out" in raised.lower() or "timeout" in raised.lower(), raised
    assert 0.25 <= took < 2.0  # the library's own limit is 300 s, six times over


def test_the_real_client_asks_a_refusing_store_once(refusing_store: str) -> None:
    client = client_for(refusing_store, "forge", "secret", limit=3.0)
    took, raised = waited(client.list_buckets)
    assert "refused" in raised.lower() or "connection" in raised.lower(), raised
    assert took < 1.0  # the library's five retries back off for six seconds


@pytest.mark.asyncio
async def test_a_silent_store_holds_one_thread_and_none_of_the_hubs_pool(
    silent_store: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(health, "_CHECK_TIMEOUT", 0.3)
    loop = asyncio.get_running_loop()
    orchestrator = HealthOrchestrator()
    orchestrator.register_blocking(
        "object-store", partial(probe_object_store, silent_store, "forge", "secret")
    )
    pool_before = shared_pool_threads()
    most = 0
    watching = True

    async def watch() -> None:
        nonlocal most
        while watching:
            most = max(most, len(probe_threads()))
            await asyncio.sleep(0.01)

    watcher = asyncio.create_task(watch())
    for _ in range(4):  # forty health calls: more than the shared pool has threads
        answers = await asyncio.gather(*(orchestrator.check_all() for _ in range(10)))
        assert {a.components["object-store"]["status"] for a in answers} == {"unreachable"}
    watching = False
    await watcher

    assert most == 1, f"{most} probe threads at once for one component"
    assert shared_pool_threads() == pool_before, "a health call ran on the shared pool"
    # and the pool does the hub's other work: a blocking call, and a name lookup
    assert await asyncio.wait_for(loop.run_in_executor(None, lambda: "ran"), timeout=2) == "ran"
    assert await asyncio.wait_for(loop.getaddrinfo("localhost", 80), timeout=2)


# -- no path to the shared pool ------------------------------------------------

SHARED_POOL = {"run_in_executor", "to_thread", "set_default_executor", "ThreadPoolExecutor"}


def shared_pool_uses(source: str) -> list[str]:
    """Every name in ``source`` through which code reaches the loop's pool or makes a pool."""
    found = []
    for node in ast.walk(ast.parse(source)):
        name = getattr(node, "attr", None) or getattr(node, "id", None)
        if isinstance(node, ast.Attribute | ast.Name) and name in SHARED_POOL:
            found.append(f"line {node.lineno}: {name}")
    return found


def thread_starts(source: str) -> list[tuple[str, object]]:
    """Each ``Thread(...)`` in ``source``: the function it is in, and its ``daemon`` argument."""
    tree = ast.parse(source)
    starts = []
    for function in ast.walk(tree):
        if not isinstance(function, ast.FunctionDef | ast.AsyncFunctionDef):
            continue
        for node in function.body:
            for call in ast.walk(node):
                named = getattr(getattr(call, "func", None), "attr", None) or getattr(
                    getattr(call, "func", None), "id", None
                )
                if isinstance(call, ast.Call) and named == "Thread":
                    daemon = next(
                        (ast.literal_eval(k.value) for k in call.keywords if k.arg == "daemon"),
                        None,
                    )
                    starts.append((function.name, daemon))
    return starts


def test_the_health_module_has_no_path_to_the_shared_pool() -> None:
    """By reading the module: a probe cannot be put on the event loop's pool by a later edit
    without this failing, and the one place that starts a thread starts a daemon."""
    source = Path(health.__file__).read_text(encoding="utf-8")
    assert shared_pool_uses(source) == []
    assert set(thread_starts(source)) == {("_in_its_own_thread", True)}


def test_the_reading_sees_what_it_refuses() -> None:
    before = "async def check():\n    await loop.run_in_executor(None, probe)\n"
    assert shared_pool_uses(before) == ["line 2: run_in_executor"]
    assert shared_pool_uses("await asyncio.to_thread(probe)\n") == ["line 1: to_thread"]
    held = "def start():\n    threading.Thread(target=run).start()\n"
    assert thread_starts(held) == [("start", None)]


# -- a probe that never returns does not hold the process ----------------------

NEVER_RETURNS = """
import asyncio, threading
from forge_hub.api import health

health._CHECK_TIMEOUT = 0.2
orchestrator = health.HealthOrchestrator()
orchestrator.register_blocking("object-store", threading.Event().wait)
print(asyncio.run(orchestrator.check_all()).components["object-store"]["status"], flush=True)
"""


def test_a_probe_that_never_returns_does_not_hold_the_process() -> None:
    """The hub can stop while a probe is still out: its thread is a daemon. On the shared
    pool, the interpreter waited for it at exit."""
    try:
        done = subprocess.run(
            [sys.executable, "-c", NEVER_RETURNS],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )
    except subprocess.TimeoutExpired:
        pytest.fail("the process was still running 20 s after its one health call was answered")
    assert done.returncode == 0, done.stderr
    assert done.stdout.strip() == "unreachable"
