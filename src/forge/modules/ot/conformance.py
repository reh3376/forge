"""What the FMTS conformance kit needs to drive the OT module (BACKLOG FB-155).

The kit drives a module on the Python adapter template by finding the one adapter class
in its ``adapter.py``. The OT module is not on that template: its adapter is built
around a tag registry, and its records come from tag values, not from injected events.
A module in that position supplies this file beside its ``adapter.py``:

    conformance_adapter()        the adapter, built as the module builds it
    conformance_load(adapter)    give it something to send (optional)

The kit never connects the module to a PLC or an OPC UA server. The tags below are
written to the real registry with the stamps a server would give them.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

from forge.modules.ot.adapter import OTModuleAdapter
from forge.modules.ot.opcua_client.types import DataType, QualityCode
from forge.modules.ot.tag_engine.models import StandardTag
from forge.modules.ot.tag_engine.registry import TagRegistry

_TAGS = (
    ("Site01/Area01/Unit01/TIT_2010/Out_PV", "Temperature", "degF", 78.4),
    ("Site01/Area01/Unit01/PIT_2020/Out_PV", "Pressure", "psi", 14.2),
)


def conformance_adapter() -> OTModuleAdapter:
    """The OT adapter on a real, empty tag registry; no control runtime, no connection."""
    return OTModuleAdapter(registry=TagRegistry())


async def conformance_load(adapter: OTModuleAdapter) -> None:
    """Register two tags and give each a value stamped by its source."""
    registry = adapter._registry
    stamped_at = datetime(2026, 6, 1, 11, 59, 30, tzinfo=UTC)
    # the second stamp arrives with a non-UTC offset: what leaves the module must be UTC
    offsets = (UTC, timezone(timedelta(hours=-5)))
    for (path, description, units, value), zone in zip(_TAGS, offsets, strict=True):
        if await registry.get_definition(path) is None:
            await registry.register(
                StandardTag(
                    path=path,
                    data_type=DataType.DOUBLE,
                    description=description,
                    engineering_units=units,
                    opcua_node_id=f"ns=2;s={path.rsplit('/', 2)[-2]}.Out_PV",
                    connection_name="conformance",
                )
            )
        await registry.update_value(
            path,
            value,
            quality=QualityCode.GOOD,
            source_timestamp=stamped_at.astimezone(zone),
            server_timestamp=stamped_at.astimezone(zone),
        )
