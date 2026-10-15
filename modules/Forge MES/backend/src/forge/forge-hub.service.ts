/**
 * Adapter session lifecycle against the Forge hub:
 *   Register(manifest) -> Configure(params) -> Start -> Health heartbeat
 * and, on shutdown, drain the ingest queue -> Stop(graceful).
 *
 * Startup never blocks the MES: the handshake runs in the background and
 * retries with exponential backoff until the hub answers. Health failures
 * degrade and eventually reset the session per FACTS health_degradation.
 */
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { FORGE_CONFIG, ForgeConfig } from "./forge.config";
import { ForgeHubClient, HubHealth } from "./forge-hub.client";
import { ForgeIngestService } from "./forge-ingest.service";
import { FORGE_MES_MANIFEST, toProtoManifest } from "./forge-manifest";

export type HubSessionState =
  | "disabled"
  | "connecting"
  | "healthy"
  | "degraded"
  | "failed"
  | "stopped";

export interface HubStatus {
  enabled: boolean;
  hubUrl: string;
  adapterId: string;
  adapterVersion: string;
  state: HubSessionState;
  sessionId?: string;
  registeredAt?: string;
  lastHealthAt?: string;
  lastHealth?: HubHealth;
  healthFailures: number;
  reconnects: number;
  lastError?: string;
}

@Injectable()
export class ForgeHubService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ForgeHubService.name);
  private state: HubSessionState = "disabled";
  private sessionId?: string;
  private registeredAt?: Date;
  private lastHealthAt?: Date;
  private lastHealth?: HubHealth;
  private healthFailures = 0;
  private reconnects = 0;
  private lastError?: string;
  private heartbeat?: NodeJS.Timeout;
  private destroyed = false;
  private connecting?: Promise<void>;

  constructor(
    @Inject(FORGE_CONFIG) private readonly config: ForgeConfig,
    private readonly client: ForgeHubClient,
    private readonly ingest: ForgeIngestService
  ) {}

  onModuleInit(): void {
    if (!this.config.enabled) {
      this.logger.log("Forge hub integration disabled (FORGE_HUB_ENABLED != true)");
      return;
    }
    this.logger.log(
      `Forge hub integration enabled: adapter=${this.config.adapterId} hub=${this.config.hubUrl}`
    );
    this.connecting = this.connectLoop();
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    this.stopHeartbeat();
    if (this.sessionId) {
      try {
        await this.ingest.drain();
      } catch (err) {
        this.logger.warn(`Ingest drain on shutdown failed: ${err}`);
      }
      try {
        const res = await this.client.stop(
          this.config.adapterId,
          this.sessionId,
          true
        );
        this.logger.log(
          `Hub session stopped (flushed=${res.records_flushed}, ${res.message})`
        );
      } catch (err) {
        this.logger.warn(`Hub Stop failed on shutdown: ${err}`);
      }
    }
    this.ingest.stop();
    this.client.close();
    this.state = this.config.enabled ? "stopped" : "disabled";
  }

  /** Resolves when the first handshake attempt sequence finishes (tests). */
  whenConnected(): Promise<void> {
    return this.connecting ?? Promise.resolve();
  }

  getStatus(): HubStatus {
    return {
      enabled: this.config.enabled,
      hubUrl: this.config.hubUrl,
      adapterId: this.config.adapterId,
      adapterVersion: FORGE_MES_MANIFEST.version,
      state: this.state,
      sessionId: this.sessionId,
      registeredAt: this.registeredAt?.toISOString(),
      lastHealthAt: this.lastHealthAt?.toISOString(),
      lastHealth: this.lastHealth,
      healthFailures: this.healthFailures,
      reconnects: this.reconnects,
      lastError: this.lastError,
    };
  }

  // -- handshake -------------------------------------------------------------

  /** Register/Configure/Start with backoff until it succeeds or the app stops. */
  private async connectLoop(): Promise<void> {
    const { initialBackoffMs, maxBackoffMs } = this.config.ingest;
    let attempt = 0;
    this.state = "connecting";
    while (!this.destroyed) {
      try {
        await this.handshake();
        return;
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err);
        const delay = Math.min(initialBackoffMs * 2 ** attempt, maxBackoffMs);
        attempt = Math.min(attempt + 1, 10);
        this.logger.warn(
          `Hub handshake failed (${this.lastError}); retrying in ${delay} ms`
        );
        await sleep(delay);
      }
    }
  }

  private async handshake(): Promise<void> {
    const manifest = toProtoManifest(FORGE_MES_MANIFEST, {
      adapterId: this.config.adapterId,
    });
    const reg = await this.client.register(manifest);
    if (!reg.accepted || !reg.session_id) {
      throw new Error(`hub rejected registration: ${reg.message || "no reason"}`);
    }
    const cfg = await this.client.configure(
      this.config.adapterId,
      reg.session_id,
      this.config.connectionParams
    );
    if (!cfg.success) throw new Error(`hub Configure failed: ${cfg.message}`);
    const started = await this.client.start(this.config.adapterId, reg.session_id);
    if (!started.success) throw new Error(`hub Start failed: ${started.message}`);

    this.sessionId = reg.session_id;
    this.registeredAt = new Date();
    this.healthFailures = 0;
    this.lastError = undefined;
    this.state = "healthy";
    this.ingest.setSession(reg.session_id);
    this.logger.log(
      `Registered with Forge hub: session=${reg.session_id} (${reg.message || "accepted"})`
    );
    this.startHeartbeat();
  }

  // -- heartbeat -------------------------------------------------------------

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      void this.checkHealth();
    }, this.config.healthIntervalMs);
    this.heartbeat.unref?.();
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
  }

  /** One heartbeat; exposed for tests. */
  async checkHealth(): Promise<void> {
    if (!this.sessionId || this.destroyed) return;
    try {
      this.lastHealth = await this.client.health(
        this.config.adapterId,
        this.sessionId
      );
      this.lastHealthAt = new Date();
      this.healthFailures = 0;
      if (this.state !== "healthy") this.logger.log("Hub session healthy again");
      this.state = "healthy";
    } catch (err) {
      this.healthFailures++;
      this.lastError = err instanceof Error ? err.message : String(err);
      if (this.healthFailures >= this.config.failedAfterFailures) {
        this.state = "failed";
        this.logger.error(
          `Hub health failed ${this.healthFailures}x; re-registering (${this.lastError})`
        );
        this.resetSession();
        this.reconnects++;
        this.connecting = this.connectLoop();
      } else if (this.healthFailures >= this.config.degradedAfterFailures) {
        this.state = "degraded";
        this.logger.warn(
          `Hub health degraded (${this.healthFailures} failures): ${this.lastError}`
        );
      }
    }
  }

  private resetSession(): void {
    this.stopHeartbeat();
    this.sessionId = undefined;
    this.ingest.setSession(undefined);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
