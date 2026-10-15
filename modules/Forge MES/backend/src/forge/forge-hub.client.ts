/**
 * Thin gRPC client for the hub's forge.v1.AdapterService (spoke -> hub half):
 * Register, Configure, Start, Stop, Health and the client-streaming Ingest.
 *
 * The hub reads `x-forge-adapter-id` / `x-forge-session-id` from the Ingest
 * metadata (see hub `grpc_server.py`), so both are attached to every stream.
 */
import * as grpc from "@grpc/grpc-js";
import * as fs from "fs";
import type { ContextualRecordMessage } from "./contextual-record.mapper";
import type { ForgeTlsConfig } from "./forge.config";
import type { ProtoAdapterManifest } from "./forge-manifest";
import { getAdapterService } from "./proto";

export interface RegisterResult {
  accepted: boolean;
  message: string;
  session_id: string;
}
export interface AckResult {
  success: boolean;
  message: string;
}
export interface StopResult extends AckResult {
  records_flushed: number;
}
export interface IngestResult {
  records_received: number;
  success: boolean;
  message: string;
}
export interface HubHealth {
  adapter_id: string;
  state: string;
  error_message?: string;
  records_collected?: number;
  records_failed?: number;
  uptime_seconds?: number;
}

export interface ForgeHubClientOptions {
  url: string;
  tls?: ForgeTlsConfig;
  rpcTimeoutMs: number;
}

type UnaryCallback<T> = (err: grpc.ServiceError | null, value?: T) => void;
type UnaryMethod<Req, Res> = (
  req: Req,
  options: grpc.CallOptions,
  cb: UnaryCallback<Res>
) => grpc.ClientUnaryCall;

export class ForgeHubClient {
  private client?: grpc.Client;

  constructor(private readonly opts: ForgeHubClientOptions) {}

  /** Target address as given (host:port). */
  get url(): string {
    return this.opts.url;
  }

  private credentials(): grpc.ChannelCredentials {
    const tls = this.opts.tls;
    if (!tls?.enabled) return grpc.credentials.createInsecure();
    const read = (p?: string) => (p ? fs.readFileSync(p) : null);
    return grpc.credentials.createSsl(
      read(tls.caPath),
      read(tls.keyPath),
      read(tls.certPath)
    );
  }

  /** Create the underlying channel (idempotent). */
  connect(): void {
    if (this.client) return;
    const Service = getAdapterService();
    this.client = new Service(this.opts.url, this.credentials(), {
      "grpc.keepalive_time_ms": 30_000,
      "grpc.keepalive_permit_without_calls": 1,
    });
  }

  private raw(): grpc.Client & Record<string, unknown> {
    this.connect();
    return this.client as grpc.Client & Record<string, unknown>;
  }

  private deadline(): grpc.CallOptions {
    return { deadline: Date.now() + this.opts.rpcTimeoutMs };
  }

  private unary<Req, Res>(method: string, req: Req): Promise<Res> {
    const fn = this.raw()[method] as UnaryMethod<Req, Res> | undefined;
    if (typeof fn !== "function") {
      return Promise.reject(new Error(`AdapterService has no method ${method}`));
    }
    return new Promise<Res>((resolve, reject) => {
      fn.call(this.raw(), req, this.deadline(), (err, value) => {
        if (err) reject(err);
        else resolve(value as Res);
      });
    });
  }

  register(manifest: ProtoAdapterManifest): Promise<RegisterResult> {
    return this.unary("Register", { manifest }).then((r) => ({
      accepted: Boolean((r as RegisterResult).accepted),
      message: (r as RegisterResult).message ?? "",
      session_id: (r as RegisterResult).session_id ?? "",
    }));
  }

  configure(
    adapterId: string,
    sessionId: string,
    params: Record<string, string>
  ): Promise<AckResult> {
    return this.unary<unknown, AckResult>("Configure", {
      adapter_id: adapterId,
      session_id: sessionId,
      params,
    }).then(normalizeAck);
  }

  start(adapterId: string, sessionId: string): Promise<AckResult> {
    return this.unary<unknown, AckResult>("Start", {
      adapter_id: adapterId,
      session_id: sessionId,
    }).then(normalizeAck);
  }

  stop(
    adapterId: string,
    sessionId: string,
    graceful = true
  ): Promise<StopResult> {
    return this.unary<unknown, StopResult>("Stop", {
      adapter_id: adapterId,
      session_id: sessionId,
      graceful,
    }).then((r) => ({
      ...normalizeAck(r),
      records_flushed: Number(r?.records_flushed ?? 0),
    }));
  }

  health(adapterId: string, sessionId: string): Promise<HubHealth> {
    return this.unary<unknown, HubHealth>("Health", {
      adapter_id: adapterId,
      session_id: sessionId,
    }).then((h) => ({
      adapter_id: h?.adapter_id ?? adapterId,
      state: h?.state ?? "ADAPTER_STATE_UNSPECIFIED",
      error_message: h?.error_message,
      records_collected: numberOr(h?.records_collected),
      records_failed: numberOr(h?.records_failed),
      uptime_seconds: numberOr(h?.uptime_seconds),
    }));
  }

  /** Client-streaming Ingest: one stream per batch, resolved by IngestResponse. */
  ingest(
    adapterId: string,
    sessionId: string,
    records: ContextualRecordMessage[]
  ): Promise<IngestResult> {
    const client = this.raw();
    const fn = client["Ingest"] as
      | ((
          md: grpc.Metadata,
          options: grpc.CallOptions,
          cb: UnaryCallback<IngestResult>
        ) => grpc.ClientWritableStream<ContextualRecordMessage>)
      | undefined;
    if (typeof fn !== "function") {
      return Promise.reject(new Error("AdapterService has no method Ingest"));
    }
    const metadata = new grpc.Metadata();
    metadata.set("x-forge-adapter-id", adapterId);
    metadata.set("x-forge-session-id", sessionId);

    return new Promise<IngestResult>((resolve, reject) => {
      const call = fn.call(client, metadata, this.deadline(), (err, value) => {
        if (err) reject(err);
        else
          resolve({
            records_received: Number(value?.records_received ?? 0),
            success: Boolean(value?.success),
            message: value?.message ?? "",
          });
      });
      call.on("error", (err: Error) => reject(err));
      for (const record of records) call.write(record);
      call.end();
    });
  }

  close(): void {
    this.client?.close();
    this.client = undefined;
  }
}

function normalizeAck(r: Partial<AckResult> | undefined): AckResult {
  return { success: Boolean(r?.success), message: r?.message ?? "" };
}

function numberOr(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
