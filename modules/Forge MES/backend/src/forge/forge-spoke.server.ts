/**
 * The spoke half of forge.v1.AdapterService, hosted by the backend
 * (BACKLOG FB-054): the hub dials this server for `Write`, `Discover` and
 * `Health`. Its address is advertised to the hub as the `grpc_callback_url`
 * Configure param by ForgeHubService.
 *
 * Every inbound call must carry the adapter id this backend registered with
 * and the session id the hub issued on Register; anything else is
 * PERMISSION_DENIED. The hub-to-spoke pull RPCs (Collect, Subscribe,
 * Backfill, ...) are answered UNIMPLEMENTED (BACKLOG FB-061).
 */
import * as grpc from "@grpc/grpc-js";
import * as fs from "fs";
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { FORGE_CONFIG, ForgeConfig } from "./forge.config";
import { ForgeIngestService } from "./forge-ingest.service";
import {
  ForgeWriteService,
  SpokeWriteResult,
  WriteRejectedError,
  WriteStats,
} from "./forge-write.service";
import { getAdapterService, toStruct, toTimestamp } from "./proto";

export interface SpokeServerStatus {
  enabled: boolean;
  listening: boolean;
  bind: string;
  port?: number;
  advertisedUrl?: string;
  expectedSession?: string;
  writes: WriteStats;
  deniedCalls: number;
  unimplementedCalls: number;
  lastError?: string;
}

export type WriteValueKind =
  | "number"
  | "integer"
  | "string"
  | "bool"
  | "bytes"
  | "json"
  | "none";

/** Identity recorded on writes the hub performs (the hub has no requester field). */
export const HUB_REQUESTER = "forge-hub";

/** RPCs this server does not implement (hub-to-spoke pull + the hub-hosted half). */
const UNSERVED_RPCS = [
  "Register",
  "Configure",
  "Start",
  "Stop",
  "Ingest",
  "Collect",
  "Subscribe",
  "Unsubscribe",
  "Backfill",
] as const;

type WriteRequestWire = {
  adapter_id?: string;
  session_id?: string;
  tag_path?: string;
  confirm?: boolean;
  typed_value?: string;
  number_value?: number;
  integer_value?: string | number;
  string_value?: string;
  bool_value?: boolean;
  bytes_value?: Buffer | Uint8Array;
  json_value?: string;
};

/** Decode the `typed_value` oneof of a WriteRequest into a JS value. */
export function decodeWriteValue(req: WriteRequestWire): {
  value: unknown;
  kind: WriteValueKind;
} {
  const which =
    req.typed_value ??
    (["json_value", "number_value", "integer_value", "string_value", "bool_value", "bytes_value"] as const).find(
      (k) => req[k] !== undefined && req[k] !== null
    );
  switch (which) {
    case "json_value": {
      const text = String(req.json_value ?? "");
      try {
        return { value: JSON.parse(text), kind: "json" };
      } catch {
        throw new WriteRejectedError("invalid_payload", "json_value is not valid JSON");
      }
    }
    case "number_value":
      return { value: Number(req.number_value), kind: "number" };
    case "integer_value":
      return { value: Number(req.integer_value), kind: "integer" };
    case "string_value":
      return { value: String(req.string_value ?? ""), kind: "string" };
    case "bool_value":
      return { value: Boolean(req.bool_value), kind: "bool" };
    case "bytes_value":
      return { value: Buffer.from(req.bytes_value ?? []), kind: "bytes" };
    default:
      return { value: undefined, kind: "none" };
  }
}

/** Host part the hub should dial for a bind address (wildcards -> localhost). */
export function advertiseHostFor(bind: string): string {
  const idx = bind.lastIndexOf(":");
  const host = idx >= 0 ? bind.slice(0, idx) : bind;
  if (!host || ["0.0.0.0", "[::]", "::", "*"].includes(host)) return "localhost";
  return host;
}

@Injectable()
export class ForgeSpokeServer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ForgeSpokeServer.name);
  private server?: grpc.Server;
  private port?: number;
  private advertisedUrl?: string;
  private listening?: Promise<string | undefined>;
  private expectedSession?: string;
  private deniedCalls = 0;
  private unimplementedCalls = 0;
  private lastError?: string;
  private readonly startedAt = Date.now();

  constructor(
    @Inject(FORGE_CONFIG) private readonly config: ForgeConfig,
    private readonly writes: ForgeWriteService,
    private readonly ingest: ForgeIngestService
  ) {}

  get enabled(): boolean {
    return this.config.enabled && this.config.spoke.enabled;
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log(
        this.config.enabled
          ? "Spoke gRPC server disabled (FORGE_SPOKE_GRPC_ENABLED=false); hub write-back unavailable"
          : "Spoke gRPC server not started (FORGE_HUB_ENABLED != true)"
      );
      return;
    }
    this.listening = this.start().catch((err: unknown) => {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Spoke gRPC server failed to start (${this.lastError}); hub write-back unavailable`
      );
      return undefined;
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  /** Bind and serve; resolves to the URL the hub should dial. Idempotent. */
  async start(bind: string = this.config.spoke.bind): Promise<string> {
    if (this.server && this.advertisedUrl) return this.advertisedUrl;
    const Service = getAdapterService();
    const server = new grpc.Server();
    server.addService(Service.service, this.handlers());
    const port = await new Promise<number>((resolve, reject) => {
      server.bindAsync(bind, this.credentials(), (err, boundPort) => {
        if (err) reject(err);
        else resolve(boundPort);
      });
    });
    this.server = server;
    this.port = port;
    this.advertisedUrl =
      this.config.spoke.advertiseUrl ?? `${advertiseHostFor(bind)}:${port}`;
    this.logger.log(
      `Spoke AdapterService listening on ${bind} (port ${port}); advertising ${this.advertisedUrl} to the hub`
    );
    return this.advertisedUrl;
  }

  async stop(graceMs = 2000): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = undefined;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        server.forceShutdown();
        resolve();
      }, graceMs);
      timer.unref?.();
      server.tryShutdown(() => {
        clearTimeout(timer);
        resolve();
      });
    });
    this.logger.log("Spoke AdapterService stopped");
  }

  /** Resolves to the advertised URL, or undefined when the server is off/failed. */
  whenListening(): Promise<string | undefined> {
    return this.listening ?? Promise.resolve(this.advertisedUrl);
  }

  /** The hub-issued session id inbound calls must present. */
  setExpectedSession(sessionId: string | undefined): void {
    this.expectedSession = sessionId;
  }

  getStatus(): SpokeServerStatus {
    return {
      enabled: this.enabled,
      listening: Boolean(this.server),
      bind: this.config.spoke.bind,
      port: this.port,
      advertisedUrl: this.advertisedUrl,
      expectedSession: this.expectedSession,
      writes: this.writes.getStats(),
      deniedCalls: this.deniedCalls,
      unimplementedCalls: this.unimplementedCalls,
      lastError: this.lastError,
    };
  }

  // -- RPC handlers ----------------------------------------------------------

  private handlers(): grpc.UntypedServiceImplementation {
    const unary =
      (fn: (req: Record<string, unknown>) => Promise<unknown>) =>
      (
        call: grpc.ServerUnaryCall<Record<string, unknown>, unknown>,
        cb: grpc.sendUnaryData<unknown>
      ) => {
        fn(call.request).then(
          (res) => cb(null, res),
          (err: unknown) => cb(this.toServiceError(err))
        );
      };
    const impl: grpc.UntypedServiceImplementation = {
      Write: unary((req) => this.handleWrite(req as WriteRequestWire)),
      Discover: unary((req) => this.handleDiscover(req)),
      Health: unary((req) => this.handleHealth(req)),
    };
    for (const name of UNSERVED_RPCS) {
      impl[name] = (call: unknown, cb?: grpc.sendUnaryData<unknown>) => {
        this.unimplementedCalls++;
        const err = {
          code: grpc.status.UNIMPLEMENTED,
          details: `forge-mes spoke does not serve ${name}`,
        } as grpc.ServiceError;
        if (typeof cb === "function") cb(err);
        else (call as { emit: (e: string, v: unknown) => void }).emit("error", err);
      };
    }
    return impl;
  }

  private async handleWrite(req: WriteRequestWire): Promise<Record<string, unknown>> {
    this.assertSession(req);
    let decoded: { value: unknown; kind: WriteValueKind };
    try {
      decoded = decodeWriteValue(req);
    } catch (err) {
      if (err instanceof WriteRejectedError) {
        return { success: false, message: `${err.code}: ${err.message}` };
      }
      throw err;
    }
    const result: SpokeWriteResult = await this.writes.write(
      String(req.tag_path ?? ""),
      decoded.value,
      { confirm: Boolean(req.confirm), requestedBy: HUB_REQUESTER }
    );
    return {
      success: result.success,
      message: result.message,
      ...(result.readback ? { readback: result.readback } : {}),
    };
  }

  private async handleDiscover(req: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.assertSession(req);
    return {
      tags: this.writes.describe().map((t) => ({
        tag_path: t.tag_path,
        data_type: t.data_type,
        description: t.description,
        engineering_units: t.engineering_units ?? "",
        ...(t.metadata ? { metadata: toStruct(t.metadata) } : {}),
      })),
    };
  }

  private async handleHealth(req: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.assertSession(req);
    const ingest = this.ingest.getStatus();
    return {
      adapter_id: this.config.adapterId,
      state: ingest.sessionId ? "ADAPTER_STATE_HEALTHY" : "ADAPTER_STATE_CONNECTING",
      last_check: toTimestamp(new Date()),
      ...(ingest.lastFlushAt
        ? { last_healthy: toTimestamp(new Date(ingest.lastFlushAt)) }
        : {}),
      error_message: ingest.lastError ?? "",
      records_collected: String(ingest.recordsSent),
      records_failed: String(
        ingest.recordsDeadLettered + ingest.recordsDroppedQueueFull
      ),
      uptime_seconds: (Date.now() - this.startedAt) / 1000,
    };
  }

  private assertSession(req: { adapter_id?: unknown; session_id?: unknown }): void {
    const adapterOk = req.adapter_id === this.config.adapterId;
    const sessionOk =
      Boolean(this.expectedSession) && req.session_id === this.expectedSession;
    if (adapterOk && sessionOk) return;
    this.deniedCalls++;
    const detail = !adapterOk
      ? `adapter '${String(req.adapter_id)}' is not served here (this is '${this.config.adapterId}')`
      : this.expectedSession
        ? "session id does not match the hub-issued session"
        : "no hub session is active";
    throw { code: grpc.status.PERMISSION_DENIED, details: detail } as grpc.ServiceError;
  }

  private toServiceError(err: unknown): grpc.ServiceError {
    const maybe = err as { code?: unknown; details?: unknown; message?: unknown };
    if (typeof maybe?.code === "number") return err as grpc.ServiceError;
    const message = err instanceof Error ? err.message : String(err);
    this.lastError = message;
    return { code: grpc.status.INTERNAL, details: message } as grpc.ServiceError;
  }

  private credentials(): grpc.ServerCredentials {
    const tls = this.config.tls;
    if (!tls.enabled) return grpc.ServerCredentials.createInsecure();
    if (!tls.certPath || !tls.keyPath) {
      throw new Error(
        "FORGE_HUB_TLS_ENABLED=true requires FORGE_HUB_TLS_CERT and FORGE_HUB_TLS_KEY for the spoke server"
      );
    }
    const ca = tls.caPath ? fs.readFileSync(tls.caPath) : null;
    return grpc.ServerCredentials.createSsl(
      ca,
      [
        {
          cert_chain: fs.readFileSync(tls.certPath),
          private_key: fs.readFileSync(tls.keyPath),
        },
      ],
      Boolean(ca) // with a CA, require the hub to present a client certificate (mTLS)
    );
  }
}
