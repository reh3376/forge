"""Forge OT Module — Industrial application platform replacing Ignition SCADA.

This module connects directly to Allen-Bradley ControlLogix PLCs via OPC-UA,
manages a 9-type tag engine, provides ISA-18.2 alarm management, and exposes
an i3X-compliant REST API for consuming applications.

Architecture:
    opcua_client/   — Hardened async Python OPC-UA library
    tag_engine/     — 9-type tag engine with templates and providers
    i3x/            — CESMII i3X-compliant browse/discovery REST API
    acquisition/    — Multi-PLC subscription orchestration
    mqtt/           — MQTT pub/sub engine (UNS topic hierarchy)
    alarming/       — ISA-18.2 alarm state machine
    control/        — Write interface with safety interlocks
    context/        — Context enrichment (equipment → area, batch, recipe)
    scripts/        — User scripts (managed by forge.sdk.scripting)

The scripting runtime lives in forge.sdk.scripting (not here) because
it extends the Forge Module SDK and can serve any module.
"""

__version__ = "0.1.0"
