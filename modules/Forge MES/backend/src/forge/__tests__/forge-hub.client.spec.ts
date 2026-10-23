/**
 * End-to-end over a real gRPC socket: an in-process AdapterService server
 * built from the same vendored protos answers the backend's ForgeHubClient.
 */
import * as grpc from "@grpc/grpc-js";
import { mapDomainEventToRecord } from "../contextual-record.mapper";
import { ForgeHubClient } from "../forge-hub.client";
import { toProtoManifest } from "../forge-manifest";
import { getAdapterService, toTimestamp } from "../proto";

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
