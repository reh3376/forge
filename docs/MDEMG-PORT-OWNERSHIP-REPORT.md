# Report to the mdemg agent: two MDEMG instances share ports 9999 and 8101

**To:** the coding agent working in `/Users/reh3376/mdemg`
**From:** the coding agent working in `/Users/reh3376/forge` (Claude), at the owner's request
**Date:** 2026-11-15 · **Observed:** 2026-11-14 and 2026-11-15 on the owner's machine (macOS 26.3.2, Docker Desktop engine 29.1.3)
**mdemg source read:** checkout `03c725fc` (branch `reh3376_dev01`); forge's installed CLI is 0.11.0-beta.1
**Status:** open. Nothing was changed in either repository's MDEMG setup; this is a report, not a fix.

**The owner's decision (2026-11-15):** port 9999 is owned by the mdemg repository. Port assignment must be dynamic, not static: when mdemg is run in a repository, at initialization and at start-up, its ports are defined from the ports that are in use. The fix belongs in mdemg and is the mdemg agent's to make; the forge agent only reports.

---

## 1. Summary

Two MDEMG servers answer on port 9999 on the same host, and two neural sidecars on port 8101. Each pair is split by address family, so no bind fails and nothing reports it. Which server a client reaches depends on whether it connects over IPv4 or IPv6. Forge's hooks use `http://localhost:9999`, which resolves to `::1`, so they have been reading and writing the mdemg checkout's server instead of forge's own instance.

The cause is the port availability test: mdemg tests a port with a wildcard bind (`net.Listen("tcp", ":<port>")`), and on macOS a wildcard bind succeeds while another process listens on a specific address of the same port. Docker publishes forge's server on `127.0.0.1:9999`, which is exactly such a listener.

## 2. What is observed

| Port | Listener 1 | Listener 2 |
|---|---|---|
| 9999 | `com.docker.backend`, IPv4 `127.0.0.1:9999`: forge's compose project `mdemg-forge`, service `mdemg` (`${MDEMG_BIND_ADDR:-127.0.0.1}:${MDEMG_PORT}:9999`, `MDEMG_PORT=9999` in forge's `.env`) | `mdemg`, IPv6 `*:9999`: the native server, launchd `com.mdemg.server`, `/Users/reh3376/mdemg/bin/mdemg serve --auto-migrate` |
| 8101 | `com.docker.backend`, `*:8101`: forge's `mdemg-forge-neural-sidecar-1` (`${NEURAL_PORT}:8000`, `NEURAL_PORT=8101`) | `Python`, IPv4 `127.0.0.1:8101`: the native sidecar, launchd `com.mdemg.neural-sidecar` (`uvicorn neural_sidecar.app:app --host 127.0.0.1 --port 8101`) |

Forge's other published ports (3002, 7475, 7688, 5434) have one listener each.

What a client gets on port 9999 (`GET /v1/memory/stats?space_id=forge`, 2026-11-14 after a reboot):

| Address | Server reached | Space `forge` |
|---|---|---|
| `http://127.0.0.1:9999` | forge's container | 9,661 memories, 17,747 observations |
| `http://[::1]:9999` | the native mdemg server | 776 memories, 1,403 observations |
| `http://localhost:9999` | the native mdemg server (`localhost` connects to `::1` first) | the same 776 |

Consequences seen:

- Forge's hooks (`.claude/hooks/*.sh`, `*.py`) build `http://localhost:<port>` from `.mdemg.port`, so session resume, recall and observations for forge go to the native server's `forge` space, not to forge's instance. A session started with "MEMORY RETURNED EMPTY" on 2026-11-14.
- Both listeners return after a reboot (the container is `restart: unless-stopped`, the native server is a launchd agent), so the collision is permanent until something moves.
- Neither server logs or alerts anything, because each bind succeeds.

## 3. Cause

**The availability test cannot see a listener bound to a specific address.** All three allocators test with a wildcard bind:

- `internal/cli/docker.go:286` `FindFreePort`: `net.Listen("tcp", fmt.Sprintf(":%d", preferred))`
- `internal/cli/init.go:1084` `checkPortAvailable` and `:1095` `suggestFreePort`: the same call
- `internal/cli/serve.go:862` `listenWithFallback`: `net.Listen("tcp", cfg.ListenAddr)` with `LISTEN_ADDR=":9999"`, and it scans the range only on `EADDRINUSE`

Go sets `SO_REUSEADDR` on listeners. Verified on this Mac on 2026-11-15 with two sockets carrying the same option:

- with a listener on `127.0.0.1:<port>`, a dual-stack wildcard bind on `[::]:<port>` succeeds;
- with a dual-stack wildcard listener on `[::]:<port>`, a bind on `127.0.0.1:<port>` succeeds, and a client connecting to `127.0.0.1:<port>` is served by the specific listener.

So neither order is refused, and the wildcard test reports a port as free while a loopback-bound listener holds it.

**How each collision came about:**

- **8101.** The native sidecar binds `127.0.0.1:8101`. Forge's `mdemg init --defaults` (2026-10-15) ran the compose allocation at `init.go:786` to `811`, which starts the neural sidecar at 8100 and scans upward. 8101 passed the wildcard test although the native sidecar was on it.
- **9999.** Forge's container has held `127.0.0.1:9999` since its init. The native server, started later by launchd (it had been up 18 days on 2026-11-14), ran `listenWithFallback`; its wildcard bind on `:9999` succeeded, so the fallback range was never scanned. Whether the native server was down when forge was initialised was not established; a wildcard listener on 9999 at that moment would have made `FindFreePort` choose 10000.

**Allocation is frozen after init for a compose instance.** `init` writes the chosen ports into `.env` (`MDEMG_PORT`, `NEURAL_PORT`, ...), `.mdemg.port`, `.mdemg/config.yaml` and `.claude/mcp.json`. After that `docker compose` restarts the containers with the same mapping (on a Docker or host restart, by restart policy) and no mdemg code checks the port again. Only the native `serve` path re-evaluates at start-up, with the blind test above.

**Clients cannot tell which instance they reached.** The hooks resolve the port (`MDEMG_URL` env, then `.mdemg.port`, then `.env`, then a literal 9999) and use `localhost`. Nothing in a response identifies the instance, so a hook that reaches another project's server carries on.

## 4. Suggested fix

1. **One availability test, used everywhere, that sees every listener.** A port is free only if nothing accepts on it on any local address of either family. Bind without `SO_REUSEADDR` on `127.0.0.1`, `::1`, `0.0.0.0` and `::` in turn (or dial `127.0.0.1:<port>` and `[::1]:<port>` and treat a connect as "in use"), and include the ports Docker has published (`docker ps --format '{{.Ports}}'`), since a mapping can exist before its listener does. Replace the three call sites in section 3 with it. A test: start a listener on `127.0.0.1:<p>`, assert the allocator skips `<p>`; the same with `[::1]:<p>` and with a wildcard listener.
2. **Dynamic at start-up as well as at init, for both deployment shapes.** Before a compose instance is brought up (`init`, `upgrade`, `sidecar up`, and a start command for compose instances if there is to be one), re-run the allocation; if a recorded port is held by a process that is not this instance, take the next free one, rewrite `.env`, `.mdemg.port`, `.mdemg/config.yaml` and `.claude/mcp.json` together, and say so on the console and in an alert. Containers restarted by Docker's restart policy bypass the CLI, which is why point 3 is needed too.
3. **Instance identity, checked by every client.** Have `/healthz` (or `/v1/info`) return an instance id that `init` also writes into the project (for example `.mdemg/instance-id`), and have the hooks, the MCP bridge and the CLI compare the two. On a mismatch: fail closed with a message naming both instances and the port, never a silent fallback. This catches any collision whatever the bind semantics.
4. **Address the instance by the address it is published on.** Write host and port into the discovery file (`127.0.0.1:<port>` for the compose default) and have the hooks use it; stop building URLs from `localhost`, and remove the literal `http://localhost:9999` fallbacks in `pre-bash-check.py` and `pre-write-check.py`.
5. **9999 is the mdemg checkout's.** Per the owner's decision, the checkout's own server keeps 9999 and instances in other repositories are allocated dynamically; with point 1 in place the allocator moves them off any port the checkout's server or sidecar holds.
6. **Migration for forge's existing instance,** done by mdemg's tooling and not by hand: re-allocate its ports (on 2026-11-15 the first ports with no listener at all were 10000 for the server and 8103 for the sidecar; 8102 is the llama-server), then decide what to do with the forge observations that went to the native server's `forge` space in the meantime (`mdemg space export` / `import`). How long the hooks have been reaching the native server is not known.

## 5. How to see it

```bash
lsof -nP -iTCP:9999 -sTCP:LISTEN          # two listeners: com.docker (IPv4 127.0.0.1), mdemg (IPv6 *)
lsof -nP -iTCP:8101 -sTCP:LISTEN          # two listeners: com.docker (*), Python (IPv4 127.0.0.1)
curl -s 'http://127.0.0.1:9999/v1/memory/stats?space_id=forge'   # forge's container
curl -s 'http://[::1]:9999/v1/memory/stats?space_id=forge'       # the native server
curl -s -o /dev/null -w '%{remote_ip}\n' http://localhost:9999/healthz   # ::1
```

## 6. Other mdemg defects found the same day

Recorded in forge's `docs/MDEMG-INIT-BUGS.md`; they are mdemg's to fix as well.

- **Bug 12, the LLM endpoint probe opens a new connection on every tick.** `internal/mlxprobe/probe.go` `probeOnce` closes the response body without reading it, so Go's transport cannot reuse the connection: 12 connections a minute per server at the 5 s default, 29 a minute measured to `127.0.0.1:8102` with two servers running. Suggested fix: drain the body before closing it. On 2026-11-14 this rate is what emptied the host's outbound ports once macOS stopped releasing closed connections (Bug 9).
- **Bug 10, the hooks read `space_id` with `grep -oP`,** which macOS `/usr/bin/grep` rejects; the error is discarded and the literal `forge` is used.
- **Bug 9, the "LLM error rate spike" alert and the empty-resume banner do not name the cause.** A host fault (`connect: can't assign requested address`) was reported as an LLM error rate.
