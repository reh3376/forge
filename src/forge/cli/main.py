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
    scan_ports: Annotated[
        bool,
        typer.Option("--scan-ports/--no-scan-ports", help="Scan for free ports"),
    ] = True,
) -> None:
    """Initialize a new Forge instance.

    Creates configuration files, Docker Compose stack, and
    directory structure for a Forge deployment. Scans for free
    ports to avoid conflicts with other services.
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

    # Scan for free ports
    port_assignments = _DEFAULT_PORTS.copy()
    if scan_ports:
        typer.echo("  Scanning for free ports ...")
        port_assignments = _scan_free_ports()

    # Write default .env
    env_file = target / ".env"
    if not env_file.exists() or defaults:
        env_content = _default_env(port_assignments)
        env_file.write_text(env_content)
        typer.echo("  Created .env")

    # Write Docker Compose
    compose_file = target / "docker-compose.yml"
    if not compose_file.exists() or defaults:
        compose_file.write_text(_compose_template())
        typer.echo("  Created docker-compose.yml")

    typer.echo("\nForge initialized. Next steps:")
    typer.echo("  1. Review .env and adjust settings")
    typer.echo("  2. Run: docker compose up -d")
    typer.echo("  3. Run: forge health")


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


# ---------------------------------------------------------------------------
# Migrate subcommand group
# ---------------------------------------------------------------------------

migrate_app = typer.Typer(
    name="migrate",
    help="Database migration commands.",
    no_args_is_help=True,
)
app.add_typer(migrate_app, name="migrate")


@migrate_app.command("up")
def migrate_up(
    target: Annotated[
        str,
        typer.Option("--target", help="Target database: postgres, timescale, neo4j, or all"),
    ] = "all",
) -> None:
    """Apply all pending migrations."""
    import logging

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    from forge.storage.migrations.run import run_alembic, run_all, run_neo4j

    typer.echo(f"Running migrations (target={target}) ...")
    if target == "all":
        run_all("upgrade")
    elif target == "neo4j":
        run_neo4j("upgrade")
    else:
        run_alembic("upgrade", target=target)
    typer.echo("Migrations applied.")


@migrate_app.command("status")
def migrate_status(
    target: Annotated[
        str,
        typer.Option("--target", help="Target database: postgres, timescale, neo4j, or all"),
    ] = "all",
) -> None:
    """Show migration status."""
    import logging

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    from forge.storage.migrations.run import run_alembic, run_all, run_neo4j

    if target == "all":
        run_all("current")
    elif target == "neo4j":
        run_neo4j("current")
    else:
        run_alembic("current", target=target)


@migrate_app.command("down")
def migrate_down(
    steps: Annotated[
        int,
        typer.Option("--steps", help="Number of migrations to roll back"),
    ] = 1,
    target: Annotated[
        str,
        typer.Option("--target", help="Target database: postgres, timescale, neo4j, or all"),
    ] = "all",
) -> None:
    """Roll back migrations."""
    import logging

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    from forge.storage.migrations.run import run_alembic, run_all, run_neo4j

    typer.echo(f"Rolling back {steps} migration(s) (target={target}) ...")
    if target == "all":
        run_all("downgrade", steps=steps)
    elif target == "neo4j":
        run_neo4j("downgrade", steps=steps)
    else:
        run_alembic("downgrade", target=target, steps=steps)
    typer.echo("Rollback complete.")


# ---------------------------------------------------------------------------
# Governance subcommand group (continued)
# ---------------------------------------------------------------------------

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
# Port scanning
# ---------------------------------------------------------------------------

_DEFAULT_PORTS: dict[str, int] = {
    "POSTGRES_PORT": 5432,
    "TIMESCALE_PORT": 5433,
    "NEO4J_HTTP_PORT": 7474,
    "NEO4J_BOLT_PORT": 7687,
    "REDIS_PORT": 6379,
    "KAFKA_PORT": 9092,
    "RABBITMQ_PORT": 5672,
    "RABBITMQ_MGMT_PORT": 15672,
    "MINIO_API_PORT": 9000,
    "MINIO_CONSOLE_PORT": 9001,
    "FORGE_API_PORT": 8000,
    "FORGE_GRPC_PORT": 50051,
}


def _is_port_free(port: int) -> bool:
    """Check if a TCP port is available for binding."""
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def _find_free_port(preferred: int, range_start: int = 10000, range_end: int = 65000) -> int:
    """Find a free port, preferring the default.

    If the preferred port is free, use it. Otherwise scan upward
    from range_start.
    """
    if _is_port_free(preferred):
        return preferred
    for port in range(range_start, range_end):
        if _is_port_free(port):
            return port
    return preferred  # fallback


def _scan_free_ports() -> dict[str, int]:
    """Scan and assign free ports for all Forge services."""
    assigned: dict[str, int] = {}
    used: set[int] = set()
    for name, default_port in _DEFAULT_PORTS.items():
        if _is_port_free(default_port) and default_port not in used:
            assigned[name] = default_port
            used.add(default_port)
        else:
            port = _find_free_port(default_port)
            assigned[name] = port
            used.add(port)
    return assigned


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _default_env(ports: dict[str, int] | None = None) -> str:
    """Generate a default .env for Forge."""
    p = ports or _DEFAULT_PORTS
    return f"""\
# Forge Platform Configuration
# Generated by: forge init

# --- Storage ---
POSTGRES_HOST=localhost
POSTGRES_PORT={p.get('POSTGRES_PORT', 5432)}
POSTGRES_DB=forge
POSTGRES_USER=forge
POSTGRES_PASSWORD=changeme

TIMESCALE_HOST=localhost
TIMESCALE_PORT={p.get('TIMESCALE_PORT', 5433)}
TIMESCALE_DB=forge_ts
TIMESCALE_USER=forge
TIMESCALE_PASSWORD=changeme

NEO4J_URI=bolt://localhost:{p.get('NEO4J_BOLT_PORT', 7687)}
NEO4J_USER=neo4j
NEO4J_PASSWORD=changeme

REDIS_URL=redis://localhost:{p.get('REDIS_PORT', 6379)}/0

MINIO_ENDPOINT=localhost:{p.get('MINIO_API_PORT', 9000)}
MINIO_ACCESS_KEY=forge
MINIO_SECRET_KEY=changeme

# --- Kafka ---
KAFKA_BOOTSTRAP_SERVERS=localhost:{p.get('KAFKA_PORT', 9092)}

# --- RabbitMQ ---
RABBITMQ_URL=amqp://forge:changeme@localhost:{p.get('RABBITMQ_PORT', 5672)}/
RABBITMQ_USER=forge
RABBITMQ_PASS=changeme
RABBITMQ_VHOST=/
RABBITMQ_PORT={p.get('RABBITMQ_PORT', 5672)}
RABBITMQ_MGMT_PORT={p.get('RABBITMQ_MGMT_PORT', 15672)}

# --- API ---
FORGE_API_HOST=0.0.0.0
FORGE_API_PORT={p.get('FORGE_API_PORT', 8000)}

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

  rabbitmq:
    image: rabbitmq:3-management
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_USER:-forge}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASS:-changeme}
      RABBITMQ_DEFAULT_VHOST: ${RABBITMQ_VHOST:-/}
    ports:
      - "${RABBITMQ_PORT:-5672}:5672"
      - "${RABBITMQ_MGMT_PORT:-15672}:15672"
    volumes:
      - forge-rabbitmq-data:/var/lib/rabbitmq
    healthcheck:
      test: ["CMD-SHELL", "rabbitmq-diagnostics -q ping"]
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
  forge-rabbitmq-data:
  forge-minio-data:
"""
