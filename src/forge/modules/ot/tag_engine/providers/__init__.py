"""Tag providers — bridge data sources into the tag registry.

Each provider manages one category of data acquisition:
    OpcUaProvider       — subscribes to OPC-UA nodes on a single PLC
    MemoryProvider      — manages in-memory read/write Memory tags
    ExpressionProvider  — wires expression/derived/reference evaluation
    QueryProvider       — executes SQL queries on poll intervals
    EventProvider       — receives values from MQTT/RabbitMQ/webhooks
    VirtualProvider     — fetches from external sources with TTL cache

All providers share a common lifecycle: start → running → stop.
The AcquisitionEngine orchestrates N providers concurrently.
"""

from forge.modules.ot.tag_engine.providers.base import BaseProvider, ProviderState
from forge.modules.ot.tag_engine.providers.opcua_provider import OpcUaProvider
from forge.modules.ot.tag_engine.providers.memory_provider import MemoryProvider
from forge.modules.ot.tag_engine.providers.expression_provider import ExpressionProvider
from forge.modules.ot.tag_engine.providers.acquisition import AcquisitionEngine

__all__ = [
    "BaseProvider",
    "ProviderState",
    "OpcUaProvider",
    "MemoryProvider",
    "ExpressionProvider",
    "AcquisitionEngine",
]
