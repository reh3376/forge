---
name: verify-hub-health-probes
description: "Check a change to the hub's health probes (one probe in flight per component, every health call answered at the check's limit and never from an older answer, blocking probes on threads of their own, the S3 client's limit and certificate checking) against every sequence in a bound. Use when a change touches forge-hub/src/python/forge_hub/api/health.py (HealthOrchestrator, _InFlight, _in_its_own_thread, _CHECK_TIMEOUT, probe_kafka, probe_object_store), the health registrations in forge-hub/src/python/forge_hub/api/main.py, or client_for in forge-hub/src/python/forge_hub/storage/object_store_check.py; when a component's probe is added; when the minio or urllib3 version moves; or for 'can a dependency stall the hub', 'is this probe safe', 'verify the health probes'."
---

# Verify the hub's health probes

## The promise and the harm

**Promise:** one dependency's state never stops the hub. In four statements:

1. A component never has more than one probe in flight, however many health calls arrive and whenever they arrive, leave, or their probes end.
2. Every health call is answered by the check's limit, which runs from the start of the probe it waits on, and a component is never reported ok from an answer that came before the call.
3. A probe whose client blocks never runs on the event loop's shared thread pool. It runs on a daemon thread that the health module starts.
4. The S3 client is always built with a limit its caller gives and makes one attempt. Its certificate checking is the S3 library's own.

**Harm if it breaks:** a store that accepts a connection and never answers takes the hub's shared thread pool. The hub can then resolve no host name and run no other blocking call, and it does not stop cleanly. This happened (BACKLOG FB-326): 22 health calls against a silent store left all 22 threads waiting on the S3 library's own limits of five minutes.

## Does your change touch it

Run the check when a change touches any of these.

| File | What the check covers in it |
|---|---|
| `forge-hub/src/python/forge_hub/api/health.py` | `HealthOrchestrator` (`register`, `register_blocking`, `_run_check`, `_probe_for`, `_answer_within`, `_not_returned`, `_bounded`, `_from_thread`, `_end`), `_InFlight`, `_in_its_own_thread`, `_CHECK_TIMEOUT`, `probe_kafka`, `probe_object_store`; and that the module names no shared pool at all |
| `forge-hub/src/python/forge_hub/api/main.py` | which components are registered with `register` and which with `register_blocking` (read at the sync commit; not explored) |
| `forge-hub/src/python/forge_hub/storage/object_store_check.py` | `client_for`: the required limit, one attempt, the library's certificate settings untouched |
| `uv.lock` (`minio`, `urllib3`) | `client_for` narrows two settings on the connection pool the S3 library builds; a version that moves them is seen by the tests below |

**Sync commit:** this change (2026-11-27, FB-326; the commit is named here after its pull request merges). See what changed since:

```bash
git log --oneline <sync>..HEAD -- forge-hub/src/python/forge_hub/api/health.py forge-hub/src/python/forge_hub/api/main.py forge-hub/src/python/forge_hub/storage/object_store_check.py
```

If that prints commits you did not check, the verification needs a look before you trust a pass: read "When the code changes on purpose". Move the sync commit forward only after you have confirmed that the check still describes the code at the new commit.

## Run it

```bash
uv run pytest forge-hub/tests/api/test_health_probes_exhaustive.py forge-hub/tests/api/test_health_probe_threads.py forge-hub/tests/api/test_health.py forge-hub/tests/storage/test_object_store_check.py -q
```

About eight seconds. It needs nothing beyond the project's locked dependencies, and no running service. The expected result at the sync commit is `86 passed`.

The deeper run, about half a minute, for a change to the orchestrator itself:

```bash
export FORGE_HEALTH_PROBES_DEPTH=7
uv run pytest forge-hub/tests/api/test_health_probes_exhaustive.py -q
```

## What it does

It is not a model. `test_health_probes_exhaustive.py` drives the real `HealthOrchestrator` on an event loop whose clock moves only when the test moves it, with two stand-in components whose probes end when the test says so: `db` is an async check, as the Postgres, TimescaleDB, Neo4j, Redis and RabbitMQ checks are, and `store` is a blocking probe, as Kafka's and the object store's are. After every step it compares what the orchestrator did with `Promise`, a statement of statements 1 and 2 that shares no code with it.

- **Every sequence** of these steps up to the depth (5 by default: 2,385 sequences; 7 in the deeper run: 64,035): a health call arrives; the oldest waiting caller goes away; one second passes; three seconds pass, which is the limit to the second; the `db` probe answers or fails; the `store` probe answers or fails. A probe that is given no ending never ends.
- **Compared after every step:** when each probe started, how many are in flight, which calls are answered, and what each reported for each component.
- **Able to fail:** five broken orchestrators must each give a counterexample: every call starts its own probe; a caller that leaves ends the probe others wait on; the place is freed at the limit while a blocking probe is still out; the last ok is remembered; a late call waits a full limit again.
- **The threads** (`test_health_probe_threads.py`), with the real S3 client and real sockets: the client gives up on a listener that accepts and never answers at its limit, and asks a refusing address once; forty health calls against that listener hold one thread named `forge-health-object-store` and none of the shared pool, which still runs a blocking call and resolves a name; the health module is read as a syntax tree for any name that reaches the shared pool, and for any thread that is not the one daemon; a probe that never returns does not hold a process open.
- **The client** (`test_object_store_check.py`): `client_for` cannot be called without a limit or with one that is not a finite time above zero, and its connection pool differs from one the library builds by itself only in the limit and the retries, with and without TLS and with and without a site's own CA file.
- **History:** the fault was found by a blast-radius check of FB-314, by running the hub's real probe against a silent listener. The fix was then run on the real hub app against the pinned object store image, paused so that it accepted connections and never answered: forty health calls were each answered in 3.0 s, one probe thread, the shared pool ran only name lookups, and the store was reported ok again 3 s after it resumed.

**Bounds:** one async component and one blocking component, at most three health calls in a sequence, sequences of 5 or 7 steps, time moving by one or three seconds. A pass covers these bounds. It does not prove the promise for every number of callers or components; the rule is per component and the components share no state, which is why two stand for seven.

## Reading a failure

A failure is told as the steps taken and what differed:

```
after [call, +3, call]: store probes started at [1000.0, 1003.0]; promised [1000.0]
```

The clock starts at 1000, so this reads: a call arrived, three seconds passed, a second call arrived, and a second `store` probe was started while the first was still out. Other forms: `2 store probes in flight at once`, `call 1 is still waiting; promised {...}`, `call 1 reported {...}; promised {...}`, `call 1 ended without an answer`.

**A real bug or a wrong check?** Replay the steps by hand against the four statements above.

- The steps show two probes of one component out together, a call not answered at its limit, an ok that no probe gave during the call, or a caller's leaving that changed another call's answer: **the code is wrong.** Report it with the counterexample. Do not change the check to make it pass.
- The steps are allowed by a rule you changed on purpose (for example a per-component limit, or an answer that may be reused for a stated time): **the check is out of date.** Go to "When the code changes on purpose".
- `test_an_orchestrator_that_breaks_the_promise_is_caught` fails with "kept the promise on every sequence": the check has lost its ability to fail. That is a defect in the check; fix it before trusting any pass.
- `test_every_sequence_keeps_the_promise` fails on the count of sequences: the steps or the bounds changed. Read the new count from the message and update `SEQUENCES` only after confirming the change was meant.
- `test_the_health_module_has_no_path_to_the_shared_pool` fails: a probe was put on the event loop's pool, or a thread was started outside `_in_its_own_thread` or without `daemon=True`. Register a blocking probe with `register_blocking`.
- `test_the_clients_certificate_checking_is_the_librarys_own` fails after a version change of `minio` or `urllib3`: read the library's constructor. Certificate checking must stay required; if the library renamed or moved a setting, `client_for` is what to bring in line, and never by weakening the test.

## When the code changes on purpose

1. Change the statement of the promise first: `Promise.can` and `Promise.apply` in `forge-hub/tests/api/test_health_probes_exhaustive.py`. Keep it independent: write what must be true from the steps alone, and do not call the orchestrator's code from it.
2. If the change adds something that can happen, add it to `STEPS`, `Promise.apply` and `World.step`.
3. Add a broken orchestrator for each new rule to `BROKEN`, so the new rule is seen failing.
4. A new component: an async check is registered with `register`; a client that blocks is a plain function registered with `register_blocking`, and carries its own limit where its library allows one.
5. Run both commands above. Then make a scratch change in the real code that breaks the new rule, see the check fail with a readable counterexample, and undo the scratch change.
6. Update the table of covered files and move the sync commit to the commit you confirmed.

## What it does not cover

- **Name lookups by the async checks.** asyncio resolves a host name on the shared pool. With name resolution itself hung, each async probe leaves a lookup there for the resolver's own time (BACKLOG FB-327). The blocking probes do not use the pool.
- **How long a blocking probe's thread lives.** A client's limits bound a connect and the gap between bytes read, not a name lookup or a store that sends a byte now and then. The promise is about the number of threads, one per component, not their age: such a component is reported unreachable until its probe ends.
- **The real Kafka client**, and every real component other than the object store.
- **`/readyz`:** it answers 503 only when no component is reachable. That rule is not part of this check.
- **The capability check's total time** (`python -m forge_hub.storage.object_store_check`): each of its calls has a limit, the run as a whole has none (BACKLOG FB-322).
- More than one hub replica, and any size beyond the bounds above.
