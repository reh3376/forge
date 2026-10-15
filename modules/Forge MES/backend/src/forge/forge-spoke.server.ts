/**
 * The spoke half of forge.v1.AdapterService, hosted by the backend
 * (BACKLOG FB-054): the hub dials this server for `Write`, `Discover` and
 * `Health`. Its address is advertised to the hub as the `grpc_callback_url`
 * Configure param by ForgeHubService.
 *
 * Every inbound call must carry the adapter id this backend registered with
 * and the session id the hub issued on Register; anything else is
 * PERMISSION_DENIED.
 *
 * Pull RPCs (BACKLOG FB-061): `Backfill` replays the audit log for a time
 * range (ForgeBackfillService) as a server stream; `Subscribe` mirrors the
 * ingest queue to the hub as a server stream (the subscription id travels in
 * the initial metadata `subscription-id`) until `Unsubscribe` or the hub
 * cancels. `Collect` and the hub-hosted half stay UNIMPLEMENTED.
 */
import * as grpc from "@grpc/grpc-js";
import * as fs from "fs";
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import { ContextualRecordMessage } from "./contextual-record.mapper";
import { FORGE_CONFIG, ForgeConfig } from "./forge.config";
import {
  BackfillStatus,
  ForgeBackfillSource,
  matchesTagFilter,
} from "./forge-backfill.service";
import { ForgeIngestService } from "./forge-ingest.service";
import {
  ForgeWriteService,
  SpokeWriteResult,
  WriteRejectedError,
  WriteStats,
} from "./forge-write.service";
import { fromTimestamp, getAdapterService, toStruct, toTimestamp } from "./proto";

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
  /** Pull RPCs (FB-061). */
  backfill: BackfillStatus & { streams: number; recordsStreamed: number };
  subscriptions: SubscriptionStatus[];
}

export interface SubscriptionStatus {
  id: string;
  tags: string[];
  startedAt: string;
  delivered: number;
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

/** RPCs this server does not implement (the hub-hosted half and Collect). */
const UNSERVED_RPCS = [
  "Register",
  "Configure",
  "Start",
  "Stop",
  "Ingest",
  "Collect",
] as const;

type BackfillRequestWire = {
  adapter_id?: string;
  session_id?: string;
  tags?: string[];
  start_time?: { seconds?: string | number; nanos?: number } | null;
  end_time?: { seconds?: string | number; nanos?: number } | null;
  max_records?: number | string;
};

type SubscribeRequestWire = {
  adapter_id?: string;
  session_id?: string;
  tags?: string[];
};

interface LiveSubscription {
  id: string;
  tags: string[];
  startedAt: number;
  delivered: number;
  end: () => void;
}

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
  private backfillStreams = 0;
  private backfillRecords = 0;
  private subscriptionSeq = 0;
  private readonly subscriptions = new Map<string, LiveSubscription>();

  constructor(
    @Inject(FORGE_CONFIG) private readonly config: ForgeConfig,
    private readonly writes: ForgeWriteService,
    private readonly ingest: ForgeIngestService,
    @Optional() private readonly backfill?: ForgeBackfillSource & { getStatus(): BackfillStatus }
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
    for (const sub of [...this.subscriptions.values()]) sub.end();
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
      backfill: {
        ...(this.backfill?.getStatus() ?? {
          enabled: false,
          runs: 0,
          recordsReplayed: 0,
          rowsScanned: 0,
        }),
        streams: this.backfillStreams,
        recordsStreamed: this.backfillRecords,
      },
      subscriptions: [...this.subscriptions.values()].map((s) => ({
        id: s.id,
        tags: [...s.tags],
        startedAt: new Date(s.startedAt).toISOString(),
        delivered: s.delivered,
      })),
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
      Unsubscribe: unary((req) => this.handleUnsubscribe(req)),
      Backfill: (call: grpc.ServerWritableStream<BackfillRequestWire, unknown>) => {
        void this.handleBackfill(call);
      },
      Subscribe: (call: grpc.ServerWritableStream<SubscribeRequestWire, unknown>) => {
        this.handleSubscribe(call);
      },
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

  // -- pull RPCs (FB-061) ----------------------------------------------------

  private async handleBackfill(
    call: grpc.ServerWritableStream<BackfillRequestWire, unknown>
  ): Promise<void> {
    let sent = 0;
    try {
      this.assertSession(call.request);
      if (!this.backfill) {
        throw {
          code: grpc.status.UNIMPLEMENTED,
          details: "backfill source is not configured on this spoke",
        } as grpc.ServiceError;
      }
      this.backfillStreams++;
      const range = {
        start: fromTimestamp(call.request.start_time),
        end: fromTimestamp(call.request.end_time),
        tags: (call.request.tags ?? []).map(String),
        maxRecords: Number(call.request.max_records ?? 0) || 0,
      };
      for await (const record of this.backfill.replay(range)) {
        if (call.cancelled) break;
        call.write(record);
        sent++;
      }
      this.backfillRecords += sent;
      call.end();
    } catch (err) {
      this.backfillRecords += sent;
      call.emit("error", this.toServiceError(err));
    }
  }

  private handleSubscribe(
    call: grpc.ServerWritableStream<SubscribeRequestWire, unknown>
  ): void {
    try {
      this.assertSession(call.request);
    } catch (err) {
      call.emit("error", this.toServiceError(err));
      return;
    }
    const id = `sub-${++this.subscriptionSeq}`;
    const tags = (call.request.tags ?? []).map(String);
    const metadata = new grpc.Metadata();
    metadata.set("subscription-id", id);
    call.sendMetadata(metadata);
    const entry: LiveSubscription = { id, tags, startedAt: Date.now(), delivered: 0, end: () => undefined };
    const release = this.ingest.onRecord((record: ContextualRecordMessage) => {
      if (!matchesTagFilter(record.source.tag_path, tags)) return;
      call.write(record);
      entry.delivered++;
    });
    let ended = false;
    entry.end = () => {
      if (ended) return;
      ended = true;
      release();
      this.subscriptions.delete(id);
      call.end();
    };
    this.subscriptions.set(id, entry);
    call.on("cancelled", () => {
      if (ended) return;
      ended = true;
      release();
      this.subscriptions.delete(id);
    });
    this.logger.log(`Subscription ${id} opened by the hub (tags=${tags.join(",") || "*"})`);
  }

  private async handleUnsubscribe(req: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.assertSession(req);
    const id = String(req.subscription_id ?? "");
    const entry = this.subscriptions.get(id);
    if (!entry) return { success: false, message: `unknown subscription '${id}'` };
    entry.end();
    return { success: true, message: `subscription '${id}' ended after ${entry.delivered} record(s)` };
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
