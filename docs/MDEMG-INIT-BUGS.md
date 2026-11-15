# MDEMG `init` Bugs — Docker Compose Template

**MDEMG version:** 0.5.1 (commit 8858ac6, built 2026-04-02)  
**Discovered:** 2026-04-12 during `mdemg init --defaults` in the `forge` repo  
**Template file:** `/opt/homebrew/Cellar/mdemg/0.5.1/share/mdemg/docker-compose.yml`

---

## Bug 1: neural-sidecar uses `build:` instead of `image:`

**File:** `share/mdemg/docker-compose.yml` (the template copied by `mdemg init`)  
**Line:** 140

**Current (broken):**
```yaml
  neural-sidecar:
    build: ./neural
```

**Expected:**
```yaml
  neural-sidecar:
    image: ghcr.io/reh3376/mdemg-neural-sidecar:${MDEMG_VERSION:-latest}
```

**Impact:** `mdemg init` fails with exit code 1 on every fresh project:
```
unable to prepare context: path "<project-dir>/neural" not found
Error: docker compose up failed: exit status 1
```
The `./neural` build context only exists in the MDEMG source repo, not in target projects. The pre-built image `ghcr.io/reh3376/mdemg-neural-sidecar` is already published to GHCR and available — the template just needs to reference it.

**Root cause:** The template was likely copied from the MDEMG dev docker-compose (where `build: ./neural` is correct for development) but wasn't updated for the distribution/install template.

---

## Bug 2: Grafana mounts host volumes from paths that don't exist in target projects

**File:** `share/mdemg/docker-compose.yml`  
**Lines:** 170-173

**Current (broken):**
```yaml
  grafana:
    volumes:
      - grafana_data:/var/lib/grafana
      - ./deploy/docker/grafana/provisioning/datasources:/etc/grafana/provisioning/datasources:ro
      - ./deploy/docker/grafana/provisioning/dashboards:/etc/grafana/provisioning/dashboards:ro
      - ./deploy/docker/grafana/provisioning/alerting:/etc/grafana/provisioning/alerting:ro
      - ./deploy/docker/grafana/dashboards:/etc/grafana/dashboards:ro
```

**Impact:** Grafana will fail to start in target projects because `./deploy/docker/grafana/...` doesn't exist. This doesn't currently block `mdemg init` (since Grafana isn't a dependency of the `mdemg` service), but attempting `docker compose up -d grafana` will fail.

**Suggested fix options:**
1. Bundle the provisioning files into a published `ghcr.io/reh3376/mdemg-grafana` image with the dashboards baked in
2. Have `mdemg init` copy the provisioning files from the Homebrew share directory into `.mdemg/grafana/` and mount from there
3. Make the Grafana service conditional (commented out or behind a `--with-grafana` flag)

---

## Workaround Applied

For the forge instance, the local `docker-compose.yml` was patched to use the image reference. Grafana was left disabled (not started).

---

## Bug 3: `init` starts the server container without verifying the LLM runtime is reachable

**MDEMG version:** 0.11.0-beta.1 (commit 3c2de7c9, built 2026-08-06)
**Discovered:** 2026-10-15 during `mdemg init --defaults` in the `forge` repo

**What happened:** `init` reported "MDEMG Docker deployment ready!" but the server
container (`mdemg-forge-mdemg-1`) was in a restart loop. Its preflight check requires
the llama-server LLM runtime (Phase 13.5) and was probing `http://127.0.0.1:8102/v1/models`
*inside the container*, where nothing listens:

```
Error: preflight: LLM endpoint unreachable at http://127.0.0.1:8102/v1/models — mdemg requires its LLM runtime to be up at all times (Phase 13.5: llama-server).
```

The managed runtime (`com.mdemg.llama-server`, launchd) was running on the host the whole
time, and the Ollama model blobs it serves were present.

**Two contributing causes:**

1. `init` printed "Using existing docker-compose.yml" and kept the project's older compose
   file, which predates the `LLM_ENDPOINT` variable. The 0.11.0 template
   (`/opt/homebrew/Cellar/mdemg/0.11.0-beta.1/share/mdemg/docker-compose.yml`) passes
   `LLM_ENDPOINT: "${LLM_ENDPOINT:-http://host.docker.internal:8102/v1}"`, along with
   ~40 other newer variables (`JIMINY_*`, `J17_*`, `AUTO_MIGRATE`, `ALERT_*`), none of which
   reach the container when the stale compose file is reused.
2. `init` does not run the same preflight the server runs. It waited 30 s for `/healthz`,
   printed a warning, and still declared the deployment ready. It never checked that the
   LLM runtime (llama-server / Ollama) was up, or that the container could reach it.

**Also observed:** `init --defaults` rewrote `.mdemg/config.yaml`, replacing the project's
existing `llm`, `embedding` and `jiminy` sections with `provider: disabled`, `embedding: {}`
and `jiminy.enabled: false`. The Jiminy section had to be restored by hand. Note that the April-era
config named OpenAI cloud models; the correct setup (per `~/mdemg/.env`) is the local
llama-server model `mdemg-llm-v1` behind the OpenAI-compatible endpoint, so those model
names were corrected at the same time.

**Suggested fixes:**
1. Before `docker compose up`, verify the LLM runtime endpoint from the host
   (`curl $LLM_ENDPOINT/models`) and fail fast with the same "Resolve via" guidance the
   server prints, instead of starting a container that will loop.
2. When an existing `docker-compose.yml` is found, diff its `environment:` keys against the
   bundled template and either merge the missing keys or warn that the file is stale.
3. Treat "server did not become ready within 30s" as a failure, not a warning, and print
   `docker logs --tail 20 <server container>` so the cause is visible.
4. On re-init, preserve existing `llm`, `embedding` and `jiminy` settings in
   `.mdemg/config.yaml` unless the user passes a flag to reset them.

**Workaround applied:** replaced the stale forge `docker-compose.yml` with the 0.11.0-beta.1
template (same volume names, so data persisted), mirrored the non-secret `LLM_*`, `JIMINY_*`
and `J17_*` settings from `~/mdemg/.env` into the forge `.env` (leaving `LLM_ENDPOINT` unset so
the container default `host.docker.internal:8102` applies), restored the `jiminy` section of
`.mdemg/config.yaml` with model `mdemg-llm-v1`, and recreated the stack.

---

## Bug 4: `init` writes the MCP server config to `.claude/mcp.json`, which Claude Code does not read

**MDEMG version:** 0.11.0-beta.1
**Discovered:** 2026-10-15 in the `forge` repo

`mdemg init` generates `.claude/mcp.json` with the `mdemg mcp` server. Claude Code loads
project-scoped MCP servers from `.mcp.json` at the repository root (and user-scoped ones from
`~/.claude.json`), so the server in `.claude/mcp.json` is never registered and no
`mcp__mdemg__*` tools appear in a session.

**Suggested fix:** write `.mcp.json` at the project root (or merge into it if it exists), and
have `mdemg status` report whether the MCP server is registered. The Claude Code mod drafted
at `/Users/reh3376/mdemg/claude-mod/` registers the server through its plugin manifest instead.

---

## Bug 5: hook alert banner is global, not per instance

**MDEMG version:** 0.11.0-beta.1
**Discovered:** 2026-10-15 in the `forge` repo

`prompt-context.sh` and `session-start.sh` read `~/.mdemg/alerts/current.json`, which is
shared by every MDEMG instance on the machine. In forge sessions the banner shows 44 pending
alerts (Jiminy follow-rate drops, FT benchmark staleness, Neo4j backup window) that all belong
to the `~/mdemg` instance, not to the freshly created forge instance.

**Suggested fix:** key the alert file by instance id (`MDEMG_INSTANCE_ID` from `.env`) or by
server port, and have the hooks resolve the instance-specific file.

**Observed again 2026-10-15 (session resume):** the forge instance's `SessionStart` banner listed
seven HIGH alerts (`health-neo4j` timeout on `localhost:7687`, `health-neural_sidecar` timeout on
`localhost:8100`, `health-timescaledb`, backup staleness, FT benchmark). Those are the ports of the
global `~/mdemg` project (`7687`, `8100`); the forge instance runs on `7688` / `8101` and all five of
its containers were healthy. The banner misreports the other instance's state as this one's.

---

## Bug 6: `ingest --incremental` drops most added files after its change filter

**MDEMG version:** 0.11.0-beta.1
**Discovered:** 2026-10-15 in the `forge` repo, after `git subtree add --prefix="modules/Forge MES"`

```
mdemg ingest --path /Users/reh3376/forge --space-id forge --include-tests --incremental --since e3cb42d
INFO changed files detected added=3846 modified=75 deleted=1 renamed=22
INFO filtered to changed files only before=8545 after=287
INFO === Ingestion Complete === total=287 ingested=287
```

Git reported 3,846 added files, discovery found 8,545 elements, but the "changed files only"
filter kept 287. The 3,800 files under `modules/Forge MES/` (a path containing a space, added
in a subtree merge commit) were not ingested; a full non-incremental run was required.

**Likely causes to check:** path comparison between `git diff --name-status` output (which
quotes paths containing spaces, e.g. `"modules/Forge MES/..."`) and the discovered element
paths; or the filter only matching `modified`/`renamed` entries and not `added`.

**Suggested fix:** unquote git paths (`git -c core.quotePath=false diff ...`) before matching,
include `added` files in the filter, and log the count of changed files that matched zero
discovered elements so the gap is visible.

---

## Bug 7: `bin/mdemg` installed by `init` does not match the server image it starts

**MDEMG version:** 0.11.0-beta.1
**Discovered:** 2026-10-15 in the `forge` repo, on session resume

Every hook banner prints `Version mismatch: ./bin/mdemg=3c2de7c9 server=53b5c697 — run: mdemg upgrade --edge`.
`init` copied one CLI build (`3c2de7c9`) into `bin/` and started the server from a different
build (`53b5c697`), so a fresh instance warns about itself from its first session. The suggested
remedy replaces the CLI with the newest edge build, which is not guaranteed to match the pinned
image either, so it was not run.

**Suggested fix:** have `init` install the CLI from the same build as the image it pins in
`docker-compose.yml`, and compare the banner against the running image's build id rather than
the newest edge build.

---

## Bug 8: the destructive-command guard has no path to run a command the user has confirmed

**MDEMG version:** 0.11.0-beta.1 (`.claude/hooks/pre-bash-check.py`)
**Discovered:** 2026-10-15 in the `forge` repo, during the credential history purge

The guard denies any Bash command matching its destructive patterns (force-push, recursive
forced delete, ...) with "You MUST ask the user for explicit confirmation before running this."
The assistant asked, the user confirmed, and the same command was still denied: the hook is
deterministic and has no confirmation channel (no env flag, J17 ticket, or RetireCode is
consulted in `main()`), so a confirmed destructive action can only be executed by the user
themselves. The match is textual, so even a documentation edit whose heredoc *mentions* a
pattern is denied. A chained command (relax branch protection, push, restore protection) is
rejected as a whole, which is the right outcome but leaves no sanctioned route for the
assistant to complete a confirmed purge.

**Suggested fix:** let the J17 protocol issue a one-shot confirmation ticket keyed to
(SessionID, command hash) that the user approves, and have the guard honour it once; match
patterns against the command's parsed argv rather than the raw text. Until then the model
hands the exact command to the user to run with the `!` prefix.

## Bug 9: session-start resume returns nothing from a populated space, with no stage named

**MDEMG version:** 0.11.0-beta.1 (`.claude/hooks/session-start.sh`, `/v1/conversation/resume`)
**Discovered:** 2026-11-14 in the `forge` repo, at session start

The session-start hook printed `MEMORY RETURNED EMPTY` (0 observations, 0 themes, 0 concepts)
for space `forge`. Measured right after:

- `GET /v1/memory/stats?space_id=forge`: 770 memories, 1397 observations, embedding coverage
  1.0, health score 0.95, 67 memories written in the last 24 h. The space is not empty.
- `POST /v1/self-improve/assess` (tier `micro`): overall health 0.90, but over the last 24 h
  `retrieval.rerank_cross` failed 27.5 % of 40 calls and `retrieval.query_classify` failed
  30 % of 10 calls, the latest errors at 13:45:03 and 13:45:07 EST, about two minutes after
  the service alert `rsic-alert_llm_health` ("LLM error rate spike", stamped 18:42:56 with no
  zone, read here as UTC).
- The first prompt's CMS recall was also empty; the next prompt's recall returned a hit
  (score 0.75). Retrieval is failing intermittently, not completely.

**Not established:** whether the empty resume is caused by the LLM errors. The two were
observed together; the stage that returned nothing was not identified.

**Found later the same session (likely cause of the LLM errors, not confirmed for the resume):**
the host had run out of outbound IPv4 TCP ports. Every IPv4 `connect()` failed with errno 49
(`Can't assign requested address`), to GitHub, to the LAN gateway and to `127.0.0.1` alike,
while ICMP and IPv6 worked. `netstat` showed 27,684 IPv4 sockets in `TIME_WAIT`, 15,047 of
them toward `127.0.0.1:8102` (the llama-server behind `LLM_ENDPOINT` of the
`mdemg-forge-mdemg-1` container), a count that did not move over five seconds, and 884 in
`SYN_SENT` toward `127.0.0.1:11434` (Ollama); the ephemeral range is 49152 to 65535 (16,384
ports) and the only client seen on either port was Docker's backend process. The sockets are
stuck, not turning over: the totals were the same hours later (27,697 and 898) and did not
change when `mdemg-forge-mdemg-1` and `career-site-sidecar-1` were stopped, well past the
30 s `TIME_WAIT`. 16,382 of the 16,384 ephemeral ports were held while only two IPv4
connections were established, and IPv6 carried 11,548 `TIME_WAIT` sockets of its own.

**Cause (host, not MDEMG):** the reported macOS defect in which the kernel's 32-bit
millisecond TCP clock (`tcp_now`) overflows after 49.7 days of uptime and closed connections
are never released from `TIME_WAIT`. The host (macOS 26.3.2) had been up 56.45 days and
passed the mark on 2026-11-07 at 23:52 local. The number of containers is not the cause. The
fix was a reboot (2026-11-14, 21:14 local): afterwards IPv4 connects succeed, 58 of the
16,384 ports were in use three minutes after boot, and a connection closed by hand left
`TIME_WAIT` within the normal 30 s.

**When the ports started to stick is not known.** An earlier version of this entry said that
every connection closed since the overflow still held its port. The probe rate found in
Bug 12 (24 new connections a minute, constant) does not allow that: it would have emptied the
pool within twelve hours of the overflow, and IPv4 worked until midday on 2026-11-14. The
15,164 stuck sockets toward port 8102 are about ten and a half hours of probes, which puts
the start in the early hours of 2026-11-14, near day 55.8 of uptime, if the rate was the
same then.

**Suggested fix (added):** the LLM client reuses connections (keep-alive pool) and backs off
on failure; an `EADDRNOTAVAIL` from the LLM call is reported as a host fault in the alert and
the banner instead of as an "LLM error rate spike".

**Suggested fix:** have resume report which stage produced zero results (query, embedding,
rerank) so the banner names it instead of asking the model to investigate. If resume depends on
the rerank or classify LLM calls, fall back to un-reranked results when they fail and say in
the banner that the result is degraded.

## Bug 10: the hooks read `space_id` with `grep -oP`, which macOS grep rejects

**MDEMG version:** 0.11.0-beta.1 (`.claude/hooks/session-start.sh:42`,
`.claude/hooks/prompt-context.sh:22`, `.claude/hooks/pre-compact.sh:23`)
**Discovered:** 2026-11-14 in the `forge` repo, while resolving the space ID for Bug 9

All three hooks resolve the space with
`grep -oP 'space_id:\s*\K\S+' .mdemg/config.yaml 2>/dev/null || echo "forge"`. macOS
`/usr/bin/grep` is BSD grep and exits 2 with `invalid option -- P`; the error goes to
`/dev/null` and the hook falls back to the literal `forge`. It has no effect today, because
`.mdemg/config.yaml` has no `space_id` key and the space is `forge`. A `space_id` set in
`config.yaml` would be ignored without any message, and the hooks would read and write the
wrong space unless `MDEMG_SPACE_ID` is exported.

**Not verified:** which `grep` the hooks resolve at run time. `/usr/bin/grep` was tested
directly; a GNU grep earlier on the hook's `PATH` would not have the problem.

**Suggested fix:** read the key with `sed -n 's/^[[:space:]]*space_id:[[:space:]]*//p'`, as
the hooks already do for the port, and print a warning when the fallback is used.

## Bug 11: two MDEMG servers answer on port 9999, and the hooks reach the wrong one

**MDEMG version:** 0.11.0-beta.1 (`.claude/hooks/session-start.sh:18`, `MDEMG_URL`)
**Discovered:** 2026-11-14 in the `forge` repo, after the Docker restart of Bug 9

Port 9999 has two listeners on this host, split by address family:

- IPv4 `127.0.0.1:9999` is Docker's published port for `mdemg-forge-mdemg-1`, the forge
  instance: space `forge` holds 9,661 memories and 17,747 observations.
- IPv6 `*:9999` is a native `/Users/reh3376/mdemg/bin/mdemg serve --auto-migrate` started
  from the mdemg checkout (up 18 days): its space `forge` holds 771 memories and 1,397
  observations.

The hooks build `MDEMG_URL="http://localhost:${_PORT}"`, and `localhost` connects to `::1`
here, so session resume, recall and observations go to the native server, not to forge's
instance. Neither server reports the collision, because each bind succeeds. The statistics
quoted in Bug 9 (770 memories, 1,397 observations) were read through `localhost` and are the
native server's.

**Not established:** how long the hooks have been reaching the native server, which of the two
raised the `rsic-alert_llm_health` alerts, and whether observations written since then need
to be moved into forge's instance.

**Cause (2026-11-15):** mdemg tests a port with a wildcard bind (`net.Listen("tcp", ":<port>")`
in `FindFreePort`, `checkPortAvailable`, `suggestFreePort` and `listenWithFallback`), and on
macOS a wildcard bind succeeds while another process listens on a specific address of the
same port; the reverse order succeeds too (both verified on this host). Docker publishes
forge's server on `127.0.0.1:9999`, so the native server's start-up saw the port as free. The
same test put forge's neural sidecar on 8101, where the mdemg checkout's native sidecar
already listened on `127.0.0.1:8101`: that port has two listeners as well.

**The owner's decision (2026-11-15):** port 9999 belongs to the mdemg repository; ports are
assigned dynamically, at initialization and at start-up, from the ports in use; the fix is
the mdemg agent's, and forge's instance is not moved by hand. The report handed to that
agent, with the cause and the suggested fix in full, is `docs/MDEMG-PORT-OWNERSHIP-REPORT.md`.

**Suggested fix:** the hooks and `.claude/mcp.json` address the instance by `127.0.0.1` (or
the instance moves to a port of its own); `init` refuses a port that already answers on
either address family; the server's `/v1/info` names its instance so a hook can check that it
reached the one its project configured.

## Bug 12: the LLM endpoint probe opens a new connection every five seconds, per server

**MDEMG version:** 0.11.0-beta.1 (the server's LLM client and its endpoint watchdog)
**Discovered:** 2026-11-14 on the owner's machine, after the Docker restart of Bug 9

Measured over 120 s, once Docker's restart had freed 843 outbound ports: 45 new ports were
taken and none released (the host defect of Bug 9), 43 of them toward `127.0.0.1:8102`.
Sampling the open sockets on that port showed two clients: Docker's backend, forwarding for
`mdemg-forge-mdemg-1` (`LLM_ENDPOINT=http://host.docker.internal:8102/v1`), about two
thirds, and the native launchd server `com.mdemg.server`
(`/Users/reh3376/mdemg/bin/mdemg serve`), the rest. That is about 21 connections a minute. It
was first read as an uptick against the week's average; it is not one (the cause below, and
the correction in Bug 9). The 843 freed ports were gone 29 minutes after the
restart (17:33 to 18:02 local; the `mlx-server` alert of 23:02:46Z reads
`connect: can't assign requested address`).

No connection is reused: each is opened, used and closed. On a healthy host that costs a port
for 30 s; on a host with Bug 9's defect it is the difference between days and minutes.

**Cause (found 2026-11-14 after the reboot, in the mdemg checkout at `03c725fc`):** the
endpoint probe. `probeOnce` in `internal/mlxprobe/probe.go` issues `GET <endpoint>/models`
every `LLM_PROBE_INTERVAL_SEC` (default 5 s; neither server sets it, and the container's log
shows `interval` 5 s) and closes the response body without reading it
(`defer resp.Body.Close()` straight after the status check). Go's HTTP transport does not
reuse a connection whose response body was closed before it was read to the end (the
`net/http` documentation: the transport "may not be able to re-use" it), so every probe opens
a new TCP connection. Two servers probe the same llama-server: 12 a minute each, 24 together.

**Measured on the healthy host (21:18 to 21:21 local, minutes after boot):** 88 distinct
connections to `127.0.0.1:8102` in 181 s, 29 a minute (the two probes plus real LLM calls,
the measuring session's own hooks among them), while 43 of the 16,384 ports were in use,
because the kernel releases each one after 30 s. The rate is the steady baseline, not a
surge: before the reboot the same rate met a kernel that released nothing.

**Not checked:** whether the LLM client's own calls reuse connections
(`internal/llmclient/client.go` decodes the JSON body and closes it; reuse then depends on
the decoder having reached the end of the body).

**Suggested fix (upstream, in mdemg):** drain the body before closing it in `probeOnce`
(`io.Copy(io.Discard, io.LimitReader(resp.Body, 64<<10))`), so one kept-alive connection
serves every probe; a test that counts the connections an `httptest.Server` accepts across
several probes holds it. Raising `LLM_PROBE_INTERVAL_SEC` only lowers the rate. Neither
protects against the host defect of Bug 9; a reboot before day 49 of uptime does.

