"""Forge CLI — unified command-line interface.

Entry point: ``forge`` (defined in pyproject.toml).

Subcommands:
  forge init        — Initialize a new Forge instance
  forge health      — Check platform health
  forge version     — Show version info
  forge adapter     — Adapter management (list, register, status)
  forge governance  — Run FxTS spec governance checks
"""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import typer

import forge

# ---------------------------------------------------------------------------
# Root app
# ---------------------------------------------------------------------------

app = typer.Typer(
    name="forge",
    help="Forge Platform — Manufacturing Decision Infrastructure.",
    no_args_is_help=True,
    add_completion=False,
)


# ---------------------------------------------------------------------------
# Top-level commands
# ---------------------------------------------------------------------------

@app.command()
def version() -> None:
    """Show Forge version."""
    typer.echo(f"forge {forge.__version__}")


@app.command()
def health(
    base_url: Annotated[
        str, typer.Option("--url", help="Forge API base URL")
    ] = "http://localhost:8000",
) -> None:
    """Check Forge platform health."""
    import httpx

    try:
        resp = httpx.get(f"{base_url}/v1/health", timeout=5.0)
        if resp.status_code == 200:
            typer.echo(f"[OK] Forge is healthy at {base_url}")
            data = resp.json()
            for key, val in data.items():
                typer.echo(f"  {key}: {val}")
        else:
            typer.echo(
                f"[WARN] Unexpected status {resp.status_code} from {base_url}"
            )
            raise typer.Exit(code=1)
    except httpx.ConnectError as exc:
        typer.echo(f"[ERROR] Cannot connect to {base_url}")
        raise typer.Exit(code=1) from exc


@app.command()
def init(
    target: Annotated[
        Path,
        typer.Argument(help="Directory to initialize Forge in"),
    ] = Path("."),
    defaults: Annotated[
        bool,
        typer.Option("--defaults", help="Accept all defaults without prompting"),
    ] = False,
) -> None:
    """Initialize a new Forge instance.

    Creates configuration files, Docker Compose stack, and
    directory structure for a Forge deployment.
    """
    target = target.resolve()
    typer.echo(f"Initializing Forge in {target} ...")

    # Create directory structure
    dirs = [
        "config",
        "data",
        "adapters",
        "specs/fats",
        "specs/facts",
        "specs/fqts",
        "specs/fsts",
        "logs",
    ]
    for d in dirs:
        (target / d).mkdir(parents=True, exist_ok=True)
        typer.echo(f"  Created {d}/")

    # Write default .env
    env_file = target / ".env"
    if not env_file.exists() or defaults:
        env_content = _default_env()
        env_file.write_text(env_content)
        typer.echo("  Created .env")

    # Write Docker Compose
    compose_file = target / "docker-compose.yml"
    if not compose_file.exists() or defaults:
        compose_file.write_text(_compose_template())
        typer.echo("  Created docker-compose.yml")

    typer.echo("\nForge initialized. Next steps:")
    typer.echo("  1. Review .env and adjust settings")
    typer.echo("  2. Infrastructure only: docker compose up -d")
    typer.echo("  3. Full F04 stack:     docker compose -f deploy/docker/docker-compose.yml up -d")
    typer.echo("  4. Run: forge health")


# ---------------------------------------------------------------------------
# Adapter subcommand group
# ---------------------------------------------------------------------------

adapter_app = typer.Typer(
    name="adapter",
    help="Adapter management commands.",
    no_args_is_help=True,
)
app.add_typer(adapter_app, name="adapter")


@adapter_app.command("list")
def adapter_list(
    base_url: Annotated[
        str, typer.Option("--url", help="Forge API base URL")
    ] = "http://localhost:8000",
) -> None:
    """List registered adapters."""
    import httpx

    try:
        resp = httpx.get(f"{base_url}/v1/adapters", timeout=5.0)
        adapters = resp.json()
        if not adapters:
            typer.echo("No adapters registered.")
            return
        for a in adapters:
            state = a.get("state", "UNKNOWN")
            typer.echo(f"  [{state}] {a['adapter_id']} — {a.get('name', '')}")
    except httpx.ConnectError as exc:
        typer.echo(f"[ERROR] Cannot connect to {base_url}")
        raise typer.Exit(code=1) from exc


@adapter_app.command("status")
def adapter_status(
    adapter_id: Annotated[str, typer.Argument(help="Adapter ID to check")],
    base_url: Annotated[
        str, typer.Option("--url", help="Forge API base URL")
    ] = "http://localhost:8000",
) -> None:
    """Show status of a specific adapter."""
    import httpx

    try:
        resp = httpx.get(
            f"{base_url}/v1/adapters/{adapter_id}/health", timeout=5.0
        )
        if resp.status_code == 404:
            typer.echo(f"Adapter '{adapter_id}' not found.")
            raise typer.Exit(code=1)
        health = resp.json()
        typer.echo(f"Adapter: {adapter_id}")
        typer.echo(f"  State:            {health.get('state')}")
        typer.echo(f"  Last Check:       {health.get('last_check')}")
        typer.echo(f"  Records Collected: {health.get('records_collected', 0)}")
        typer.echo(f"  Records Failed:   {health.get('records_failed', 0)}")
        typer.echo(f"  Uptime:           {health.get('uptime_seconds', 0):.0f}s")
    except httpx.ConnectError as exc:
        typer.echo(f"[ERROR] Cannot connect to {base_url}")
        raise typer.Exit(code=1) from exc


# ---------------------------------------------------------------------------
# Governance subcommand group
# ---------------------------------------------------------------------------

governance_app = typer.Typer(
    name="governance",
    help="FxTS spec governance commands.",
    no_args_is_help=True,
)
app.add_typer(governance_app, name="governance")


# ---------------------------------------------------------------------------
# Module Builder subcommand group
# ---------------------------------------------------------------------------

from forge.sdk.module_builder.cli import module_app  # noqa: E402

app.add_typer(module_app, name="module")


@governance_app.command("run")
def governance_run(
    framework: Annotated[
        str,
        typer.Argument(help="Framework to run (fats, facts, fqts, fsts)"),
    ],
    target: Annotated[
        str,
        typer.Argument(help="Target to validate (endpoint path, adapter ID, etc.)"),
    ],
    spec_dir: Annotated[
        Path | None,
        typer.Option("--specs", help="Directory containing spec files"),
    ] = None,
    live: Annotated[
        bool,
        typer.Option("--live", help="Run live checks against running services"),
    ] = False,
) -> None:
    """Run FxTS governance checks for a framework."""
    import asyncio

    typer.echo(f"Running {framework.upper()} governance on '{target}' ...")

    if framework.lower() == "fats":
        from forge.governance.fats.runners.fats_runner import FATSRunner

        schema_path = spec_dir / "fats.schema.json" if spec_dir else None
        runner = FATSRunner(schema_path=schema_path)
        report = asyncio.run(runner.run(target=target, live=live))
    else:
        typer.echo(f"Framework '{framework}' runner not yet implemented.")
        raise typer.Exit(code=1)

    # Print report
    typer.echo(report.summary())
    if not report.passed:
        typer.echo("\nFailed checks:")
        for v in report.verdicts:
            if v.status not in ("PASS", "SKIP"):
                typer.echo(f"  [{v.status}] {v.check_id}: {v.message}")
                for violation in v.violations:
                    typer.echo(f"    → {violation.field}: {violation.message}")
        raise typer.Exit(code=1)
    typer.echo("All checks passed.")


@governance_app.command("validate-spec")
def governance_validate_spec(
    spec_file: Annotated[
        Path, typer.Argument(help="Path to the spec file to validate")
    ],
) -> None:
    """Validate a spec file against its framework schema."""
    import json

    import jsonschema

    if not spec_file.exists():
        typer.echo(f"Spec file not found: {spec_file}")
        raise typer.Exit(code=1)

    with spec_file.open() as f:
        spec = json.load(f)

    # Determine framework from spec or filename
    framework = None
    fname = spec_file.stem.lower()
    for fw in ("fats", "facts", "fqts", "fsts", "fdts", "flts", "fnts", "fots", "fpts"):
        if fw in fname:
            framework = fw
            break

    if framework is None:
        typer.echo("Cannot determine framework from filename.")
        raise typer.Exit(code=1)

    # Load framework schema
    schema_dir = Path(__file__).parent.parent / "governance" / framework / "schema"
    schema_file = schema_dir / f"{framework}.schema.json"
    if not schema_file.exists():
        typer.echo(f"Schema not found: {schema_file}")
        raise typer.Exit(code=1)

    with schema_file.open() as f:
        schema = json.load(f)

    try:
        jsonschema.validate(instance=spec, schema=schema)
        typer.echo(f"[PASS] {spec_file.name} conforms to {framework.upper()} schema.")
    except jsonschema.ValidationError as e:
        typer.echo(f"[FAIL] {spec_file.name}: {e.message}")
        raise typer.Exit(code=1) from e


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _default_env() -> str:
    """Generate a default .env for Forge."""
    return """\
# Forge Platform Configuration
# Generated by: forge init

# --- Storage ---
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=forge
POSTGRES_USER=forge
POSTGRES_PASSWORD=changeme

TIMESCALE_HOST=localhost
TIMESCALE_PORT=5433
TIMESCALE_DB=forge_ts
TIMESCALE_USER=forge
TIMESCALE_PASSWORD=changeme

NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=changeme

REDIS_URL=redis://localhost:6379/0

MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=forge
MINIO_SECRET_KEY=changeme

# --- Kafka ---
KAFKA_BOOTSTRAP_SERVERS=localhost:9092

# --- API ---
FORGE_API_HOST=0.0.0.0
FORGE_API_PORT=8000
FORGE_GRPC_PORT=50051
FORGE_GRPC_ENABLED=true

# --- Features ---
FORGE_AUTH_ENABLED=false
FORGE_OTEL_ENABLED=false
"""


def _compose_template() -> str:
    """Return the Docker Compose template for a Forge dev stack."""
    return """\
# Forge Platform — Development Stack
# Generated by: forge init

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-forge}
      POSTGRES_USER: ${POSTGRES_USER:-forge}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-changeme}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - forge-pg-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U forge"]
      interval: 5s
      retries: 5

  timescaledb:
    image: timescale/timescaledb:latest-pg16
    environment:
      POSTGRES_DB: ${TIMESCALE_DB:-forge_ts}
      POSTGRES_USER: ${TIMESCALE_USER:-forge}
      POSTGRES_PASSWORD: ${TIMESCALE_PASSWORD:-changeme}
    ports:
      - "${TIMESCALE_PORT:-5433}:5432"
    volumes:
      - forge-ts-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U forge"]
      interval: 5s
      retries: 5

  neo4j:
    image: neo4j:5-community
    environment:
      NEO4J_AUTH: ${NEO4J_USER:-neo4j}/${NEO4J_PASSWORD:-changeme}
      NEO4J_PLUGINS: '["apoc"]'
    ports:
      - "7474:7474"
      - "7687:7687"
    volumes:
      - forge-neo4j-data:/data
    healthcheck:
      test: ["CMD", "neo4j", "status"]
      interval: 10s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - forge-redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 5

  kafka:
    image: bitnami/kafka:3.7
    environment:
      KAFKA_CFG_NODE_ID: 1
      KAFKA_CFG_PROCESS_ROLES: broker,controller
      KAFKA_CFG_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
      KAFKA_CFG_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
      KAFKA_CFG_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_CFG_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      KAFKA_CFG_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_CFG_AUTO_CREATE_TOPICS_ENABLE: "true"
    ports:
      - "9092:9092"
    volumes:
      - forge-kafka-data:/bitnami/kafka
    healthcheck:
      test: ["CMD-SHELL", "kafka-broker-api-versions.sh --bootstrap-server localhost:9092"]
      interval: 10s
      retries: 5

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ACCESS_KEY:-forge}
      MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY:-changeme}
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - forge-minio-data:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 10s
      retries: 5

volumes:
  forge-pg-data:
  forge-ts-data:
  forge-neo4j-data:
  forge-redis-data:
  forge-kafka-data:
  forge-minio-data:
"""
