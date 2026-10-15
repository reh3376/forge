import { ForgeConfig, loadForgeConfig } from "../forge.config";
import { ForgeHubClient, IngestResult } from "../forge-hub.client";
import { ForgeIngestService, IngestClock } from "../forge-ingest.service";

class FakeClock implements IngestClock {
  t = 1_700_000_000_000;
  sleeps: number[] = [];
  now(): number {
    return this.t;
  }
  async sleep(ms: number): Promise<void> {
    this.sleeps.push(ms);
    this.t += ms;
  }
}

class FakeClient {
  batches: number[] = [];
  failures = 0;
  ingest = jest.fn(
    async (_a: string, _s: string, records: unknown[]): Promise<IngestResult> => {
      if (this.failures > 0) {
        this.failures--;
        throw new Error("UNAVAILABLE");
      }
      this.batches.push(records.length);
      return { records_received: records.length, success: true, message: "OK" };
    }
  );
}

function makeConfig(over: Partial<ForgeConfig["ingest"]> = {}): ForgeConfig {
  const cfg = loadForgeConfig((k) =>
    k === "FORGE_HUB_ENABLED" ? "true" : undefined
  );
  cfg.ingest = { ...cfg.ingest, batchSize: 3, maxQueue: 5, flushIntervalMs: 60_000, ...over };
  return cfg;
}

function event(i: number) {
  return {
    entityType: "StepExecution",
    eventType: "step_started",
    data: { id: `s${i}`, batchId: "B", createdAt: "2026-06-01T12:00:00Z" },
  };
}

describe("ForgeIngestService", () => {
  let clock: FakeClock;
  let client: FakeClient;

  beforeEach(() => {
    clock = new FakeClock();
    client = new FakeClient();
  });

  function make(cfg = makeConfig()) {
    const svc = new ForgeIngestService(cfg, client as unknown as ForgeHubClient, clock);
    return svc;
  }

  it("is inert when disabled", () => {
    const cfg = loadForgeConfig(() => undefined);
    const svc = new ForgeIngestService(cfg, client as unknown as ForgeHubClient, clock);
    svc.enqueueDomainEvent(event(1));
    expect(svc.getStatus()).toMatchObject({ enabled: false, queued: 0 });
  });

  it("queues until a session exists, then flushes in batches", async () => {
    const svc = make();
    svc.enqueueDomainEvent(event(1));
    svc.enqueueDomainEvent(event(2));
    expect(await svc.flush()).toBe(0); // no session yet
    expect(svc.getStatus().queued).toBe(2);

    svc.setSession("sess");
    expect(await svc.flush()).toBe(2);
    expect(client.batches).toEqual([2]);
    expect(svc.getStatus()).toMatchObject({ queued: 0, recordsSent: 2, batchesSent: 1, circuit: "closed" });
    svc.stop();
  });

  it("auto-flushes when the batch size is reached and drains the rest", async () => {
    const svc = make();
    svc.setSession("sess");
    for (let i = 0; i < 7; i++) svc.enqueueDomainEvent(event(i));
    // first auto-flush is in flight; drain finishes the remainder
    await svc.drain();
    expect(client.batches.reduce((a, b) => a + b, 0)).toBe(7);
    expect(client.batches.every((b) => b <= 3)).toBe(true);
    expect(svc.getStatus().queued).toBe(0);
    svc.stop();
  });

  it("drops the oldest records when the queue is full", () => {
    const svc = make(makeConfig({ batchSize: 100, maxQueue: 5 }));
    for (let i = 0; i < 8; i++) svc.enqueueDomainEvent(event(i));
    expect(svc.getStatus()).toMatchObject({ queued: 5, recordsDroppedQueueFull: 3 });
    svc.stop();
  });

  it("retries with exponential backoff and then succeeds", async () => {
    const svc = make();
    svc.setSession("sess");
    client.failures = 2;
    svc.enqueueDomainEvent(event(1));
    expect(await svc.flush()).toBe(1);
    expect(clock.sleeps).toEqual([1000, 2000]);
    expect(svc.getStatus()).toMatchObject({ recordsSent: 1, consecutiveFailures: 0, circuit: "closed" });
    svc.stop();
  });

  it("opens the circuit after the failure threshold and dead-letters the batch", async () => {
    const svc = make();
    svc.setSession("sess");
    client.failures = 100;
    svc.enqueueDomainEvent(event(1));
    svc.enqueueDomainEvent(event(2));
    expect(await svc.flush()).toBe(0);
    const s1 = svc.getStatus();
    expect(s1.circuit).toBe("open");
    expect(s1.recordsDeadLettered).toBe(2);
    expect(s1.queued).toBe(0);
    expect(s1.lastError).toBe("UNAVAILABLE");
    // threshold is 5 failures -> 4 sleeps before the circuit opens
    expect(clock.sleeps).toEqual([1000, 2000, 4000, 8000]);

    // while open, nothing is attempted
    svc.enqueueDomainEvent(event(3));
    expect(await svc.flush()).toBe(0);
    expect(client.ingest).toHaveBeenCalledTimes(5);

    // after the half-open window one attempt is allowed; two successes close it
    client.failures = 0;
    clock.t += 45_000;
    expect(await svc.flush()).toBe(1);
    expect(svc.getStatus().circuit).toBe("half_open");
    svc.enqueueDomainEvent(event(4));
    expect(await svc.flush()).toBe(1);
    expect(svc.getStatus().circuit).toBe("closed");
    svc.stop();
  });

  it("serialises concurrent flushes", async () => {
    const svc = make();
    svc.setSession("sess");
    svc.enqueueDomainEvent(event(1));
    const [a, b] = await Promise.all([svc.flush(), svc.flush()]);
    expect([a, b].sort()).toEqual([0, 1]);
    expect(client.ingest).toHaveBeenCalledTimes(1);
    svc.stop();
  });
});

describe("ForgeIngestService.onRecord (FB-061)", () => {
  it("hands every queued record to listeners, isolates listener failures", () => {
    const svc = new ForgeIngestService(
      makeConfig(),
      new FakeClient() as unknown as ForgeHubClient,
      new FakeClock()
    );
    const seen: string[] = [];
    const release = svc.onRecord((r) => seen.push(r.context.extra.entity_id));
    svc.onRecord(() => {
      throw new Error("listener exploded");
    });
    expect(svc.getStatus().subscribers).toBe(2);

    svc.enqueueDomainEvent(event(1));
    svc.enqueueDomainEvent(event(2));
    expect(seen).toEqual(["s1", "s2"]);
    expect(svc.getStatus().queued).toBe(2); // the failing listener did not block queueing

    release();
    svc.enqueueDomainEvent(event(3));
    expect(seen).toEqual(["s1", "s2"]);
    expect(svc.getStatus().subscribers).toBe(1);
  });
});
