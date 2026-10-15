/**
 * Forge hub integration configuration.
 *
 * Every value comes from the environment so the backend can run with or
 * without a hub. The integration is opt-in: nothing is dialled unless
 * FORGE_HUB_ENABLED=true.
 *
 * Retry, circuit-breaker and dead-letter thresholds mirror the
 * `error_handling` section of `specs/forge-mes.facts.json`.
 */
export const FORGE_CONFIG = "FORGE_CONFIG";

export interface ForgeTlsConfig {
  enabled: boolean;
  /** PEM file paths; all optional (insecure channel when `enabled` is false). */
  caPath?: string;
  certPath?: string;
  keyPath?: string;
}

export interface ForgeIngestConfig {
  /** Records per Ingest stream. */
  batchSize: number;
  /** Timer-driven flush cadence. */
  flushIntervalMs: number;
  /** Bounded in-memory queue; oldest records are dropped beyond this. */
  maxQueue: number;
  /** FACTS error_handling.retry_policy */
  maxRetries: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
  /** FACTS error_handling.circuit_breaker */
  circuitFailureThreshold: number;
  circuitHalfOpenAfterMs: number;
  circuitSuccessThreshold: number;
}

export interface ForgeSpokeServerConfig {
  /** Host the hub -> spoke half of AdapterService (Write/Discover/Health). */
  enabled: boolean;
  /** Bind address of the spoke gRPC server. */
  bind: string;
  /**
   * Address the hub dials, advertised as `grpc_callback_url`. Defaults to the
   * bind host (localhost for wildcards) plus the bound port.
   */
  advertiseUrl?: string;
  /**
   * Refuse to serve the spoke port in plaintext (FB-063). Defaults to true when
   * NODE_ENV=production; `FORGE_HUB_TLS_*` then has to carry a cert and key.
   */
  requireTls: boolean;
  /**
   * Shared secret the hub must present on every callback RPC (metadata
   * `x-forge-callback-token`), advertised to the hub as `grpc_callback_token`
   * on Configure. Empty = a random token per process start.
   */
  callbackToken: string;
}

export interface ForgeConfig {
  enabled: boolean;
  /** host:port of the hub gRPC server (FORGE_GRPC_PORT on the hub, default 50051). */
  hubUrl: string;
  tls: ForgeTlsConfig;
  adapterId: string;
  /** ISA-95 site / area used for RecordContext when an event carries none. */
  site: string;
  area: string;
  ingest: ForgeIngestConfig;
  /** Health heartbeat cadence (defaults to the manifest's health_check_interval_ms). */
  healthIntervalMs: number;
  /** FACTS error_handling.health_degradation */
  degradedAfterFailures: number;
  failedAfterFailures: number;
  /** Deadline for unary RPCs and for one Ingest stream. */
  rpcTimeoutMs: number;
  /** Non-secret parameters sent to the hub on Configure. */
  connectionParams: Record<string, string>;
  /** The spoke-hosted gRPC server the hub calls back into (FB-054). */
  spoke: ForgeSpokeServerConfig;
}

type Getter = (key: string) => string | undefined;

function str(get: Getter, key: string, fallback: string): string {
  const v = get(key);
  return v === undefined || v === "" ? fallback : v;
}

function int(get: Getter, key: string, fallback: number): number {
  const v = get(key);
  if (v === undefined || v === "") return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function bool(get: Getter, key: string, fallback: boolean): boolean {
  const v = get(key);
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
}

/**
 * Build the configuration from an environment getter (ConfigService.get or
 * process.env lookup). Pure so it is trivially unit-testable.
 */
export function loadForgeConfig(get: Getter): ForgeConfig {
  const port = str(get, "PORT", "3000");
  return {
    enabled: bool(get, "FORGE_HUB_ENABLED", false),
    hubUrl: str(get, "FORGE_HUB_GRPC_URL", "localhost:50051"),
    tls: {
      enabled: bool(get, "FORGE_HUB_TLS_ENABLED", false),
      caPath: get("FORGE_HUB_TLS_CA") || undefined,
      certPath: get("FORGE_HUB_TLS_CERT") || undefined,
      keyPath: get("FORGE_HUB_TLS_KEY") || undefined,
    },
    adapterId: str(get, "FORGE_ADAPTER_ID", "forge-mes"),
    site: str(get, "FORGE_SITE", "whk01"),
    area: str(get, "FORGE_AREA", "distillery01"),
    ingest: {
      batchSize: int(get, "FORGE_INGEST_BATCH_SIZE", 100),
      flushIntervalMs: int(get, "FORGE_INGEST_FLUSH_INTERVAL_MS", 1000),
      maxQueue: int(get, "FORGE_INGEST_MAX_QUEUE", 10_000),
      maxRetries: 5,
      initialBackoffMs: 1000,
      maxBackoffMs: 30_000,
      circuitFailureThreshold: 5,
      circuitHalfOpenAfterMs: 45_000,
      circuitSuccessThreshold: 2,
    },
    healthIntervalMs: int(get, "FORGE_HEALTH_INTERVAL_MS", 15_000),
    degradedAfterFailures: 3,
    failedAfterFailures: 8,
    rpcTimeoutMs: int(get, "FORGE_RPC_TIMEOUT_MS", 10_000),
    spoke: {
      enabled: bool(get, "FORGE_SPOKE_GRPC_ENABLED", true),
      bind: str(get, "FORGE_SPOKE_GRPC_BIND", "0.0.0.0:50052"),
      advertiseUrl: get("FORGE_SPOKE_GRPC_ADVERTISE_URL") || undefined,
      requireTls: bool(
        get,
        "FORGE_SPOKE_REQUIRE_TLS",
        str(get, "NODE_ENV", "") === "production"
      ),
      callbackToken: str(get, "FORGE_SPOKE_CALLBACK_TOKEN", ""),
    },
    connectionParams: {
      // The hub-side adapter contract lists graphql_url as required; the
      // backend advertises its own endpoint. Secrets are never sent here.
      graphql_url: str(
        get,
        "FORGE_SELF_GRAPHQL_URL",
        `http://localhost:${port}/graphql`
      ),
      transport_mode: "push",
    },
  };
}
