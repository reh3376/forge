/**
 * End-to-end over a real gRPC socket: an in-process AdapterService server
 * built from the same vendored protos answers the backend's ForgeHubClient.
 */
import * as grpc from "@grpc/grpc-js";
import { mapDomainEventToRecord } from "../contextual-record.mapper";
import {
  clockRefusalCause,
  computeExchange,
  ForgeHubClient,
  HubClockRefusedError,
  REFUSAL_CAUSE_HEADER,
  SPOKE_MEASURED_AT_HEADER,
  SPOKE_OFFSET_HEADER,
  SPOKE_ROUND_TRIP_HEADER,
  SPOKE_TRANSMIT_TIME_HEADER,
} from "../forge-hub.client";
import { toProtoManifest } from "../forge-manifest";
import {
  getAdapterService,
  msToTimestamp,
  timestampToMs,
  toTimestamp,
} from "../proto";

interface Seen {
  manifest?: Record<string, unknown>;
  configureParams?: Record<string, string>;
  started: boolean;
  stopped?: { graceful: boolean };
  ingestMetadata: Array<Record<string, string>>;
  ingested: Array<Record<string, unknown>>;
  healthCalls: number;
}

function startServer(): Promise<{ server: grpc.Server; port: number; seen: Seen; failIngest: { value: boolean } }> {
  const seen: Seen = { started: false, ingestMetadata: [], ingested: [], healthCalls: 0 };
  const failIngest = { value: false };
  const Service = getAdapterService();
  const server = new grpc.Server();
  const session = "sess-test-1";

  server.addService(Service.service, {
    Register: (call: grpc.ServerUnaryCall<any, any>, cb: grpc.sendUnaryData<any>) => {
      seen.manifest = call.request.manifest;
      cb(null, { accepted: true, message: "registered", session_id: session });
    },
    Configure: (call: grpc.ServerUnaryCall<any, any>, cb: grpc.sendUnaryData<any>) => {
      seen.configureParams = call.request.params;
      cb(null, { success: call.request.session_id === session, message: "configured" });
    },
    Start: (call: grpc.ServerUnaryCall<any, any>, cb: grpc.sendUnaryData<any>) => {
      seen.started = call.request.session_id === session;
      cb(null, { success: seen.started, message: "started" });
    },
    Stop: (call: grpc.ServerUnaryCall<any, any>, cb: grpc.sendUnaryData<any>) => {
      seen.stopped = { graceful: Boolean(call.request.graceful) };
      cb(null, { success: true, message: "stopped", records_flushed: "7" });
    },
    Health: (call: grpc.ServerUnaryCall<any, any>, cb: grpc.sendUnaryData<any>) => {
      seen.healthCalls++;
      cb(null, {
        adapter_id: call.request.adapter_id,
        state: "ADAPTER_STATE_HEALTHY",
        last_check: toTimestamp(new Date()),
        records_collected: String(seen.ingested.length),
        records_failed: "0",
        uptime_seconds: 12.5,
      });
    },
    Ingest: (call: grpc.ServerReadableStream<any, any>, cb: grpc.sendUnaryData<any>) => {
      const md = call.metadata.getMap() as Record<string, string>;
      seen.ingestMetadata.push({ ...md });
      let count = 0;
      call.on("data", (record) => {
        seen.ingested.push(record);
        count++;
      });
      call.on("end", () => {
        if (failIngest.value) {
          cb({ code: grpc.status.UNAVAILABLE, details: "simulated outage" } as grpc.ServiceError);
          return;
        }
        cb(null, { records_received: String(count), success: true, message: "OK" });
      });
    },
  });

  return new Promise((resolve, reject) => {
    server.bindAsync("127.0.0.1:0", grpc.ServerCredentials.createInsecure(), (err, port) => {
      if (err) reject(err);
      else resolve({ server, port, seen, failIngest });
    });
  });
}

describe("ForgeHubClient against an in-process AdapterService", () => {
  let server: grpc.Server;
  let port: number;
  let seen: Seen;
  let failIngest: { value: boolean };
  let client: ForgeHubClient;

  beforeAll(async () => {
    ({ server, port, seen, failIngest } = await startServer());
    client = new ForgeHubClient({ url: `127.0.0.1:${port}`, rpcTimeoutMs: 5000 });
  });

  afterAll(async () => {
    client.close();
    await new Promise<void>((r) => server.tryShutdown(() => r()));
  });

  it("registers the manifest and receives a session id", async () => {
    const res = await client.register(toProtoManifest());
    expect(res).toEqual({ accepted: true, message: "registered", session_id: "sess-test-1" });
    expect(seen.manifest).toMatchObject({
      adapter_id: "forge-mes",
      tier: "ADAPTER_TIER_MES_MOM",
      protocol: "graphql+amqp+mqtt",
    });
    expect((seen.manifest as any).data_contract.context_fields).toHaveLength(6);
    expect((seen.manifest as any).metadata.fields.spoke.stringValue).toBe("forge-mes");
  });

  it("configures and starts the session", async () => {
    await expect(
      client.configure("forge-mes", "sess-test-1", { graphql_url: "http://mes:3000/graphql" })
    ).resolves.toEqual({ success: true, message: "configured" });
    expect(seen.configureParams).toEqual({ graphql_url: "http://mes:3000/graphql" });
    await expect(client.start("forge-mes", "sess-test-1")).resolves.toEqual({
      success: true,
      message: "started",
    });
    expect(seen.started).toBe(true);
  });

  it("streams ContextualRecords with the routing metadata the hub expects", async () => {
    const records = [1, 2, 3].map((i) =>
      mapDomainEventToRecord(
        {
          entityType: "StepExecution",
          eventType: "step_started",
          data: { id: `step-${i}`, batchId: "B-1", createdAt: "2026-06-01T12:00:00Z" },
          context: { batchId: "B-1", phase: "Mashing" },
        },
        { adapterId: "forge-mes", adapterVersion: "0.1.0", site: "whk01", area: "distillery01" }
      )
    );
    const res = await client.ingest("forge-mes", "sess-test-1", records);
    expect(res).toEqual({ records_received: 3, success: true, message: "OK" });
    expect(seen.ingestMetadata[0]).toMatchObject({
      "x-forge-adapter-id": "forge-mes",
      "x-forge-session-id": "sess-test-1",
    });
    const wire = seen.ingested[0] as any;
    expect(wire.source).toEqual({ adapter_id: "forge-mes", system: "forge-mes", tag_path: "mes.backend.stepexecution" });
    expect(wire.context.batch_id).toBe("B-1");
    expect(wire.context.event_type).toBe("step.started"); // its own slot since FB-013
    expect(wire.value.quality).toBe("QUALITY_CODE_GOOD");
    expect(wire.value.json_value).toContain('"id":"step-1"');
    expect(wire.timestamp.source_time.seconds).toBe(String(Date.parse("2026-06-01T12:00:00Z") / 1000));
    expect(wire.lineage.schema_ref).toBe("forge://schemas/forge-mes/v0.1.0");
  });

  it("surfaces a hub error on Ingest as a rejection", async () => {
    failIngest.value = true;
    try {
      await expect(client.ingest("forge-mes", "sess-test-1", [])).rejects.toMatchObject({
        code: grpc.status.UNAVAILABLE,
      });
    } finally {
      failIngest.value = false;
    }
  });

  it("reports health and stops gracefully", async () => {
    const h = await client.health("forge-mes", "sess-test-1");
    expect(h.state).toBe("ADAPTER_STATE_HEALTHY");
    expect(h.records_collected).toBe(3);
    expect(h.uptime_seconds).toBeCloseTo(12.5);
    expect(seen.healthCalls).toBe(1);

    const s = await client.stop("forge-mes", "sess-test-1", true);
    expect(s).toEqual({ success: true, message: "stopped", records_flushed: 7 });
    expect(seen.stopped).toEqual({ graceful: true });
  });

  it("rejects quickly when no hub is listening", async () => {
    const dead = new ForgeHubClient({ url: "127.0.0.1:1", rpcTimeoutMs: 800 });
    await expect(dead.health("forge-mes", "x")).rejects.toBeDefined();
    dead.close();
  });
});

// ---------------------------------------------------------------------------
// The hub <-> spoke time exchange (one clock, FB-092)
// ---------------------------------------------------------------------------

describe("the time exchange with the hub", () => {
  it("computes offset and round trip by RFC 5905", () => {
    // the spoke's clock runs 2 s behind the hub's; 4 ms each way; the hub took 250 ms
    const ex = computeExchange(1_000_000, 1_002_004, 1_002_254, 1_000_258);
    expect(ex.offsetSeconds).toBeCloseTo(2.0, 6); // hub minus spoke
    expect(ex.roundTripSeconds).toBeCloseTo(0.008, 6); // the hub's 250 ms drop out
  });

  it("keeps sub-millisecond time across the Timestamp helpers", () => {
    const ts = msToTimestamp(1_750_000_000_123.25);
    expect(ts).toEqual({ seconds: "1750000000", nanos: 123_250_000 });
    expect(timestampToMs(ts)).toBeCloseTo(1_750_000_000_123.25, 3);
    expect(timestampToMs(undefined)).toBeUndefined();
  });

  describe("against an in-process hub that answers with T2 and T3", () => {
    const HUB_AHEAD_MS = 2_000; // the hub's clock is 2 s ahead of this spoke's
    let server: grpc.Server;
    let client: ForgeHubClient;
    let spokeNow = 1_750_000_000_000;
    const seen: {
      register?: any;
      health: any[];
      ingestHeader?: string;
      ingestMeasurement?: { offset: string; roundTrip: string; measuredAt: string };
      ingested: any[];
    } = { health: [], ingested: [] };
    // every read of either clock moves true time on by 1 ms
    const tick = () => (spokeNow += 1);
    const hubTime = () => {
      const t2 = tick() + HUB_AHEAD_MS;
      const t3 = tick() + HUB_AHEAD_MS;
      return { receive_time: msToTimestamp(t2), transmit_time: msToTimestamp(t3) };
    };

    beforeAll(async () => {
      const Service = getAdapterService();
      server = new grpc.Server();
      server.addService(Service.service, {
        Register: (call: grpc.ServerUnaryCall<any, any>, cb: grpc.sendUnaryData<any>) => {
          seen.register = call.request.spoke_time;
          cb(null, { accepted: true, message: "ok", session_id: "s1", hub_time: hubTime() });
        },
        Health: (call: grpc.ServerUnaryCall<any, any>, cb: grpc.sendUnaryData<any>) => {
          seen.health.push(call.request.spoke_time);
          cb(null, {
            adapter_id: call.request.adapter_id,
            state: "ADAPTER_STATE_HEALTHY",
            hub_time: hubTime(),
          });
        },
        Ingest: (call: grpc.ServerReadableStream<any, any>, cb: grpc.sendUnaryData<any>) => {
          seen.ingestHeader = String(call.metadata.get(SPOKE_TRANSMIT_TIME_HEADER)[0]);
          seen.ingestMeasurement = {
            offset: String(call.metadata.get(SPOKE_OFFSET_HEADER)[0]),
            roundTrip: String(call.metadata.get(SPOKE_ROUND_TRIP_HEADER)[0]),
            measuredAt: String(call.metadata.get(SPOKE_MEASURED_AT_HEADER)[0]),
          };
          call.on("data", (record) => seen.ingested.push(record));
          call.on("end", () =>
            cb(null, { records_received: "1", success: true, message: "OK", hub_time: hubTime() })
          );
        },
      });
      const port = await new Promise<number>((resolve, reject) => {
        server.bindAsync("127.0.0.1:0", grpc.ServerCredentials.createInsecure(), (err, p) =>
          err ? reject(err) : resolve(p)
        );
      });
      client = new ForgeHubClient({ url: `127.0.0.1:${port}`, rpcTimeoutMs: 5000, now: tick });
    });

    afterAll(async () => {
      client.close();
      await new Promise<void>((r) => server.tryShutdown(() => r()));
    });

    it("sends T1 on Register and measures the hub's clock from the answer", async () => {
      expect(client.lastExchange).toBeUndefined();
      await client.register(toProtoManifest());
      expect(seen.register.transmit_time.seconds).toBe("1750000000");
      expect(seen.register.offset_seconds).toBeUndefined(); // nothing to report yet
      const ex = client.lastExchange!;
      expect(client.exchanges).toBe(1);
      expect(ex.offsetSeconds).toBeCloseTo(2.0, 6); // hub minus spoke
      expect(ex.roundTripSeconds).toBeCloseTo(0.002, 6); // 1 ms each way
    });

    it("reports the last exchange with the next Health and measures again", async () => {
      await client.health("forge-mes", "s1");
      const reported = seen.health[0];
      expect(reported.offset_seconds).toBeCloseTo(2.0, 6);
      expect(reported.round_trip_seconds).toBeCloseTo(0.002, 6);
      expect(reported.measured_at.seconds).toBe("1750000000");
      expect(client.exchanges).toBe(2);
    });

    it("carries T1 in the Ingest header and stamps spoke_time on each record", async () => {
      const record = mapDomainEventToRecord(
        {
          entityType: "StepExecution",
          eventType: "step_started",
          data: { id: "step-1", batchId: "B-1", createdAt: "2026-06-01T12:00:00Z" },
          context: { batchId: "B-1", phase: "Mashing" },
        },
        { adapterId: "forge-mes", adapterVersion: "0.1.0", site: "whk01", area: "distillery01" }
      );
      await client.ingest("forge-mes", "s1", [record]);
      expect(seen.ingestHeader).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(seen.ingested[0].timestamp.spoke_time.seconds).toBe("1750000000");
      // the measurement of the Health before it rode in the headers: the hub's probe
      expect(Number(seen.ingestMeasurement!.offset)).toBeCloseTo(2.0, 6);
      expect(Number(seen.ingestMeasurement!.roundTrip)).toBeCloseTo(0.002, 6);
      expect(seen.ingestMeasurement!.measuredAt).toMatch(/^2025-06-15T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(client.exchanges).toBe(3);
      expect(client.lastExchange!.offsetSeconds).toBeCloseTo(2.0, 6);
    });
  });

  describe("against a hub that refuses this spoke for its clock (FB-093)", () => {
    const CAUSE =
      "CLOCK_OUT_OF_TOLERANCE: clock spoke:forge-mes is +2.000000 s from Forge's clock " +
      "after 3 consecutive probes; tolerance class it-lan allows 0.01 s";
    let server: grpc.Server;
    let client: ForgeHubClient;

    beforeAll(async () => {
      const Service = getAdapterService();
      server = new grpc.Server();
      server.addService(Service.service, {
        Register: (_call: grpc.ServerUnaryCall<any, any>, cb: grpc.sendUnaryData<any>) => {
          const now = msToTimestamp(Date.now());
          cb(null, {
            accepted: false,
            message: CAUSE,
            session_id: "",
            hub_time: { receive_time: now, transmit_time: now },
          });
        },
        Ingest: (call: grpc.ServerReadableStream<any, any>, cb: grpc.sendUnaryData<any>) => {
          const trailer = new grpc.Metadata();
          trailer.set(REFUSAL_CAUSE_HEADER, "clock_out_of_tolerance");
          call.resume();
          cb({ code: grpc.status.FAILED_PRECONDITION, details: CAUSE, metadata: trailer });
        },
      });
      const port = await new Promise<number>((resolve, reject) => {
        server.bindAsync("127.0.0.1:0", grpc.ServerCredentials.createInsecure(), (err, p) =>
          err ? reject(err) : resolve(p)
        );
      });
      client = new ForgeHubClient({ url: `127.0.0.1:${port}`, rpcTimeoutMs: 5000 });
    });

    afterAll(async () => {
      client.close();
      await new Promise<void>((r) => server.tryShutdown(() => r()));
    });

    it("names the cause of a refused registration and still measures the hub's clock", async () => {
      const reg = await client.register(toProtoManifest());
      expect(reg.accepted).toBe(false);
      expect(reg.refusal_cause).toBe("clock_out_of_tolerance");
      expect(reg.message).toBe(CAUSE);
      expect(client.exchanges).toBe(1); // the refused answer carried T2 and T3
    });

    it("turns a refused Ingest into a HubClockRefusedError", async () => {
      const refused = await client.ingest("forge-mes", "s1", []).catch((e) => e);
      expect(refused).toBeInstanceOf(HubClockRefusedError);
      expect(refused.refusalCause).toBe("clock_out_of_tolerance");
      expect(refused.message).toContain(CAUSE);
    });
  });

  it("recognises a clock refusal by the hub's trailer or by its message", () => {
    expect(clockRefusalCause("clock_unreadable")).toBe("clock_unreadable");
    expect(clockRefusalCause(undefined, "CLOCK_UNREADABLE: no measurement")).toBe(
      "clock_unreadable"
    );
    expect(clockRefusalCause("time_governance_missing", "no section")).toBeUndefined();
    expect(clockRefusalCause(undefined, "FACTS conformance failed")).toBeUndefined();
  });

  it("stays unmeasured against a hub that sends no time", async () => {
    const Service = getAdapterService();
    const old = new grpc.Server();
    old.addService(Service.service, {
      Register: (_call: grpc.ServerUnaryCall<any, any>, cb: grpc.sendUnaryData<any>) =>
        cb(null, { accepted: true, message: "ok", session_id: "s1" }),
    });
    const port = await new Promise<number>((resolve, reject) => {
      old.bindAsync("127.0.0.1:0", grpc.ServerCredentials.createInsecure(), (err, p) =>
        err ? reject(err) : resolve(p)
      );
    });
    const c = new ForgeHubClient({ url: `127.0.0.1:${port}`, rpcTimeoutMs: 5000 });
    try {
      await c.register(toProtoManifest());
      expect(c.lastExchange).toBeUndefined();
      expect(c.exchanges).toBe(0);
    } finally {
      c.close();
      await new Promise<void>((r) => old.tryShutdown(() => r()));
    }
  });
});

