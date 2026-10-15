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
