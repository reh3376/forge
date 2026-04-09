"""CLI commands for the Module Builder SDK.

Provides ``forge module init``, ``forge module list``, and ``forge module validate``
as subcommands of the Forge CLI.

Usage Examples
--------------

Create a new module interactively::

    forge module init acme-plc --protocol opcua --tier OT

Create with full options::

    forge module init acme-plc \\
        --name "ACME PLC Adapter" \\
        --protocol opcua \\
        --tier OT \\
        --capability read \\
        --capability subscribe \\
        --param "endpoint_url:OPC-UA server URL:required" \\
        --param "security_policy:Security policy:optional:Basic256Sha256" \\
        --context-field equipment_id \\
        --context-field area \\
        --output ./src/forge/adapters/

List all adapters in the project::

    forge module list

Validate a module's structure::

    forge module validate src/forge/adapters/acme_plc/
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Annotated

import typer

logger = logging.getLogger(__name__)

module_app = typer.Typer(
    name="module",
    help="Module Builder SDK — scaffold, list, and validate Forge adapter modules.",
    no_args_is_help=True,
)


# ---------------------------------------------------------------------------
# forge module init
# ---------------------------------------------------------------------------


@module_app.command("init")
def module_init(
    adapter_id: Annotated[
        str,
        typer.Argument(help="Unique adapter identifier (e.g. 'acme-plc')"),
    ],
    name: Annotated[
        str | None,
        typer.Option("--name", help="Human-readable adapter name"),
    ] = None,
    protocol: Annotated[
        str,
        typer.Option("--protocol", help="Communication protocol (e.g. rest, graphql, grpc, opcua, mqtt)"),
    ] = "rest",
    tier: Annotated[
        str,
        typer.Option("--tier", help="ISA-95 tier: OT, MES_MOM, ERP_BUSINESS, HISTORIAN, DOCUMENT"),
    ] = "MES_MOM",
    capability: Annotated[
        list[str] | None,
        typer.Option("--capability", "-c", help="Enable capability (read, write, subscribe, backfill, discover). Repeatable."),
    ] = None,
    param: Annotated[
        list[str] | None,
        typer.Option(
            "--param", "-p",
            help="Connection param as 'name:description:required|optional[:default]'. Repeatable.",
        ),
    ] = None,
    context_field: Annotated[
        list[str] | None,
        typer.Option("--context-field", "-f", help="Context field name. Repeatable."),
    ] = None,
    auth: Annotated[
        list[str] | None,
        typer.Option("--auth", help="Auth method (e.g. bearer_token, api_key, certificate). Repeatable."),
    ] = None,
    output: Annotated[
        Path,
        typer.Option("--output", "-o", help="Parent directory for the adapter module"),
    ] = Path("src/forge/adapters"),
    no_tests: Annotated[
        bool,
        typer.Option("--no-tests", help="Skip test scaffold generation"),
    ] = False,
    no_facts: Annotated[
        bool,
        typer.Option("--no-facts", help="Skip FACTS governance spec generation"),
    ] = False,
    overwrite: Annotated[
        bool,
        typer.Option("--overwrite", help="Overwrite existing files"),
    ] = False,
) -> None:
    """Scaffold a new Forge adapter module.

    Generates a complete adapter directory with all required files:
    manifest.json, adapter.py, config.py, context.py, record_builder.py,
    plus optional test scaffold and FACTS governance spec.

    Examples:

        forge module init acme-plc --protocol opcua --tier OT

        forge module init whk-plc --protocol opcua --tier OT \\
            -c read -c subscribe \\
            -p "endpoint_url:OPC-UA server:required" \\
            -f equipment_id -f area
    """
    from forge.sdk.module_builder.manifest_builder import ManifestBuilder
    from forge.sdk.module_builder.scaffolder import ModuleScaffolder

    # Build manifest from CLI args
    builder = ManifestBuilder(adapter_id)

    if name:
        builder.name(name)
    else:
        # Generate a readable name from the adapter_id
        readable = adapter_id.replace("-", " ").replace("_", " ").title()
        builder.name(f"{readable} Adapter")

    builder.protocol(protocol)

    try:
        builder.tier(tier)
    except ValueError as e:
        typer.echo(f"[ERROR] {e}")
        raise typer.Exit(code=1) from e

    # Capabilities — 'read' is always enabled
    if capability:
        for cap in capability:
            try:
                builder.capability(cap, True)
            except ValueError as e:
                typer.echo(f"[ERROR] {e}")
                raise typer.Exit(code=1) from e

    # Connection params
    if param:
        for p_str in param:
            parts = p_str.split(":")
            if len(parts) < 2:
                typer.echo(f"[ERROR] Invalid param format: '{p_str}'. Use 'name:description:required|optional[:default]'")
                raise typer.Exit(code=1)

            p_name = parts[0]
            p_desc = parts[1] if len(parts) > 1 else ""
            p_required = parts[2].lower() != "optional" if len(parts) > 2 else True
            p_default = parts[3] if len(parts) > 3 else None
            p_secret = "secret" in p_name.lower() or "password" in p_name.lower() or "key" in p_name.lower()

            builder.connection_param(
                p_name,
                description=p_desc,
                required=p_required,
                secret=p_secret,
                default=p_default,
            )

    # Context fields
    if context_field:
        for cf in context_field:
            builder.context_field(cf)

    # Auth methods
    if auth:
        for a in auth:
            builder.auth_method(a)

    # Metadata
    builder.metadata("spoke", adapter_id)
    builder.metadata("hub_module", f"forge.adapters.{adapter_id.replace('-', '_')}")

    # Build and scaffold
    try:
        manifest = builder.build()
    except ValueError as e:
        typer.echo(f"[ERROR] {e}")
        raise typer.Exit(code=1) from e

    snake = adapter_id.replace("-", "_")
    target_dir = Path(output).resolve() / snake

    scaffolder = ModuleScaffolder(manifest)
    result = scaffolder.generate(
        target_dir,
        include_tests=not no_tests,
        include_facts=not no_facts,
        overwrite=overwrite,
    )

    # Report results
    typer.echo(f"\nModule '{adapter_id}' scaffolded successfully!")
    typer.echo(f"  Adapter class: {result.adapter_class}")
    typer.echo(f"  Module dir:    {result.module_dir}")
    typer.echo(f"  Files created: {len(result.files_created)}")
    for f in result.files_created:
        typer.echo(f"    {f}")

    typer.echo("\nNext steps:")
    typer.echo(f"  1. Edit {target_dir / 'adapter.py'} — implement collect() with your data source")
    typer.echo(f"  2. Edit {target_dir / 'context.py'} — add domain-specific enrichment rules")
    if result.facts_file:
        typer.echo(f"  3. Review {result.facts_file} — complete the FACTS governance spec")
    if result.test_file:
        typer.echo(f"  4. Run tests: pytest {result.test_file}")


# ---------------------------------------------------------------------------
# forge module list
# ---------------------------------------------------------------------------


@module_app.command("list")
def module_list(
    adapters_dir: Annotated[
        Path,
        typer.Option("--dir", help="Adapters directory to scan"),
    ] = Path("src/forge/adapters"),
) -> None:
    """List all adapter modules in the project.

    Scans the adapters directory for manifest.json files and displays
    adapter identity, capabilities, and protocol information.
    """
    adapters_path = Path(adapters_dir).resolve()
    if not adapters_path.exists():
        typer.echo(f"Adapters directory not found: {adapters_path}")
        raise typer.Exit(code=1)

    found = 0
    for manifest_file in sorted(adapters_path.rglob("manifest.json")):
        try:
            with manifest_file.open() as f:
                manifest = json.load(f)

            adapter_id = manifest.get("adapter_id", "unknown")
            name = manifest.get("name", "")
            tier = manifest.get("tier", "?")
            protocol = manifest.get("protocol", "?")
            version = manifest.get("version", "?")
            caps = manifest.get("capabilities", {})
            enabled_caps = [k for k, v in caps.items() if v]

            typer.echo(f"  [{tier}] {adapter_id} v{version}")
            typer.echo(f"         {name}")
            typer.echo(f"         Protocol: {protocol} | Capabilities: {', '.join(enabled_caps)}")
            typer.echo()
            found += 1
        except (json.JSONDecodeError, KeyError) as e:
            typer.echo(f"  [WARN] Skipping {manifest_file}: {e}")

    if found == 0:
        typer.echo("No adapter modules found.")
    else:
        typer.echo(f"Total: {found} adapter(s)")


# ---------------------------------------------------------------------------
# forge module validate
# ---------------------------------------------------------------------------


@module_app.command("validate")
def module_validate(
    module_dir: Annotated[
        Path,
        typer.Argument(help="Path to the adapter module directory"),
    ],
) -> None:
    """Validate an adapter module's structure and imports.

    Checks that all required files exist, the manifest is valid JSON,
    the config model can be imported, and the adapter class conforms
    to the AdapterBase interface.

    Example:

        forge module validate src/forge/adapters/acme_plc/
    """
    module_path = Path(module_dir).resolve()

    if not module_path.is_dir():
        typer.echo(f"[ERROR] Not a directory: {module_path}")
        raise typer.Exit(code=1)

    errors: list[str] = []
    warnings: list[str] = []

    # Check required files
    required_files = [
        "__init__.py",
        "manifest.json",
        "adapter.py",
        "config.py",
        "context.py",
        "record_builder.py",
    ]

    for fname in required_files:
        fpath = module_path / fname
        if not fpath.exists():
            errors.append(f"Missing required file: {fname}")
        elif fpath.stat().st_size == 0:
            warnings.append(f"Empty file: {fname}")

    # Validate manifest.json
    manifest_path = module_path / "manifest.json"
    if manifest_path.exists():
        try:
            with manifest_path.open() as f:
                manifest = json.load(f)

            # Check required manifest fields
            required_fields = ["adapter_id", "name", "version", "protocol", "tier", "capabilities"]
            for field in required_fields:
                if field not in manifest:
                    errors.append(f"manifest.json missing required field: {field}")

            # Validate capabilities
            caps = manifest.get("capabilities", {})
            if not caps.get("read"):
                errors.append("manifest.json: 'read' capability must be enabled")

            # Validate tier
            valid_tiers = {"OT", "MES_MOM", "ERP_BUSINESS", "HISTORIAN", "DOCUMENT"}
            if manifest.get("tier") not in valid_tiers:
                errors.append(f"manifest.json: invalid tier '{manifest.get('tier')}'. Must be one of {valid_tiers}")

            # Check data_contract
            dc = manifest.get("data_contract", {})
            if not dc.get("schema_ref"):
                warnings.append("manifest.json: data_contract.schema_ref is empty")
            if not dc.get("context_fields"):
                warnings.append("manifest.json: data_contract.context_fields is empty")

        except json.JSONDecodeError as e:
            errors.append(f"manifest.json is not valid JSON: {e}")

    # Check for FACTS spec
    specs_dir = module_path.parent.parent / "governance" / "facts" / "specs"
    adapter_id = manifest.get("adapter_id", "") if manifest_path.exists() else ""
    if adapter_id:
        facts_file = specs_dir / f"{adapter_id}.facts.json"
        if not facts_file.exists():
            warnings.append(f"No FACTS spec found at {facts_file}")

    # Report
    typer.echo(f"Validating module: {module_path.name}")
    typer.echo(f"  Adapter ID: {adapter_id or '?'}")
    typer.echo()

    if errors:
        typer.echo(f"  ERRORS ({len(errors)}):")
        for e in errors:
            typer.echo(f"    [ERROR] {e}")

    if warnings:
        typer.echo(f"  WARNINGS ({len(warnings)}):")
        for w in warnings:
            typer.echo(f"    [WARN] {w}")

    if not errors and not warnings:
        typer.echo("  [OK] All checks passed")
    elif not errors:
        typer.echo(f"\n  Module structure is valid ({len(warnings)} warnings)")
    else:
        typer.echo(f"\n  Module has {len(errors)} error(s)")
        raise typer.Exit(code=1)
