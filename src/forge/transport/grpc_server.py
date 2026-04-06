# ruff: noqa: TC001, N802
"""Hardened gRPC server — compiled protobuf servicer for hub-side AdapterService.

Wraps the existing AdapterServiceServicer in a real grpc.aio server using
compiled protobuf stubs. All messages are serialized/deserialized as binary
protobuf — no JSON on the wire. The proto_bridge module converts between
protobuf message objects and Pydantic domain models at the boundary.

Architecture:
    Spoke (GrpcChannel + AdapterServiceStub)
        ──binary protobuf over TCP/HTTP2──►
    GrpcServer (ForgeAdapterServiceServicer)
        ──proto_bridge──►
    AdapterServiceServicer (hub_server.py)

Wire format: Protobuf binary (schema-enforced, type-safe)
Serialization: Compiled stubs via grpcio-tools (not hand-rolled JSON)
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

import grpc
import grpc.aio

from forge.proto_gen.forge.v1 import adapter_pb2 as adapter_msg
from forge.proto_gen.forge.v1 import adapter_service_pb2 as service_msg
from forge.proto_gen.forge.v1 import adapter_service_pb2_grpc as service_grpc
from forge.proto_gen.forge.v1 import contextual_record_pb2 as record_msg
from forge.transport.hub_server import AdapterServiceServicer
from forge.transport.proto_bridge import (
    health_to_proto,
    proto_to_contextual_record,
    proto_to_manifest,
)

logger = logging.getLogger(__name__)


class ForgeAdapterServiceServicer(service_grpc.AdapterServiceServicer):
    """Compiled protobuf servicer bridging gRPC to the hub's AdapterServiceServicer.

    Each RPC method:
    1. Receives a compiled protobuf request message (deserialized from binary by grpc)
    2. Converts to Pydantic models / dicts via proto_bridge
    3. Delegates to the existing AdapterServiceServicer (hub_server.py)
    4. Converts the response back to a compiled protobuf message
    5. Returns the proto message (serialized to binary by grpc)
    """

    def __init__(self, servicer: AdapterServiceServicer) -> None:
        self._servicer = servicer

    # ── Control plane ────────────────────────────────────────────────────

    async def Register(
        self,
        request: service_msg.RegisterRequest,
        context: grpc.aio.ServicerContext,
    ) -> service_msg.RegisterResponse:
        """Register an adapter with the hub."""
        try:
            manifest = proto_to_manifest(request.manifest)
            from forge.transport.serialization import pydantic_to_proto

            manifest_dict = pydantic_to_proto(manifest)
            result = await self._servicer.register(manifest_dict)
            return service_msg.RegisterResponse(
                accepted=result.get("accepted", False),
                message=result.get("message", ""),
                session_id=result.get("session_id", ""),
            )
        except Exception as exc:
            logger.exception("Register RPC failed")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(exc))
            return service_msg.RegisterResponse(
                accepted=False, message=str(exc),
            )

    async def Configure(
        self,
        request: service_msg.ConfigureRequest,
        context: grpc.aio.ServicerContext,
    ) -> service_msg.ConfigureResponse:
        """Configure an adapter with connection parameters."""
        try:
            params = dict(request.params)
            result = await self._servicer.configure(
                request.adapter_id, request.session_id, params,
            )
            return service_msg.ConfigureResponse(
                success=result.get("success", False),
                message=result.get("message", ""),
            )
        except Exception as exc:
            logger.exception("Configure RPC failed")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(exc))
            return service_msg.ConfigureResponse(
                success=False, message=str(exc),
            )

    async def Start(
        self,
        request: service_msg.StartRequest,
        context: grpc.aio.ServicerContext,
    ) -> service_msg.StartResponse:
        """Start an adapter."""
        try:
            result = await self._servicer.start(
                request.adapter_id, request.session_id,
            )
            return service_msg.StartResponse(
                success=result.get("success", False),
                message=result.get("message", ""),
            )
        except Exception as exc:
            logger.exception("Start RPC failed")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(exc))
            return service_msg.StartResponse(
                success=False, message=str(exc),
            )

    async def Stop(
        self,
        request: service_msg.StopRequest,
        context: grpc.aio.ServicerContext,
    ) -> service_msg.StopResponse:
        """Stop an adapter."""
        try:
            result = await self._servicer.stop(
                request.adapter_id, request.session_id, request.graceful,
            )
            return service_msg.StopResponse(
                success=result.get("success", False),
                message=result.get("message", ""),
                records_flushed=result.get("records_flushed", 0),
            )
        except Exception as exc:
            logger.exception("Stop RPC failed")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(exc))
            return service_msg.StopResponse(
                success=False, message=str(exc),
            )

    async def Health(
        self,
        request: service_msg.HealthRequest,
        context: grpc.aio.ServicerContext,
    ) -> adapter_msg.AdapterHealth:
        """Return adapter health status."""
        try:
            result_dict = await self._servicer.health(
                request.adapter_id, request.session_id,
            )
            # result_dict is already a proto-compatible dict from hub_server
            # Convert it to a proper proto message via the Pydantic model
            from forge.transport.serialization import proto_to_pydantic

            health_model = proto_to_pydantic(result_dict, "AdapterHealth")
            return health_to_proto(health_model)
        except Exception as exc:
            logger.exception("Health RPC failed")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(exc))
            return adapter_msg.AdapterHealth()

    # ── Data plane ───────────────────────────────────────────────────────

    async def Ingest(
        self,
        request_iterator: AsyncIterator[record_msg.ContextualRecord],
        context: grpc.aio.ServicerContext,
    ) -> service_msg.IngestResponse:
        """Client-streaming: spoke pushes ContextualRecords to hub.

        adapter_id and session_id are passed via gRPC metadata headers:
            x-forge-adapter-id, x-forge-session-id
        """
        # Extract metadata
        metadata = dict(context.invocation_metadata())
        session_id = metadata.get("x-forge-session-id")
        _adapter_id = metadata.get("x-forge-adapter-id")  # reserved for future routing

        if not session_id:
            # Fallback: use most recent session
            sessions = list(self._servicer._sessions.values())
            if sessions:
                session_id = sessions[-1].session_id
            else:
                context.set_code(grpc.StatusCode.FAILED_PRECONDITION)
                context.set_details("No active sessions")
                return service_msg.IngestResponse(
                    records_received=0, success=False,
                    message="No active sessions",
                )

        count = 0
        try:
            async for proto_record in request_iterator:
                # Convert proto message to dict for the existing servicer
                pydantic_record = proto_to_contextual_record(proto_record)
                from forge.transport.serialization import pydantic_to_proto

                record_dict = pydantic_to_proto(pydantic_record)
                await self._servicer.receive_record(session_id, record_dict)
                count += 1

            logger.info(
                "Ingest stream completed: %d records from session %s",
                count, session_id,
            )
            return service_msg.IngestResponse(
                records_received=count, success=True, message="OK",
            )
        except Exception as exc:
            logger.exception("Ingest RPC failed after %d records", count)
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(exc))
            return service_msg.IngestResponse(
                records_received=count, success=False, message=str(exc),
            )


class GrpcServer:
    """Hardened gRPC server backed by grpc.aio with compiled protobuf stubs.

    Uses `add_AdapterServiceServicer_to_server` from compiled grpc stubs
    to register the servicer — binary protobuf serialization on the wire,
    schema-enforced message types, proper gRPC status codes.

    Usage:
        servicer = InMemoryServicer()
        server = GrpcServer(servicer, port=50051)
        await server.start()
        # ... clients connect with compiled stubs ...
        await server.stop()
    """

    def __init__(
        self,
        servicer: AdapterServiceServicer,
        port: int = 50051,
        host: str = "[::]",
    ) -> None:
        self._servicer = servicer
        self._port = port
        self._host = host
        self._server: grpc.aio.Server | None = None
        self._proto_servicer = ForgeAdapterServiceServicer(servicer)

    @property
    def port(self) -> int:
        return self._port

    @property
    def address(self) -> str:
        return f"{self._host}:{self._port}"

    async def start(self) -> int:
        """Start the gRPC server. Returns the actual port bound.

        If port=0, the OS assigns a free port (useful for testing).
        """
        self._server = grpc.aio.server()
        # Use compiled stub registration — proper protobuf serializers
        service_grpc.add_AdapterServiceServicer_to_server(
            self._proto_servicer, self._server,
        )
        actual_port = self._server.add_insecure_port(f"{self._host}:{self._port}")
        self._port = actual_port
        await self._server.start()
        logger.info("gRPC server started on port %d (protobuf binary)", actual_port)
        return actual_port

    async def stop(self, grace: float = 5.0) -> None:
        """Gracefully stop the server."""
        if self._server:
            await self._server.stop(grace)
            logger.info("gRPC server stopped")

    async def wait_for_termination(self, timeout: float | None = None) -> None:
        """Block until the server terminates."""
        if self._server:
            await self._server.wait_for_termination(timeout)
