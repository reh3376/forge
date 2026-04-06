"""Adapter base — abstract interfaces every adapter must implement.

Adapters are the spokes of the Forge hub-and-spoke architecture.
They connect external systems (PLCs, SCADA, MES, ERP, historians, etc.)
to the governed hub. Each adapter conforms to the FACTS specification
and declares its capabilities via an AdapterManifest.
"""

from forge.adapters.base.interface import (
    AdapterBase,
    AdapterLifecycle,
    BackfillProvider,
    DiscoveryProvider,
    SubscriptionProvider,
    WritableAdapter,
)

__all__ = [
    "AdapterBase",
    "AdapterLifecycle",
    "BackfillProvider",
    "DiscoveryProvider",
    "SubscriptionProvider",
    "WritableAdapter",
]
