"""Module Builder SDK — codifies the proven adapter pattern into generators.

The module builder generates the boilerplate that every Forge adapter needs:

    ManifestBuilder    → manifest.json
    ConfigGenerator    → config.py (Pydantic model from connection_params)
    AdapterGenerator   → adapter.py (AdapterBase subclass + capability mixins)
    ContextGenerator   → context.py (RecordContext mapper with enrichment hooks)
    RecordGenerator    → record_builder.py (ContextualRecord assembler)
    FactsGenerator     → <adapter_id>.facts.json (FACTS governance spec)
    TestGenerator      → test_<adapter_id>.py (test scaffold)

Usage (programmatic)::

    from forge.sdk.module_builder import ManifestBuilder, ModuleScaffolder

    manifest = (
        ManifestBuilder("acme-plc")
        .name("ACME PLC Adapter")
        .protocol("opcua")
        .tier("OT")
        .capability("read", True)
        .capability("subscribe", True)
        .connection_param("endpoint_url", required=True, description="OPC-UA endpoint")
        .context_field("equipment_id")
        .build()
    )

    scaffolder = ModuleScaffolder(manifest)
    scaffolder.generate("./src/forge/adapters/acme_plc/")

Usage (CLI)::

    forge module init acme-plc --protocol opcua --tier OT

"""

from forge.sdk.module_builder.manifest_builder import ManifestBuilder
from forge.sdk.module_builder.scaffolder import ModuleScaffolder

__all__ = ["ManifestBuilder", "ModuleScaffolder"]
