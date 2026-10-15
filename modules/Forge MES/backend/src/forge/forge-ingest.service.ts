/**
 * Buffers ContextualRecords produced from domain events and streams them to
 * the hub in batches, with the retry policy, circuit breaker and dead-letter
 * behaviour defined in the FACTS spec's error_handling section.
 *
 * Records are accepted even while the hub is unreachable (bounded queue,
 * oldest dropped), so the MES never blocks on the hub.
 */
import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import type { DomainEventParams } from "../mqttDomainPublisher/types";
import {
  ContextualRecordMessage,
  mapDomainEventToRecord,
} from "./contextual-record.mapper";
import { FORGE_CONFIG, ForgeConfig } from "./forge.config";
import { ForgeHubClient } from "./forge-hub.client";
import { FORGE_MES_MANIFEST } from "./forge-manifest";

export type CircuitState = "closed" | "open" | "half_open";

export interface IngestStatus {
  enabled: boolean;
  sessionId?: string;
  queued: number;
  inFlight: boolean;
  inFlightRecords: number;
  circuit: CircuitState;
  recordsSent: number;
  batchesSent: number;
  recordsDroppedQueueFull: number;
  recordsDeadLettered: number;
  consecutiveFailures: number;
  /** Active Subscribe listeners (FB-061). */
  subscribers: number;
  lastError?: string;
  lastFlushAt?: string;
}

/** Minimal clock/sleep seam so tests run without real timers. */
export interface IngestClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

const realClock: IngestClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

@Injectable()
export class ForgeIngestService {
  private readonly logger = new Logger(ForgeIngestService.name);
  private readonly queue: ContextualRecordMessage[] = [];
  private sessionId?: string;
  private timer?: NodeJS.Timeout;
  private inFlight = false;
  private inFlightPromise?: Promise<number>;
  private inFlightRecords = 0;
  private stopped = false;
  /** Live mirrors of the queue (spoke-hosted Subscribe streams, FB-061). */
  private readonly listeners = new Set<(record: ContextualRecordMessage) => void>();

  // metrics / breaker state
  private recordsSent = 0;
  private batchesSent = 0;
  private droppedQueueFull = 0;
  private deadLettered = 0;
  private consecutiveFailures = 0;
  private circuit: CircuitState = "closed";
  private circuitOpenedAt = 0;
  private halfOpenSuccesses = 0;
  private lastError?: string;
  private lastFlushAt?: number;

  constructor(
    @Inject(FORGE_CONFIG) private readonly config: ForgeConfig,
    private readonly client: ForgeHubClient,
    @Optional() private readonly clock: IngestClock = realClock
  ) {}

  get enabled(): boolean {
    return this.config.enabled;
  }

  /** Called by ForgeHubService once Register/Configure/Start succeeded. */
  setSession(sessionId: string | undefined): void {
    this.sessionId = sessionId;
    if (sessionId && !this.timer && !this.stopped) this.startTimer();
  }

  /**
   * Map a domain event and queue it. Never throws and never blocks the caller;
   * a full queue drops the oldest record (counted in the status).
   */
  enqueueDomainEvent(params: DomainEventParams): void {
    if (!this.config.enabled || this.stopped) return;
    let record: ContextualRecordMessage;
    try {
      record = mapDomainEventToRecord(params, {
        adapterId: this.config.adapterId,
        adapterVersion: FORGE_MES_MANIFEST.version,
        site: this.config.site,
        area: this.config.area,
      });
    } catch (err) {
      this.logger.warn(
        `Could not map ${params.entityType}/${params.eventType} to a ContextualRecord: ${err}`
      );
      return;
    }
    this.enqueue(record);
  }

  /**
   * Observe every record that enters the queue (the hub's Subscribe RPC is
   * served from this). Returns the function that removes the listener.
   */
  onRecord(listener: (record: ContextualRecordMessage) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get subscriberCount(): number {
    return this.listeners.size;
  }

  /** Queue an already-built record (used by tests and future producers). */
  enqueue(record: ContextualRecordMessage): void {
    if (!this.config.enabled || this.stopped) return;
    for (const listener of this.listeners) {
      try {
        listener(record);
      } catch (err) {
        this.logger.warn(`Record listener failed: ${err}`);
      }
    }
    this.queue.push(record);
    while (this.queue.length > this.config.ingest.maxQueue) {
      this.queue.shift();
      this.droppedQueueFull++;
    }
    if (this.queue.length >= this.config.ingest.batchSize) void this.flush();
  }

  /**
   * Send up to one batch. Serialised: a second call while a flush is in
   * flight returns immediately. Returns the number of records delivered.
   */
  async flush(): Promise<number> {
    if (this.inFlightPromise) {
      // A batch is already on the wire; wait for it rather than racing it.
      await this.inFlightPromise;
      return 0;
    }
    if (!this.sessionId || this.queue.length === 0) return 0;
    if (!this.circuitAllowsAttempt()) return 0;

    this.inFlight = true;
    // Take the batch out of the queue now: records in flight must not be
    // subject to the overflow policy, and a dead-lettered batch is dropped.
    const batch = this.queue.splice(0, this.config.ingest.batchSize);
    this.inFlightRecords = batch.length;
    this.inFlightPromise = (async () => {
      try {
        return await this.sendWithRetry(batch);
      } finally {
        this.inFlight = false;
        this.inFlightRecords = 0;
        this.inFlightPromise = undefined;
        this.lastFlushAt = this.clock.now();
      }
    })();
    return this.inFlightPromise;
  }

  /**
   * Flush everything that is queued (shutdown path). Every iteration either
   * waits for the in-flight batch or removes one batch from the queue, so the
   * loop always terminates; it stops early only when no session exists or the
   * circuit is open.
   */
  async drain(): Promise<void> {
    for (;;) {
      if (this.inFlightPromise) await this.inFlightPromise;
      if (this.queue.length === 0 || !this.sessionId) return;
      if (!this.circuitAllowsAttempt()) return;
      await this.flush();
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  getStatus(): IngestStatus {
    return {
      enabled: this.config.enabled,
      sessionId: this.sessionId,
      queued: this.queue.length,
      inFlight: this.inFlight,
      inFlightRecords: this.inFlightRecords,
      circuit: this.circuit,
      recordsSent: this.recordsSent,
      batchesSent: this.batchesSent,
      recordsDroppedQueueFull: this.droppedQueueFull,
      recordsDeadLettered: this.deadLettered,
      consecutiveFailures: this.consecutiveFailures,
      subscribers: this.listeners.size,
      lastError: this.lastError,
      lastFlushAt: this.lastFlushAt
        ? new Date(this.lastFlushAt).toISOString()
        : undefined,
    };
  }

  // -- internals -----------------------------------------------------------

  private startTimer(): void {
    this.timer = setInterval(() => {
      void this.flush();
    }, this.config.ingest.flushIntervalMs);
    this.timer.unref?.();
  }

  private circuitAllowsAttempt(): boolean {
    if (this.circuit === "closed") return true;
    if (this.circuit === "half_open") return true;
    const elapsed = this.clock.now() - this.circuitOpenedAt;
    if (elapsed >= this.config.ingest.circuitHalfOpenAfterMs) {
      this.circuit = "half_open";
      this.halfOpenSuccesses = 0;
      return true;
    }
    return false;
  }

  private recordSuccess(count: number): void {
    this.recordsSent += count;
    this.batchesSent++;
    this.consecutiveFailures = 0;
    this.lastError = undefined;
    if (this.circuit === "half_open") {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.config.ingest.circuitSuccessThreshold) {
        this.circuit = "closed";
        this.logger.log("Hub ingest circuit closed");
      }
    }
  }

  private recordFailure(err: unknown): void {
    this.consecutiveFailures++;
    this.lastError = err instanceof Error ? err.message : String(err);
    if (
      this.circuit === "half_open" ||
      this.consecutiveFailures >= this.config.ingest.circuitFailureThreshold
    ) {
      if (this.circuit !== "open") {
        this.logger.warn(
          `Hub ingest circuit opened after ${this.consecutiveFailures} failures: ${this.lastError}`
        );
      }
      this.circuit = "open";
      this.circuitOpenedAt = this.clock.now();
    }
  }

  /**
   * Retry one batch with exponential backoff (FACTS retry_policy). When the
   * retries are exhausted the batch is dead-lettered: counted, logged, and
   * dropped so the queue cannot wedge. A dead-letter sink is BACKLOG FB-056.
   */
  private async sendWithRetry(batch: ContextualRecordMessage[]): Promise<number> {
    const { maxRetries, initialBackoffMs, maxBackoffMs } = this.config.ingest;
    let attempt = 0;
    for (;;) {
      try {
        const res = await this.client.ingest(
          this.config.adapterId,
          this.sessionId as string,
          batch
        );
        if (!res.success) throw new Error(res.message || "hub rejected batch");
        this.recordSuccess(res.records_received);
        return res.records_received;
      } catch (err) {
        this.recordFailure(err);
        if (this.circuit === "open" || attempt >= maxRetries || this.stopped) {
          this.deadLettered += batch.length;
          this.logger.error(
            `Dead-lettered ${batch.length} records after ${attempt + 1} attempt(s): ${this.lastError}`
          );
          return 0;
        }
        const delay = Math.min(initialBackoffMs * 2 ** attempt, maxBackoffMs);
        attempt++;
        await this.clock.sleep(delay);
      }
    }
  }
}
