/**
 * The spoke-hosted AdapterService over a real socket: a grpc-js client built
 * from the vendored protos plays the hub and calls Write / Discover / Health.
 */
import * as grpc from "@grpc/grpc-js";
import { loadForgeConfig } from "../forge.config";
import {
  ForgeSpokeServer,
  advertiseHostFor,
  decodeWriteValue,
} from "../forge-spoke.server";
import {
  ForgeWriteService,
  ForgeWriteTarget,
  SpokeWriteResult,
  WriteContext,
  WriteRejectedError,
  WriteTagDescriptor,
} from "../forge-write.service";
import { mapDomainEventToRecord } from "../contextual-record.mapper";
import { getAdapterService } from "../proto";

class ChangeoverLikeTarget implements ForgeWriteTarget {
  readonly prefix = "mes.changeover";
  calls: Array<{ tagPath: string; value: unknown; ctx: WriteContext }> = [];
  describe(): WriteTagDescriptor[] {
    return [
      {
        tag_path: "mes.changeover.cooker.cip-complete",
        data_type: "object",
        description: "Report CIP completion",
        metadata: { area: "cooker", accepted_states: ["AWAITING_CHANGEOVER"] },
      },
    ];
  }
  async write(tagPath: string, value: unknown, ctx: WriteContext): Promise<SpokeWriteResult> {
    this.calls.push({ tagPath, value, ctx });
    if (tagPath.endsWith("explode")) throw new Error("prisma exploded");
    if (typeof value !== "object" || value === null) {
      throw new WriteRejectedError("invalid_payload", "object expected");
    }
    const readback = ctx.confirm
      ? mapDomainEventToRecord(
          { entityType: "Changeover", eventType: "cip-complete", data: { id: "cooker-changeover", state: "RECIPE_LOADING" } },
          { adapterId: "forge-mes", adapterVersion: "0.1.0", site: "whk01", area: "distillery01" }
        )
      : undefined;
    return { success: true, message: "cooker: AWAITING_CHANGEOVER -> RECIPE_LOADING", ...(readback ? { readback } : {}) };
  }
}

/** Metadata carrying the callback token the hub must present (FB-063). */
function tokenMetadata(token = "t-1"): grpc.Metadata {
  const md = new grpc.Metadata();
  md.set("x-forge-callback-token", token);
  return md;
}
const META = tokenMetadata();

function call<T = any>(client: any, method: string, req: unknown, md: grpc.Metadata = META): Promise<T> {
  return new Promise((resolve, reject) => {
    (client[method] as (req: unknown, md: grpc.Metadata, cb: (err: grpc.ServiceError | null, res?: any) => void) => void).call(
      client, req, md, (err, res) => (err ? reject(err) : resolve(res))
    );
  });
}

describe("decodeWriteValue / advertiseHostFor", () => {
  it("decodes each oneof variant", () => {
    expect(decodeWriteValue({ typed_value: "json_value", json_value: '{"a":1}' })).toEqual({ value: { a: 1 }, kind: "json" });
    expect(decodeWriteValue({ number_value: 1.5 })).toEqual({ value: 1.5, kind: "number" });
    expect(decodeWriteValue({ integer_value: "42" })).toEqual({ value: 42, kind: "integer" });
    expect(decodeWriteValue({ string_value: "x" })).toEqual({ value: "x", kind: "string" });
    expect(decodeWriteValue({ bool_value: true })).toEqual({ value: true, kind: "bool" });
    expect(decodeWriteValue({ bytes_value: Buffer.from([1, 2]) })).toEqual({ value: Buffer.from([1, 2]), kind: "bytes" });
    expect(decodeWriteValue({})).toEqual({ value: undefined, kind: "none" });
    expect(() => decodeWriteValue({ typed_value: "json_value", json_value: "{nope" })).toThrow(WriteRejectedError);
  });

  it("advertises localhost for wildcard binds", () => {
    expect(advertiseHostFor("0.0.0.0:50052")).toBe("localhost");
    expect(advertiseHostFor("[::]:0")).toBe("localhost");
    expect(advertiseHostFor("mes-backend:50052")).toBe("mes-backend");
    expect(advertiseHostFor("10.0.0.5:1")).toBe("10.0.0.5");
  });
});

describe("ForgeSpokeServer", () => {
  const config = loadForgeConfig((k) =>
    ({ FORGE_HUB_ENABLED: "true", FORGE_SPOKE_GRPC_BIND: "127.0.0.1:0", FORGE_SPOKE_CALLBACK_TOKEN: "t-1" })[k]
  );
  let writes: ForgeWriteService;
  let target: ChangeoverLikeTarget;
  let server: ForgeSpokeServer;
  let client: any;
  const ingest = {
    getStatus: () => ({
      enabled: true,
      sessionId: "sess-1",
      queued: 0,
      inFlight: false,
      inFlightRecords: 0,
      circuit: "closed" as const,
      recordsSent: 12,
      batchesSent: 2,
      recordsDroppedQueueFull: 1,
      recordsDeadLettered: 2,
      consecutiveFailures: 0,
      lastFlushAt: "2026-06-01T12:00:00.000Z",
    }),
  };

  beforeAll(async () => {
    writes = new ForgeWriteService();
    target = new ChangeoverLikeTarget();
    writes.register(target);
    server = new ForgeSpokeServer(config, writes, ingest as any);
    server.onModuleInit();
    const url = await server.whenListening();
    expect(url).toMatch(/^127\.0\.0\.1:\d+$/);
    const Service = getAdapterService();
    client = new Service(url!, grpc.credentials.createInsecure());
  });

  afterAll(async () => {
    client.close();
    await server.onModuleDestroy();
  });

  it("denies calls until the hub session is known, then by session/adapter mismatch", async () => {
    await expect(
      call(client, "Write", { adapter_id: "forge-mes", session_id: "sess-1", tag_path: "mes.changeover.cooker.cip-complete", json_value: "{}" })
    ).rejects.toMatchObject({ code: grpc.status.PERMISSION_DENIED, details: expect.stringContaining("no hub session") });

    server.setExpectedSession("sess-1");
    await expect(
      call(client, "Write", { adapter_id: "forge-mes", session_id: "other", tag_path: "x", json_value: "{}" })
    ).rejects.toMatchObject({ code: grpc.status.PERMISSION_DENIED, details: expect.stringContaining("session id") });
    await expect(
      call(client, "Discover", { adapter_id: "forge-wms", session_id: "sess-1" })
    ).rejects.toMatchObject({ code: grpc.status.PERMISSION_DENIED, details: expect.stringContaining("forge-wms") });
    expect(server.getStatus().deniedCalls).toBe(3);
  });

  it("requires the advertised callback token in the metadata (FB-063)", async () => {
    server.setExpectedSession("sess-1");
    expect(server.callbackToken).toBe("t-1");
    expect(server.getStatus()).toMatchObject({ callbackTokenSet: true, tlsRequired: false, tls: false });
    const req = { adapter_id: "forge-mes", session_id: "sess-1" };
    await expect(call(client, "Discover", req, new grpc.Metadata())).rejects.toMatchObject({
      code: grpc.status.PERMISSION_DENIED,
      details: expect.stringContaining("callback token"),
    });
    await expect(call(client, "Discover", req, tokenMetadata("wrong"))).rejects.toMatchObject({
      code: grpc.status.PERMISSION_DENIED,
    });
    await expect(call(client, "Discover", req)).resolves.toMatchObject({ tags: expect.any(Array) });
    expect(server.getStatus().tokenRejections).toBe(2);
  });

  it("mints a token per process when none is configured and refuses plaintext when TLS is required", async () => {
    const minted = new ForgeSpokeServer(
      loadForgeConfig((k) => ({ FORGE_HUB_ENABLED: "true" })[k]),
      new ForgeWriteService(),
      ingest as any
    );
    expect(minted.callbackToken).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(minted.callbackToken).not.toBe("t-1");

    const prod = loadForgeConfig((k) => ({ FORGE_HUB_ENABLED: "true", NODE_ENV: "production" })[k]);
    expect(prod.spoke.requireTls).toBe(true);
    const strict = new ForgeSpokeServer(prod, new ForgeWriteService(), ingest as any);
    await expect(strict.start("127.0.0.1:0")).rejects.toThrow("FORGE_SPOKE_REQUIRE_TLS");
    strict.onModuleInit();
    expect(await strict.whenListening()).toBeUndefined();
    expect(strict.getStatus().lastError).toContain("plaintext");

    const relaxed = loadForgeConfig(
      (k) => ({ FORGE_HUB_ENABLED: "true", NODE_ENV: "production", FORGE_SPOKE_REQUIRE_TLS: "false" })[k]
    );
    expect(relaxed.spoke.requireTls).toBe(false);
  });

  it("writes a JSON payload with read-back", async () => {
    const res = await call(client, "Write", {
      adapter_id: "forge-mes",
      session_id: "sess-1",
      tag_path: "mes.changeover.cooker.cip-complete",
      json_value: JSON.stringify({ cipStartTime: "a", cipEndTime: "b" }),
      confirm: true,
    });
    expect(res.success).toBe(true);
    expect(res.message).toBe("cooker: AWAITING_CHANGEOVER -> RECIPE_LOADING");
    expect(res.readback.source.adapter_id).toBe("forge-mes");
    expect(res.readback.lineage.schema_ref).toBe("forge://schemas/forge-mes/v0.1.0");
    expect(JSON.parse(res.readback.value.json_value)).toMatchObject({ state: "RECIPE_LOADING" });
    expect(target.calls[0]).toMatchObject({
      tagPath: "mes.changeover.cooker.cip-complete",
      value: { cipStartTime: "a", cipEndTime: "b" },
      ctx: { confirm: true, requestedBy: "forge-hub" },
    });
  });

  it("returns success=false (not an RPC error) for refused writes and bad JSON", async () => {
    const refused = await call(client, "Write", {
      adapter_id: "forge-mes",
      session_id: "sess-1",
      tag_path: "mes.changeover.cooker.cip-complete",
      number_value: 3,
    });
    expect(refused.success).toBe(false);
    expect(refused.message).toBe("invalid_payload: object expected");
    expect(refused.readback).toBeUndefined();

    const unknown = await call(client, "Write", { adapter_id: "forge-mes", session_id: "sess-1", tag_path: "wms.x", string_value: "v" });
    expect(unknown.success).toBe(false);
    expect(unknown.message).toContain("no_target");

    const badJson = await call(client, "Write", { adapter_id: "forge-mes", session_id: "sess-1", tag_path: "mes.changeover.cooker.cip-complete", json_value: "{oops" });
    expect(badJson.success).toBe(false);
    expect(badJson.message).toContain("not valid JSON");
  });

  it("surfaces unexpected target failures as INTERNAL", async () => {
    await expect(
      call(client, "Write", { adapter_id: "forge-mes", session_id: "sess-1", tag_path: "mes.changeover.cooker.explode", json_value: "{}" })
    ).rejects.toMatchObject({ code: grpc.status.INTERNAL, details: "prisma exploded" });
    expect(server.getStatus().lastError).toBe("prisma exploded");
    expect(server.getStatus().writes.failed).toBe(1);
  });

  it("answers Discover with struct metadata and Health with ingest counters", async () => {
    const discovered = await call(client, "Discover", { adapter_id: "forge-mes", session_id: "sess-1" });
    expect(discovered.tags).toHaveLength(1);
    expect(discovered.tags[0]).toMatchObject({
      tag_path: "mes.changeover.cooker.cip-complete",
      data_type: "object",
      description: "Report CIP completion",
      engineering_units: "",
    });
    expect(discovered.tags[0].metadata.fields.area.stringValue).toBe("cooker");
    expect(discovered.tags[0].metadata.fields.accepted_states.listValue.values[0].stringValue).toBe("AWAITING_CHANGEOVER");

    const health = await call(client, "Health", { adapter_id: "forge-mes", session_id: "sess-1" });
    expect(health.adapter_id).toBe("forge-mes");
    expect(health.state).toBe("ADAPTER_STATE_HEALTHY");
    expect(health.records_collected).toBe("12");
    expect(health.records_failed).toBe("3");
    expect(Number(health.last_healthy.seconds)).toBe(Math.floor(Date.parse("2026-06-01T12:00:00Z") / 1000));
  });

  it("answers the hub-hosted and pull RPCs with UNIMPLEMENTED", async () => {
    await expect(call(client, "Register", { manifest: {} })).rejects.toMatchObject({
      code: grpc.status.UNIMPLEMENTED,
      details: "forge-mes spoke does not serve Register",
    });
    await new Promise<void>((resolve, reject) => {
      const stream = client.Collect({ adapter_id: "forge-mes", session_id: "sess-1" });
      stream.on("data", () => reject(new Error("unexpected data")));
      stream.on("error", (err: grpc.ServiceError) => {
        expect(err.code).toBe(grpc.status.UNIMPLEMENTED);
        resolve();
      });
    });
    expect(server.getStatus().unimplementedCalls).toBe(2);
    expect(server.getStatus()).toMatchObject({ enabled: true, listening: true, bind: "127.0.0.1:0", expectedSession: "sess-1" });
  });

  it("stays off when the integration is disabled", async () => {
    const off = new ForgeSpokeServer(loadForgeConfig(() => undefined), new ForgeWriteService(), ingest as any);
    off.onModuleInit();
    expect(await off.whenListening()).toBeUndefined();
    expect(off.getStatus()).toMatchObject({ enabled: false, listening: false });
    const spokeOff = new ForgeSpokeServer(
      loadForgeConfig((k) => ({ FORGE_HUB_ENABLED: "true", FORGE_SPOKE_GRPC_ENABLED: "false" })[k]),
      new ForgeWriteService(),
      ingest as any
    );
    spokeOff.onModuleInit();
    expect(await spokeOff.whenListening()).toBeUndefined();
  });

  it("reports a bind failure instead of throwing out of onModuleInit", async () => {
    const bad = new ForgeSpokeServer(
      loadForgeConfig((k) => ({ FORGE_HUB_ENABLED: "true", FORGE_SPOKE_GRPC_BIND: "999.999.999.999:1" })[k]),
      new ForgeWriteService(),
      ingest as any
    );
    bad.onModuleInit();
    expect(await bad.whenListening()).toBeUndefined();
    expect(bad.getStatus().lastError).toBeDefined();
    expect(bad.getStatus().listening).toBe(false);
  });

  it("refuses to start with TLS enabled but no key pair", async () => {
    const tls = new ForgeSpokeServer(
      loadForgeConfig((k) => ({ FORGE_HUB_ENABLED: "true", FORGE_HUB_TLS_ENABLED: "true" })[k]),
      new ForgeWriteService(),
      ingest as any
    );
    await expect(tls.start("127.0.0.1:0")).rejects.toThrow("FORGE_HUB_TLS_CERT");
  });
});

// ---------------------------------------------------------------------------
// Pull RPCs: Backfill, Subscribe, Unsubscribe (FB-061)
// ---------------------------------------------------------------------------

describe("ForgeSpokeServer pull RPCs", () => {
  const config = loadForgeConfig((k) =>
    ({ FORGE_HUB_ENABLED: "true", FORGE_SPOKE_GRPC_BIND: "127.0.0.1:0", FORGE_SPOKE_CALLBACK_TOKEN: "t-1" })[k]
  );
  type Listener = (record: any) => void;
  const listeners = new Set<Listener>();
  const ingest = {
    getStatus: () => ({ sessionId: "sess-1", recordsSent: 0, recordsDeadLettered: 0, recordsDroppedQueueFull: 0 }),
    onRecord(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(record: any) {
      for (const l of listeners) l(record);
    },
  };
  const opts = { adapterId: "forge-mes", adapterVersion: "0.1.0", site: "whk01", area: "distillery01" };
  const replayed = [1, 2, 3].map((i) =>
    mapDomainEventToRecord(
      { entityType: "ScheduleOrder", eventType: "audit_update", data: { id: `so-${i}`, status: "Active" } },
      opts
    )
  );
  const backfill = {
    ranges: [] as any[],
    async *replay(range: any) {
      backfill.ranges.push(range);
      for (const r of replayed.slice(0, range.maxRecords || replayed.length)) yield r;
    },
    getStatus: () => ({ enabled: true, runs: backfill.ranges.length, recordsReplayed: 0, rowsScanned: 0 }),
  };
  let server: ForgeSpokeServer;
  let client: any;

  beforeAll(async () => {
    server = new ForgeSpokeServer(config, new ForgeWriteService(), ingest as any, backfill as any);
    server.onModuleInit();
    const url = await server.whenListening();
    const Service = getAdapterService();
    client = new Service(url!, grpc.credentials.createInsecure());
  });

  afterAll(async () => {
    client.close();
    await server.onModuleDestroy();
  });

  function readAll(stream: any): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const out: any[] = [];
      stream.on("data", (r: any) => out.push(r));
      stream.on("end", () => resolve(out));
      stream.on("error", reject);
    });
  }

  it("streams a backfill for the requested range and denies strangers", async () => {
    await expect(
      readAll(client.Backfill({ adapter_id: "forge-mes", session_id: "sess-1", tags: [] }, META))
    ).rejects.toMatchObject({ code: grpc.status.PERMISSION_DENIED });

    server.setExpectedSession("sess-1");
    const start = new Date("2026-06-01T00:00:00Z");
    const end = new Date("2026-06-02T00:00:00Z");
    const records = await readAll(
      client.Backfill(
        {
          adapter_id: "forge-mes",
          session_id: "sess-1",
          tags: ["mes.backend"],
          start_time: { seconds: String(Math.floor(start.getTime() / 1000)), nanos: 0 },
          end_time: { seconds: String(Math.floor(end.getTime() / 1000)), nanos: 0 },
          max_records: 2,
        },
        META
      )
    );
    expect(records).toHaveLength(2);
    expect(records[0].source.tag_path).toBe("mes.backend.scheduleorder");
    expect(JSON.parse(records[0].value.json_value)).toMatchObject({ id: "so-1" });
    expect(records[0].value.typed_value).toBe("json_value");
    expect(backfill.ranges[0]).toMatchObject({ start, end, tags: ["mes.backend"], maxRecords: 2 });
    expect(server.getStatus().backfill).toMatchObject({ enabled: true, streams: 1, recordsStreamed: 2 });
  });

  it("answers Backfill with UNIMPLEMENTED when no source is wired", async () => {
    const bare = new ForgeSpokeServer(config, new ForgeWriteService(), ingest as any);
    bare.setExpectedSession("s");
    const url = await bare.start("127.0.0.1:0");
    const Service = getAdapterService();
    const bareClient = new Service(url, grpc.credentials.createInsecure());
    await expect(
      readAll(bareClient.Backfill({ adapter_id: "forge-mes", session_id: "s", tags: [] }, META))
    ).rejects.toMatchObject({ code: grpc.status.UNIMPLEMENTED, details: expect.stringContaining("backfill source") });
    expect(bare.getStatus().backfill.enabled).toBe(false);
    bareClient.close();
    await bare.stop();
  });

  it("mirrors the ingest queue to a subscriber until Unsubscribe", async () => {
    server.setExpectedSession("sess-1");
    const stream = client.Subscribe({ adapter_id: "forge-mes", session_id: "sess-1", tags: ["mes.backend.scheduleorder"] }, META);
    const subscriptionId: string = await new Promise((resolve) => {
      stream.on("metadata", (md: grpc.Metadata) => resolve(String(md.get("subscription-id")[0])));
    });
    expect(subscriptionId).toBe("sub-1");
    const received: any[] = [];
    stream.on("data", (r: any) => received.push(r));
    const ended = new Promise<void>((resolve) => stream.on("end", resolve));

    await new Promise((r) => setTimeout(r, 20));
    expect(server.getStatus().subscriptions).toEqual([
      expect.objectContaining({ id: "sub-1", tags: ["mes.backend.scheduleorder"], delivered: 0 }),
    ]);
    ingest.emit(replayed[0]);
    ingest.emit(
      mapDomainEventToRecord({ entityType: "Batch", eventType: "batch_started", data: { id: "b-1" } }, opts)
    ); // filtered out by the tag
    ingest.emit(replayed[1]);
    await new Promise((r) => setTimeout(r, 50));
    expect(received.map((r: any) => JSON.parse(r.value.json_value).id)).toEqual(["so-1", "so-2"]);
    expect(server.getStatus().subscriptions[0].delivered).toBe(2);

    const unknown = await call(client, "Unsubscribe", { adapter_id: "forge-mes", session_id: "sess-1", subscription_id: "sub-x" });
    expect(unknown.success).toBe(false);
    const done = await call(client, "Unsubscribe", { adapter_id: "forge-mes", session_id: "sess-1", subscription_id: subscriptionId });
    expect(done.success).toBe(true);
    expect(done.message).toContain("2 record(s)");
    await ended;
    expect(server.getStatus().subscriptions).toEqual([]);
    expect(listeners.size).toBe(0);

    // A client-side cancel also releases the listener.
    const second = client.Subscribe({ adapter_id: "forge-mes", session_id: "sess-1", tags: [] }, META);
    await new Promise((resolve) => second.on("metadata", resolve));
    second.on("error", () => undefined);
    second.cancel();
    await new Promise((r) => setTimeout(r, 50));
    expect(server.getStatus().subscriptions).toEqual([]);
    expect(listeners.size).toBe(0);
  });
});
