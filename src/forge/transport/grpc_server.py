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
import os
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

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


@dataclass(frozen=True)
class ServerTls:
    """TLS material for the hub's gRPC listener (spoke → hub direction, FB-072).

    ``cert_path`` + ``key_path`` serve the port; ``ca_path`` makes the hub
    require a client certificate signed by that CA (mTLS) unless
    ``require_client_cert`` says otherwise. Built from ``<prefix>_CERT`` /
    ``_KEY`` / ``_CA`` by :meth:`from_env`. Pairs with the spoke side's
    ``FORGE_HUB_TLS_*`` (NestJS backend) and ``ChannelTls`` (Python spokes).
    """

    cert_path: str
    key_path: str
    ca_path: str | None = None
    require_client_cert: bool | None = None

    @classmethod
    def from_env(cls, prefix: str = "FORGE_GRPC_TLS") -> ServerTls | None:
        cert = os.getenv(f"{prefix}_CERT", "").strip() or None
        key = os.getenv(f"{prefix}_KEY", "").strip() or None
        ca = os.getenv(f"{prefix}_CA", "").strip() or None
        if cert is None and key is None:
            return None
        if cert is None or key is None:
            msg = f"{prefix}_CERT and {prefix}_KEY must both be set for a TLS gRPC server"
            raise ValueError(msg)
        raw = os.getenv(f"{prefix}_REQUIRE_CLIENT_CERT", "").strip().lower()
        require = None if raw == "" else raw in ("1", "true", "yes", "on")
        return cls(cert_path=cert, key_path=key, ca_path=ca, require_client_cert=require)

    @property
    def mtls(self) -> bool:
        return bool(self.ca_path) if self.require_client_cert is None else self.require_client_cert

    def credentials(self) -> grpc.ServerCredentials:
        if self.mtls and not self.ca_path:
            msg = "require_client_cert needs ca_path to verify client certificates against"
            raise ValueError(msg)
        cert = Path(self.cert_path).read_bytes()
        key = Path(self.key_path).read_bytes()
        ca = Path(self.ca_path).read_bytes() if self.ca_path else None
        return grpc.ssl_server_credentials(
            [(key, cert)], root_certificates=ca, require_client_auth=self.mtls
        )

    def describe(self) -> dict[str, Any]:
        return {"enabled": True, "mtls": self.mtls, "ca": bool(self.ca_path)}


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
                accepted=False,
                message=str(exc),
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
                request.adapter_id,
                request.session_id,
                params,
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
                success=False,
                message=str(exc),
            )

    async def Start(
        self,
        request: service_msg.StartRequest,
        context: grpc.aio.ServicerContext,
    ) -> service_msg.StartResponse:
        """Start an adapter."""
        try:
            result = await self._servicer.start(
                request.adapter_id,
                request.session_id,
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
                success=False,
                message=str(exc),
            )

    async def Stop(
        self,
        request: service_msg.StopRequest,
        context: grpc.aio.ServicerContext,
    ) -> service_msg.StopResponse:
        """Stop an adapter."""
        try:
            result = await self._servicer.stop(
                request.adapter_id,
                request.session_id,
                request.graceful,
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
                success=False,
                message=str(exc),
            )

    async def Health(
        self,
        request: service_msg.HealthRequest,
        context: grpc.aio.ServicerContext,
    ) -> adapter_msg.AdapterHealth:
        """Return adapter health status."""
        try:
            result_dict = await self._servicer.health(
                request.adapter_id,
                request.session_id,
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
                    records_received=0,
                    success=False,
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

            message = "OK"
            end_hook = getattr(self._servicer, "end_of_stream", None)
            if callable(end_hook):
                message = str(await end_hook(session_id))
            logger.info(
                "Ingest stream completed: %d records from session %s (%s)",
                count,
                session_id,
                message,
            )
            return service_msg.IngestResponse(
                records_received=count,
                success=True,
                message=message,
            )
        except Exception as exc:
            logger.exception("Ingest RPC failed after %d records", count)
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(exc))
            return service_msg.IngestResponse(
                records_received=count,
                success=False,
                message=str(exc),
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
        *,
        tls: ServerTls | None = None,
        require_tls: bool = False,
    ) -> None:
        """Args: tls — serve the port with TLS/mTLS (plaintext when None);
        require_tls — refuse to start in plaintext (production guard)."""
        self._servicer = servicer
        self._port = port
        self._host = host
        self._tls = tls
        self._require_tls = require_tls
        self._server: grpc.aio.Server | None = None
        self._proto_servicer = ForgeAdapterServiceServicer(servicer)

    @property
    def tls(self) -> ServerTls | None:
        return self._tls

    def describe(self) -> dict[str, Any]:
        return {
            "address": self.address,
            "require_tls": self._require_tls,
            "tls": self._tls.describe() if self._tls is not None else {"enabled": False},
        }

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
        if self._tls is None and self._require_tls:
            msg = (
                "gRPC server refuses to start in plaintext: FORGE_GRPC_REQUIRE_TLS is on but "
                "FORGE_GRPC_TLS_CERT/_KEY are not set"
            )
            raise RuntimeError(msg)
        self._server = grpc.aio.server()
        # Use compiled stub registration — proper protobuf serializers
        service_grpc.add_AdapterServiceServicer_to_server(
            self._proto_servicer,
            self._server,
        )
        address = f"{self._host}:{self._port}"
        if self._tls is not None:
            actual_port = self._server.add_secure_port(address, self._tls.credentials())
        else:
            actual_port = self._server.add_insecure_port(address)
            logger.warning(
                "gRPC server on %s is plaintext; set FORGE_GRPC_TLS_CERT/_KEY (and _CA for mTLS)",
                address,
            )
        self._port = actual_port
        await self._server.start()
        logger.info(
            "gRPC server started on port %d (protobuf binary, %s)",
            actual_port,
            "mTLS"
            if self._tls is not None and self._tls.mtls
            else "TLS"
            if self._tls
            else "plaintext",
        )
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
