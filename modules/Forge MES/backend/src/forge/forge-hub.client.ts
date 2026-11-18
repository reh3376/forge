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
import {
  getAdapterService,
  msToTimestamp,
  ProtoTimestamp,
  timestampToMs,
} from "./proto";

/** gRPC metadata header that carries T1 on Ingest, whose request is a stream (FB-092). */
export const SPOKE_TRANSMIT_TIME_HEADER = "x-forge-spoke-transmit-time";
/**
 * Headers that carry this spoke's last measurement on Ingest, beside T1: the offset
 * (hub clock minus this clock, seconds), the round trip (seconds) and its T4 (RFC 3339).
 * The hub judges this spoke's clock by them: every request is a probe (FB-093).
 */
export const SPOKE_OFFSET_HEADER = "x-forge-spoke-offset-seconds";
export const SPOKE_ROUND_TRIP_HEADER = "x-forge-spoke-round-trip-seconds";
export const SPOKE_MEASURED_AT_HEADER = "x-forge-spoke-measured-at";
/** Trailer of a refused Register or Ingest: the cause by name. */
export const REFUSAL_CAUSE_HEADER = "x-forge-refusal-cause";

const CLOCK_REFUSED_STATES = ["CLOCK_UNREADABLE", "CLOCK_OUT_OF_TOLERANCE"];

/**
 * The clock-refusal cause of a refused request (clock_unreadable, clock_out_of_tolerance),
 * or undefined for any other refusal. `named` is the hub's trailer; the hub's message
 * says it too, since it begins with the state.
 */
export function clockRefusalCause(
  named: string | undefined,
  message = ""
): string | undefined {
  const causes = CLOCK_REFUSED_STATES.map((s) => s.toLowerCase());
  if (named && causes.includes(named)) return named;
  const state = CLOCK_REFUSED_STATES.find((s) => message.startsWith(`${s}:`));
  return state?.toLowerCase();
}

/**
 * The hub refuses this spoke because it does not trust its clock (one-clock record P-5,
 * FB-093). Nothing of the request was taken. Health and Register still return the hub's
 * time, so this spoke goes on measuring and is readmitted after three good probes.
 */
export class HubClockRefusedError extends Error {
  constructor(
    message: string,
    readonly refusalCause: string
  ) {
    super(message);
    this.name = "HubClockRefusedError";
  }
}

/**
 * One hub <-> spoke time exchange: NTP's four timestamps, in epoch milliseconds
 * (one-clock record P-9, FB-092). t1 and t4 are this spoke's clock, t2 and t3 the hub's.
 * offsetSeconds is hub clock minus spoke clock, ((t2 - t1) + (t3 - t4)) / 2;
 * roundTripSeconds is (t4 - t1) - (t3 - t2), so the hub's own time on the request drops out.
 */
export interface TimeExchange {
  t1: number;
  t2: number;
  t3: number;
  t4: number;
  offsetSeconds: number;
  roundTripSeconds: number;
}

export function computeExchange(
  t1: number,
  t2: number,
  t3: number,
  t4: number
): TimeExchange {
  return {
    t1,
    t2,
    t3,
    t4,
    offsetSeconds: (t2 - t1 + (t3 - t4)) / 2 / 1000,
    roundTripSeconds: (t4 - t1 - (t3 - t2)) / 1000,
  };
}

interface HubTimeMessage {
  receive_time?: ProtoTimestamp;
  transmit_time?: ProtoTimestamp;
}
interface SpokeTimeMessage {
  transmit_time: ProtoTimestamp;
  offset_seconds?: number;
  round_trip_seconds?: number;
  measured_at?: ProtoTimestamp;
}

export interface RegisterResult {
  accepted: boolean;
  message: string;
  session_id: string;
  /** Set when the hub refused the registration for this spoke's clock (FB-093). */
  refusal_cause?: string;
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
  /** This spoke's wall clock in epoch milliseconds; T1 and T4 are read from it (FB-092). */
  now?: () => number;
}

type UnaryCallback<T> = (err: grpc.ServiceError | null, value?: T) => void;
type UnaryMethod<Req, Res> = (
  req: Req,
  options: grpc.CallOptions,
  cb: UnaryCallback<Res>
) => grpc.ClientUnaryCall;

export class ForgeHubClient {
  private client?: grpc.Client;
  private exchange?: TimeExchange;
  private exchangeCount = 0;
  private readonly now: () => number;

  constructor(private readonly opts: ForgeHubClientOptions) {
    this.now = opts.now ?? (() => Date.now());
  }

  // -- the time exchange (one clock, FB-092) ----------------------------------

  /** The last completed exchange with the hub, or undefined before the first. */
  get lastExchange(): TimeExchange | undefined {
    return this.exchange;
  }

  /** How many exchanges this client has completed. */
  get exchanges(): number {
    return this.exchangeCount;
  }

  /** T1 for a request, with the last exchange's result for the hub's series. */
  private spokeTime(t1: number): SpokeTimeMessage {
    const last = this.exchange;
    return {
      transmit_time: msToTimestamp(t1),
      ...(last
        ? {
            offset_seconds: last.offsetSeconds,
            round_trip_seconds: last.roundTripSeconds,
            measured_at: msToTimestamp(last.t4),
          }
        : {}),
    };
  }

  /** Take T4 and keep the exchange, when the hub answered with T2 and T3. */
  private completeExchange(t1: number, hubTime?: HubTimeMessage | null): void {
    const t4 = this.now();
    const t2 = timestampToMs(hubTime?.receive_time);
    const t3 = timestampToMs(hubTime?.transmit_time);
    if (t2 === undefined || t3 === undefined) return; // a hub from before FB-092
    this.exchange = computeExchange(t1, t2, t3, t4);
    this.exchangeCount++;
  }

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
    const t1 = this.now();
    return this.unary("Register", {
      manifest,
      spoke_time: this.spokeTime(t1),
    }).then((r) => {
      this.completeExchange(t1, (r as { hub_time?: HubTimeMessage })?.hub_time);
      const message = (r as RegisterResult).message ?? "";
      const accepted = Boolean((r as RegisterResult).accepted);
      return {
        accepted,
        message,
        session_id: (r as RegisterResult).session_id ?? "",
        // the hub refuses a spoke whose clock it does not trust (FB-093)
        refusal_cause: accepted ? undefined : clockRefusalCause(undefined, message),
      };
    });
  }

  /** A FAILED_PRECONDITION that names a clock refusal becomes a HubClockRefusedError. */
  private asRefusal(err: Error): Error {
    const status = err as Partial<grpc.ServiceError>;
    if (status.code !== grpc.status.FAILED_PRECONDITION) return err;
    const named = status.metadata?.get(REFUSAL_CAUSE_HEADER)[0];
    const details = status.details ?? err.message;
    const cause = clockRefusalCause(
      named === undefined ? undefined : String(named),
      details
    );
    return cause ? new HubClockRefusedError(`hub refused Ingest: ${details}`, cause) : err;
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

  /**
   * Health, which is also a time exchange (FB-092): it sends T1 and the offset and
   * round trip of the last exchange, so the hub keeps this spoke's clock series two-way,
   * and measures a new one from the hub's answer.
   */
  health(adapterId: string, sessionId: string): Promise<HubHealth> {
    const t1 = this.now();
    return this.unary<unknown, HubHealth & { hub_time?: HubTimeMessage }>(
      "Health",
      {
        adapter_id: adapterId,
        session_id: sessionId,
        spoke_time: this.spokeTime(t1),
      }
    ).then((h) => {
      this.completeExchange(t1, h?.hub_time);
      return {
        adapter_id: h?.adapter_id ?? adapterId,
        state: h?.state ?? "ADAPTER_STATE_UNSPECIFIED",
        error_message: h?.error_message,
        records_collected: numberOr(h?.records_collected),
        records_failed: numberOr(h?.records_failed),
        uptime_seconds: numberOr(h?.uptime_seconds),
      };
    });
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
    const t1 = this.now();
    const metadata = new grpc.Metadata();
    metadata.set("x-forge-adapter-id", adapterId);
    metadata.set("x-forge-session-id", sessionId);
    // T1 of the time exchange: the request is a stream of records, so it rides here.
    metadata.set(SPOKE_TRANSMIT_TIME_HEADER, new Date(t1).toISOString());
    const last = this.exchange;
    if (last) {
      // this spoke's last measurement: the hub judges its clock by it (FB-093)
      metadata.set(SPOKE_OFFSET_HEADER, String(last.offsetSeconds));
      metadata.set(SPOKE_ROUND_TRIP_HEADER, String(last.roundTripSeconds));
      metadata.set(SPOKE_MEASURED_AT_HEADER, new Date(last.t4).toISOString());
    }
    const sentAt = msToTimestamp(t1);

    return new Promise<IngestResult>((resolve, reject) => {
      const call = fn.call(client, metadata, this.deadline(), (err, value) => {
        if (err) reject(this.asRefusal(err));
        else {
          this.completeExchange(
            t1,
            (value as { hub_time?: HubTimeMessage } | undefined)?.hub_time
          );
          resolve({
            records_received: Number(value?.records_received ?? 0),
            success: Boolean(value?.success),
            message: value?.message ?? "",
          });
        }
      });
      call.on("error", (err: Error) => reject(this.asRefusal(err)));
      for (const record of records) {
        // this spoke's clock as the record leaves it (proto field 10)
        call.write(
          record.timestamp.spoke_time
            ? record
            : { ...record, timestamp: { ...record.timestamp, spoke_time: sentAt } }
        );
      }
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
