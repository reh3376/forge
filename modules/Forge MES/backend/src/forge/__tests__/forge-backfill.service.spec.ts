/**
 * ForgeBackfillService: replay AuditLog rows as ContextualRecords (FB-061).
 */
import { deriveTagPath } from "../contextual-record.mapper";
import { loadForgeConfig } from "../forge.config";
import {
  AuditLogRowLike,
  ForgeBackfillService,
  entityTypesForTags,
  matchesTagFilter,
} from "../forge-backfill.service";

const config = loadForgeConfig((k) => ({ FORGE_HUB_ENABLED: "true" })[k]);

function row(i: number, over: Partial<AuditLogRowLike> = {}): AuditLogRowLike {
  return {
    id: `a${String(i).padStart(3, "0")}`,
    entityType: "ScheduleOrder",
    entityId: `so-${i}`,
    action: "UPDATE",
    oldValues: { status: "Queued" },
    newValues: { status: "Active", scheduleOrderId: `so-${i}`, updatedAt: "2026-06-01T12:00:05Z" },
    userId: "u1",
    createdAt: new Date(Date.UTC(2026, 5, 1, 12, 0, i)),
    ...over,
  };
}

/** A Prisma double honouring the where/orderBy/take/cursor/skip the service sends. */
function fakePrisma(rows: AuditLogRowLike[], opts: { fail?: boolean } = {}) {
  const findMany = jest.fn(async (args: any) => {
    if (opts.fail) throw new Error("db unavailable");
    const gte: Date | undefined = args.where?.createdAt?.gte;
    const lte: Date | undefined = args.where?.createdAt?.lte;
    const types: string[] | undefined = args.where?.entityType?.in;
    if (types && args.where.entityType.mode !== "insensitive") {
      throw new Error("entityType predicate must be case-insensitive");
    }
    let list = rows
      .filter((r) => (!gte || r.createdAt >= gte) && (!lte || r.createdAt <= lte))
      .filter((r) => !types || types.includes(r.entityType.toLowerCase()))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    if (args.cursor) {
      const idx = list.findIndex((r) => r.id === args.cursor.id);
      list = list.slice(idx + (args.skip ?? 0));
    }
    return list.slice(0, args.take);
  });
  return { auditLog: { findMany } };
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iter) out.push(item);
  return out;
}

describe("matchesTagFilter", () => {
  it("matches exact tags and children, everything when empty", () => {
    expect(matchesTagFilter("mes.backend.batch", [])).toBe(true);
    expect(matchesTagFilter("mes.backend.batch", ["mes.backend"])).toBe(true);
    expect(matchesTagFilter("mes.backend.batch", ["mes.backend.batch"])).toBe(true);
    expect(matchesTagFilter("mes.backend.batchrun", ["mes.backend.batch"])).toBe(false);
    expect(matchesTagFilter(undefined, ["mes"])).toBe(false);
  });
});

describe("ForgeBackfillService", () => {
  it("maps an audit row like a live domain event, marked as a replay", () => {
    const svc = new ForgeBackfillService(config, undefined);
    const record = svc.toRecord(row(1))!;
    expect(record.source.tag_path).toBe(deriveTagPath("ScheduleOrder"));
    expect(record.source.adapter_id).toBe("forge-mes");
    expect(record.context.extra).toMatchObject({
      event_type: "audit.update",
      entity_type: "ScheduleOrder",
      entity_id: "so-1",
      schedule_order_id: "so-1",
      replay: "backfill",
      audit_log_id: "a001",
      audit_action: "UPDATE",
      event_timestamp: "2026-06-01T12:00:01.000Z",
    });
    expect(record.context.operator_id).toBe("u1");
    expect(record.context.operating_mode).toBe("Active");
    expect(JSON.parse(record.value.json_value)).toMatchObject({ id: "so-1", status: "Active" });
    expect(record.lineage.transformation_chain).toEqual([
      "forge-mes-backend:domain-event",
      "forge-mes-backend:audit-log-replay",
    ]);

    const deleted = svc.toRecord(row(2, { action: "DELETE", newValues: null }))!;
    expect(deleted.context.extra.event_type).toBe("audit.delete");
    expect(JSON.parse(deleted.value.json_value)).toMatchObject({ status: "Queued" });

    const odd = svc.toRecord(row(3, { newValues: ["not", "an", "object"] }))!;
    expect(JSON.parse(odd.value.json_value)).toMatchObject({ id: "so-3" });
    expect(svc.getStatus()).toMatchObject({ enabled: false, runs: 0 });
  });

  it("pages through the range with a cursor, filters by tag and caps the count", async () => {
    const rows = [
      ...[1, 2, 3, 4, 5].map((i) => row(i)),
      row(6, { entityType: "Batch", entityId: "b-1" }),
      row(7, { createdAt: new Date(Date.UTC(2026, 5, 2)) }), // outside the range
    ];
    const prisma = fakePrisma(rows);
    const svc = new ForgeBackfillService(config, prisma as any, 2);

    const all = await collect(
      svc.replay({
        start: new Date(Date.UTC(2026, 5, 1)),
        end: new Date(Date.UTC(2026, 5, 1, 23)),
        tags: [],
        maxRecords: 0,
      })
    );
    expect(all.map((r) => r.context.extra.entity_id)).toEqual(["so-1", "so-2", "so-3", "so-4", "so-5", "b-1"]);
    // Three full pages of two, then one empty page proves the range is exhausted.
    expect(prisma.auditLog.findMany).toHaveBeenCalledTimes(4);
    expect(prisma.auditLog.findMany.mock.calls[1][0]).toMatchObject({ cursor: { id: "a002" }, skip: 1, take: 2 });
    expect(prisma.auditLog.findMany.mock.calls[0][0].where.createdAt).toEqual({
      gte: new Date(Date.UTC(2026, 5, 1)),
      lte: new Date(Date.UTC(2026, 5, 1, 23)),
    });

    const batches = await collect(
      svc.replay({ tags: [deriveTagPath("Batch")], maxRecords: 0 })
    );
    expect(batches.map((r) => r.context.extra.entity_id)).toEqual(["b-1"]);
    // The tag filter became an entityType predicate: one row scanned, not the whole range.
    expect(prisma.auditLog.findMany.mock.calls[4][0].where.entityType).toEqual({
      in: ["batch"],
      mode: "insensitive",
    });
    expect(svc.getStatus().rowsScanned).toBe(7);

    const capped = await collect(
      svc.replay({ tags: ["mes.backend"], maxRecords: 3 })
    );
    expect(capped).toHaveLength(3);
    expect(svc.getStatus()).toMatchObject({ enabled: true, runs: 3, recordsReplayed: 10 });
    expect(svc.getStatus().rowsScanned).toBe(10);
    expect(svc.getStatus().lastRunAt).toBeDefined();

    // A tag tree the audit log can never carry is answered without a query.
    const elsewhere = await collect(svc.replay({ tags: ["mes.changeover"], maxRecords: 0 }));
    expect(elsewhere).toEqual([]);
    expect(prisma.auditLog.findMany).toHaveBeenCalledTimes(7);
    expect(svc.getStatus()).toMatchObject({ runs: 4, recordsReplayed: 10, rowsScanned: 10 });
  });

  it("fails loudly without Prisma and records database errors", async () => {
    const none = new ForgeBackfillService(config, undefined);
    await expect(collect(none.replay({ tags: [], maxRecords: 0 }))).rejects.toThrow("Prisma");

    const broken = new ForgeBackfillService(config, fakePrisma([], { fail: true }) as any);
    await expect(collect(broken.replay({ tags: [], maxRecords: 0 }))).rejects.toThrow("db unavailable");
    expect(broken.getStatus().lastError).toBe("db unavailable");
  });
});

describe("entityTypesForTags", () => {
  it("inverts a tag filter into the entity types that can carry it", () => {
    expect(entityTypesForTags([])).toBeUndefined();
    expect(entityTypesForTags(["mes"])).toBeUndefined();
    expect(entityTypesForTags(["mes.backend"])).toBeUndefined();
    expect(entityTypesForTags(["mes.backend.batch", "mes"])).toBeUndefined();
    expect(
      entityTypesForTags(["mes.backend.ScheduleOrder", "mes.backend.batch", "mes.backend.Batch"])
    ).toEqual(["scheduleorder", "batch"]);
    expect(entityTypesForTags(["mes.backend.batch", "mes.changeover"])).toEqual(["batch"]);
    expect(entityTypesForTags(["mes.changeover"])).toEqual([]);
    expect(entityTypesForTags(["mes.backend.batch.status"])).toEqual([]);
  });
});
