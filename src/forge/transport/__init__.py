"""Forge transport layer — gRPC + Protobuf hub ↔ spoke communication.

This package provides:
  - serialization: Pydantic ↔ proto-compatible dict conversion
  - hub_server: gRPC server (hub-side) that receives ContextualRecord streams
  - spoke_client: gRPC client (spoke-side) that pushes records to hub
  - transport_adapter: GrpcTransportAdapter wrapper for any AdapterBase
"""

from forge.transport.serialization import (
    proto_to_pydantic,
    pydantic_to_proto,
)

__all__ = [
    "proto_to_pydantic",
    "pydantic_to_proto",
]
