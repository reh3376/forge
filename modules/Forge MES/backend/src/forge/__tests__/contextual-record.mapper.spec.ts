import {
  assessQuality,
  deriveShift,
  deriveTagPath,
  FORGE_MES_SCHEMA_REF,
  mapDomainEventToRecord,
  normalizeEventType,
  toSnakeCase,
} from "../contextual-record.mapper";
import { fromTimestamp, toTimestamp } from "../proto";

const OPTS = {
  adapterId: "forge-mes",
  adapterVersion: "0.1.0",
  site: "whk01",
  area: "distillery01",
  now: new Date("2026-06-01T15:00:00.000Z"),
};

describe("normalizeEventType", () => {
  it.each([
    ["StepExecution", "step_started", "step.started"],
    ["ProductionEvent", "PhaseCompleted", "phase.completed"],
    ["ProductionEvent", "MaterialConsumed", "inventory.material_consumed"],
    ["StepExecution", "StepExecution::step_paused", "step.paused"],
    ["ScheduleOrder", "schedule_order_queued", "production.schedule_queued"],
    ["Batch", "batchStatusChanged", "batch.status_changed"],
    ["Custom", "custom_thing_happened", "custom.thing_happened"],
    ["Custom", "noUnderscoreHere", "no.underscore_here"],
    [undefined, undefined, "unknown"],
  ])("%s / %s -> %s", (entity, event, expected) => {
    expect(normalizeEventType(entity, event)).toBe(expected);
  });

  it("snake-cases CamelCase", () => {
    expect(toSnakeCase("PhaseStarted")).toBe("phase_started");
    expect(toSnakeCase("StepExecution::step_started")).toBe(
      "step_execution_step_started"
    );
  });
});

describe("deriveShift (America/Kentucky/Louisville)", () => {
  it("is day between 06:00 and 18:00 local", () => {
    // 15:00Z in June = 11:00 EDT
    expect(deriveShift(new Date("2026-06-01T15:00:00Z"))).toBe("day");
    // 09:59Z in June = 05:59 EDT
    expect(deriveShift(new Date("2026-06-01T09:59:00Z"))).toBe("night");
    // 10:00Z in June = 06:00 EDT
    expect(deriveShift(new Date("2026-06-01T10:00:00Z"))).toBe("day");
    // 22:00Z in June = 18:00 EDT
    expect(deriveShift(new Date("2026-06-01T22:00:00Z"))).toBe("night");
  });

  it("respects standard time in winter", () => {
    // 11:00Z in January = 06:00 EST
    expect(deriveShift(new Date("2026-01-15T11:00:00Z"))).toBe("day");
    expect(deriveShift(new Date("2026-01-15T10:59:00Z"))).toBe("night");
  });
});

describe("assessQuality", () => {
  it("mirrors the Python heuristics", () => {
    expect(assessQuality({ id: "x", createdAt: "2026-01-01" })).toBe(
      "QUALITY_CODE_GOOD"
    );
    expect(assessQuality({ batchId: "b" })).toBe("QUALITY_CODE_UNCERTAIN");
    expect(assessQuality({ timestamp: "2026-01-01" })).toBe(
      "QUALITY_CODE_UNCERTAIN"
    );
    expect(assessQuality({})).toBe("QUALITY_CODE_NOT_AVAILABLE");
    expect(assessQuality({ id: "x", createdAt: "t", error: "boom" })).toBe(
      "QUALITY_CODE_BAD"
    );
  });
});

describe("mapDomainEventToRecord", () => {
  const stepStarted = {
    entityType: "StepExecution",
    eventType: "step_started",
    data: {
      id: "step-1",
      batchId: "BATCH-2026-0042-001",
      productionOrderId: "PRO-2026-WB-0042",
      recipeId: "RCP-WHEATED-BOURBON-003",
      stepName: "Saccharification Rest",
      state: "Running",
      initiatedBy: "USR-0023",
      createdAt: new Date("2026-06-01T14:58:30.000Z"),
      updatedAt: new Date("2026-06-01T14:59:00.000Z"),
      targetTemperatureF: 152,
      nested: { ok: true },
    },
    context: { phase: "Mashing", batchId: "BATCH-2026-0042-001", assetId: "MASH-TUN-01" },
  };

  it("fills source, lineage, timestamps and value", () => {
    const r = mapDomainEventToRecord(stepStarted, OPTS);
    expect(r.record_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.source).toEqual({
      adapter_id: "forge-mes",
      system: "forge-mes",
      tag_path: "mes.backend.stepexecution",
    });
    expect(r.lineage).toEqual({
      schema_ref: FORGE_MES_SCHEMA_REF,
      adapter_id: "forge-mes",
      adapter_version: "0.1.0",
      transformation_chain: ["forge-mes-backend:domain-event"],
    });
    // source_time prefers updatedAt over createdAt (newest entity timestamp)
    expect(fromTimestamp(r.timestamp.source_time)?.toISOString()).toBe(
      "2026-06-01T14:59:00.000Z"
    );
    expect(fromTimestamp(r.timestamp.ingestion_time)?.toISOString()).toBe(
      OPTS.now.toISOString()
    );
    expect(r.value.data_type).toBe("object");
    expect(r.value.quality).toBe("QUALITY_CODE_GOOD");
    expect(JSON.parse(r.value.json_value)).toMatchObject({
      id: "step-1",
      nested: { ok: true },
      createdAt: "2026-06-01T14:58:30.000Z",
    });
  });

  it("populates the FACTS mandatory and optional context fields", () => {
    const r = mapDomainEventToRecord(stepStarted, OPTS);
    expect(r.context).toMatchObject({
      equipment_id: "MASH-TUN-01",
      area: "distillery01",
      site: "whk01",
      batch_id: "BATCH-2026-0042-001",
      recipe_id: "RCP-WHEATED-BOURBON-003",
      operating_mode: "Running",
      shift_id: "day",
      operator_id: "USR-0023",
      event_type: "step.started",
      event_timestamp: { seconds: String(Date.parse("2026-06-01T14:59:00.000Z") / 1000), nanos: 0 },
      work_order_id: "PRO-2026-WB-0042",
    });
    // FB-013: the registry's fields ride in their slots; extra keeps the rest.
    expect(r.context.extra).toEqual({
      entity_type: "StepExecution",
      entity_id: "step-1",
      source_event_type: "step_started",
      production_order_id: "PRO-2026-WB-0042",
      equipment_phase: "Mashing",
      process_step: "Saccharification Rest",
    });
  });

  it("omits unknown context instead of sending empty strings", () => {
    const r = mapDomainEventToRecord(
      { entityType: "ProductionEvent", eventType: "PhaseStarted", data: {} },
      OPTS
    );
    expect(r.context.batch_id).toBeUndefined();
    expect(r.context.equipment_id).toBeUndefined();
    expect(r.context.work_order_id).toBeUndefined();
    expect(r.context.event_type).toBe("phase.started");
    expect(r.context.event_timestamp).toEqual(toTimestamp(OPTS.now));
    expect(r.context.extra).toEqual({
      entity_type: "ProductionEvent",
      source_event_type: "PhaseStarted",
    });
    expect(r.value.quality).toBe("QUALITY_CODE_NOT_AVAILABLE");
    expect(r.timestamp.server_time).toBeUndefined();
  });

  it("prefers the explicit event context over payload fields", () => {
    const r = mapDomainEventToRecord(
      {
        entityType: "ScheduleOrder",
        eventType: "schedule_order_queued",
        data: { id: "so-1", batchId: "payload-batch", scheduleOrderId: "payload-so" },
        context: { batchId: "ctx-batch", scheduleOrderId: "ctx-so", area: "fermentation" },
      },
      OPTS
    );
    expect(r.context.batch_id).toBe("ctx-batch");
    expect(r.context.area).toBe("fermentation");
    expect(r.context.extra.schedule_order_id).toBe("ctx-so");
  });

  it("serialises BigInt payload values", () => {
    const r = mapDomainEventToRecord(
      { entityType: "Lot", eventType: "lot_created", data: { id: "l", qty: BigInt(42) } },
      OPTS
    );
    expect(JSON.parse(r.value.json_value)).toEqual({ id: "l", qty: "42" });
    expect(deriveTagPath("Lot")).toBe("mes.backend.lot");
  });
});
