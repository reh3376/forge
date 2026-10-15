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

type Unary = (req: unknown, cb: (err: grpc.ServiceError | null, res?: any) => void) => void;

function call<T = any>(client: any, method: string, req: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    (client[method] as Unary).call(client, req, (err, res) => (err ? reject(err) : resolve(res)));
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
    ({ FORGE_HUB_ENABLED: "true", FORGE_SPOKE_GRPC_BIND: "127.0.0.1:0" })[k]
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
