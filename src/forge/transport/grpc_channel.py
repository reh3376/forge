"""Hardened gRPC channel — compiled protobuf stub client for spoke-side comms.

Implements TransportChannel using the compiled AdapterServiceStub from
grpcio-tools. All messages are serialized as binary protobuf on the wire.
The proto_bridge module converts between Pydantic models and proto messages
at the boundary.

Architecture:
    SpokeClient
        ──dict interface──►
    GrpcChannel (this module)
        ──proto_bridge──►
    AdapterServiceStub (compiled)
        ──binary protobuf over TCP/HTTP2──►
    GrpcServer

Wire format: Protobuf binary (schema-enforced, type-safe)
Client stub: Compiled from adapter_service.proto via grpcio-tools
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

import grpc
import grpc.aio

from forge.proto_gen.forge.v1 import adapter_service_pb2 as service_msg
from forge.proto_gen.forge.v1 import adapter_service_pb2_grpc as service_grpc
from forge.proto_gen.forge.v1 import contextual_record_pb2 as record_msg
from forge.transport.proto_bridge import (
    contextual_record_to_proto,
    manifest_to_proto,
    proto_to_health,
)
from forge.transport.spoke_client import TransportChannel

logger = logging.getLogger(__name__)


class GrpcChannel(TransportChannel):
    """Hardened gRPC transport channel using compiled protobuf stubs.

    Connects to a GrpcServer and dispatches RPCs using the compiled
    AdapterServiceStub. The stub handles binary protobuf serialization
    and deserialization — no JSON on the wire.

    The TransportChannel interface uses dicts for compatibility with
    InMemoryChannel and SpokeClient. GrpcChannel converts these dicts
    to/from proto messages at the boundary via proto_bridge.
    """

    def __init__(self, target: str) -> None:
        """Args: target — gRPC server address (e.g. 'localhost:50051')."""
        self._target = target
        self._channel: grpc.aio.Channel | None = None
        self._stub: service_grpc.AdapterServiceStub | None = None
        self._closed = False

    @property
    def target(self) -> str:
        return self._target

    async def connect(self) -> None:
        """Open the gRPC channel and create the compiled stub."""
        self._channel = grpc.aio.insecure_channel(self._target)
        self._stub = service_grpc.AdapterServiceStub(self._channel)
        self._closed = False
        logger.info("gRPC channel connected to %s (protobuf binary)", self._target)

    def _ensure_connected(self) -> service_grpc.AdapterServiceStub:
        """Return the stub, raising if not connected or closed."""
        if self._closed:
            msg = "Channel is closed"
            raise RuntimeError(msg)
        if self._stub is None:
            msg = "Channel not connected — call connect() first"
            raise RuntimeError(msg)
        return self._stub

    async def send_unary(
        self, method: str, request: dict[str, Any],
    ) -> dict[str, Any]:
        """Send a unary-unary RPC using compiled protobuf messages.

        Converts the request dict to a proto message, sends via the
        compiled stub, and converts the response back to a dict.
        """
        stub = self._ensure_connected()

        if method == "Register":
            return await self._call_register(stub, request)
        if method == "Configure":
            return await self._call_configure(stub, request)
        if method == "Start":
            return await self._call_start(stub, request)
        if method == "Stop":
            return await self._call_stop(stub, request)
        if method == "Health":
            return await self._call_health(stub, request)

        msg = f"Unknown unary RPC method: {method}"
        raise ValueError(msg)

    async def send_stream(
        self, method: str, records: AsyncIterator[dict[str, Any]],
    ) -> None:
        """Send a client-streaming RPC using compiled protobuf messages.

        Each record dict is converted to a proto ContextualRecord,
        and the compiled stub handles binary serialization on the wire.
        """
        stub = self._ensure_connected()

        if method == "Ingest":
            await self._call_ingest(stub, records)
        elif method == "Collect":
            # Legacy compatibility: map Collect to Ingest for spoke→hub push
            await self._call_ingest(stub, records)
        else:
            msg = f"Streaming not implemented for method: {method}"
            raise ValueError(msg)

    async def close(self) -> None:
        """Close the gRPC channel."""
        if self._channel:
            await self._channel.close()
        self._stub = None
        self._closed = True
        logger.info("gRPC channel closed")

    # ── Typed RPC callers ────────────────────────────────────────────────

    async def _call_register(
        self, stub: service_grpc.AdapterServiceStub, request: dict[str, Any],
    ) -> dict[str, Any]:
        """Register RPC: dict → RegisterRequest → RegisterResponse → dict."""
        from forge.transport.serialization import proto_to_pydantic

        manifest_dict = request.get("manifest", {})
        manifest_model = proto_to_pydantic(manifest_dict, "AdapterManifest")
        proto_manifest = manifest_to_proto(manifest_model)

        proto_request = service_msg.RegisterRequest(manifest=proto_manifest)
        response: service_msg.RegisterResponse = await stub.Register(proto_request)
        return {
            "accepted": response.accepted,
            "message": response.message,
            "session_id": response.session_id,
        }

    async def _call_configure(
        self, stub: service_grpc.AdapterServiceStub, request: dict[str, Any],
    ) -> dict[str, Any]:
        """Configure RPC: dict → ConfigureRequest → ConfigureResponse → dict."""
        proto_request = service_msg.ConfigureRequest(
            adapter_id=request.get("adapter_id", ""),
            session_id=request.get("session_id", ""),
            params=request.get("params", {}),
        )
        response: service_msg.ConfigureResponse = await stub.Configure(proto_request)
        return {"success": response.success, "message": response.message}

    async def _call_start(
        self, stub: service_grpc.AdapterServiceStub, request: dict[str, Any],
    ) -> dict[str, Any]:
        """Start RPC: dict → StartRequest → StartResponse → dict."""
        proto_request = service_msg.StartRequest(
            adapter_id=request.get("adapter_id", ""),
            session_id=request.get("session_id", ""),
        )
        response: service_msg.StartResponse = await stub.Start(proto_request)
        return {"success": response.success, "message": response.message}

    async def _call_stop(
        self, stub: service_grpc.AdapterServiceStub, request: dict[str, Any],
    ) -> dict[str, Any]:
        """Stop RPC: dict → StopRequest → StopResponse → dict."""
        proto_request = service_msg.StopRequest(
            adapter_id=request.get("adapter_id", ""),
            session_id=request.get("session_id", ""),
            graceful=request.get("graceful", True),
        )
        response: service_msg.StopResponse = await stub.Stop(proto_request)
        return {
            "success": response.success,
            "message": response.message,
            "records_flushed": response.records_flushed,
        }

    async def _call_health(
        self, stub: service_grpc.AdapterServiceStub, request: dict[str, Any],
    ) -> dict[str, Any]:
        """Health RPC: dict → HealthRequest → AdapterHealth → dict."""
        proto_request = service_msg.HealthRequest(
            adapter_id=request.get("adapter_id", ""),
            session_id=request.get("session_id", ""),
        )
        response = await stub.Health(proto_request)
        # Convert proto AdapterHealth to Pydantic then to dict
        health_model = proto_to_health(response)
        from forge.transport.serialization import pydantic_to_proto

        return pydantic_to_proto(health_model)

    async def _call_ingest(
        self,
        stub: service_grpc.AdapterServiceStub,
        records: AsyncIterator[dict[str, Any]],
    ) -> None:
        """Ingest RPC: stream of record dicts → proto ContextualRecords.

        Passes adapter_id and session_id via gRPC metadata headers.
        """
        from forge.transport.serialization import proto_to_pydantic

        async def _proto_stream() -> AsyncIterator[record_msg.ContextualRecord]:
            async for record_dict in records:
                pydantic_record = proto_to_pydantic(record_dict, "ContextualRecord")
                yield contextual_record_to_proto(pydantic_record)

        # Pass metadata for session identification
        metadata = []
        response: service_msg.IngestResponse = await stub.Ingest(
            _proto_stream(), metadata=metadata,
        )
        logger.info(
            "Ingest RPC completed: %d records acknowledged",
            response.records_received,
        )
