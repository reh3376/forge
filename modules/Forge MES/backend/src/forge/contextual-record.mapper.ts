/**
 * Maps a backend domain event (the payload every service hands to
 * MqttDomainPublisherService.publishDomainEvent) to a forge.v1.ContextualRecord
 * in proto-loader wire shape.
 *
 * The mapping mirrors the hub-side Python adapter
 * (`src/forge/adapters/forge_mes/{context,record_builder}.py`) so a record
 * pushed from here and a record pulled by the hub describe the same event the
 * same way:
 *   - the 6 mandatory + 10 optional FACTS context fields
 *   - the event-type normalisation table (StepExecution::step_started -> step.started)
 *   - the Louisville two-shift enrichment rule
 *   - the quality assessment heuristics
 *
 * Fields that exist on the proto RecordContext are set directly; the FACTS
 * fields that do not (production_order_id, event_type, ...) travel in
 * `context.extra`, exactly as the Python RecordContext serialises them.
 */
import { randomUUID } from "crypto";
import type { DomainEventParams } from "../mqttDomainPublisher/types";
import { ProtoTimestamp, toTimestamp } from "./proto";

export const FORGE_MES_SCHEMA_REF = "forge://schemas/forge-mes/v0.1.0";
export const LOUISVILLE_TZ = "America/Kentucky/Louisville";
const DAY_SHIFT_START_HOUR = 6;
const DAY_SHIFT_END_HOUR = 18;

export type QualityCode =
  | "QUALITY_CODE_GOOD"
  | "QUALITY_CODE_UNCERTAIN"
  | "QUALITY_CODE_BAD"
  | "QUALITY_CODE_NOT_AVAILABLE";

export interface ContextualRecordMessage {
  record_id: string;
  source: { adapter_id: string; system: string; tag_path?: string };
  timestamp: {
    source_time: ProtoTimestamp;
    server_time?: ProtoTimestamp;
    ingestion_time: ProtoTimestamp;
  };
  value: { json_value: string; quality: QualityCode; data_type: string };
  context: {
    equipment_id?: string;
    area?: string;
    site?: string;
    batch_id?: string;
    lot_id?: string;
    recipe_id?: string;
    operating_mode?: string;
    shift?: string;
    operator_id?: string;
    extra: Record<string, string>;
  };
  lineage: {
    schema_ref: string;
    adapter_id: string;
    adapter_version: string;
    transformation_chain: string[];
  };
}

export interface MapperOptions {
  adapterId: string;
  adapterVersion: string;
  site: string;
  area: string;
  /** Injected for deterministic tests; defaults to new Date(). */
  now?: Date;
}

// MES domain event types -> normalised Forge identifiers.
// Keep in sync with _MES_EVENT_TO_FORGE in the Python context mapper.
const MES_EVENT_TO_FORGE: Record<string, string> = {
  step_started: "step.started",
  step_completed: "step.completed",
  step_paused: "step.paused",
  step_resumed: "step.resumed",
  step_held: "step.held",
  step_aborted: "step.aborted",
  phase_started: "phase.started",
  phase_completed: "phase.completed",
  phasecompleted: "phase.completed",
  phasestarted: "phase.started",
  mashing_started: "mashing.started",
  mashing_completed: "mashing.completed",
  mashing_step_completed: "mashing.step_completed",
  batch_created: "batch.created",
  batch_started: "batch.started",
  batch_completed: "batch.completed",
  batch_status_changed: "batch.status_changed",
  batchstatuschanged: "batch.status_changed",
  production_order_created: "production.order_created",
  production_order_started: "production.order_started",
  production_order_completed: "production.order_completed",
  schedule_order_queued: "production.schedule_queued",
  parameter_override: "parameter.override",
  parameter_recorded: "parameter.recorded",
  sample_taken: "quality.sample_taken",
  test_completed: "quality.test_completed",
  deviation_detected: "quality.deviation_detected",
  equipment_state_changed: "equipment.state_changed",
  changeover_started: "equipment.changeover_started",
  changeover_completed: "equipment.changeover_completed",
  material_consumed: "inventory.material_consumed",
  material_received: "inventory.material_received",
  inventory_transfer: "inventory.transfer",
};

/** CamelCase / PascalCase -> snake_case ("PhaseStarted" -> "phase_started"). */
export function toSnakeCase(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s:]+/g, "_")
    .replace(/_+/g, "_")
    .toLowerCase();
}

/**
 * Normalise an MES event type to Forge's dot-separated vocabulary.
 * Priority mirrors the Python `normalize_event_type` explicit-field path,
 * with one addition: CamelCase inputs are snake-cased before lookup so
 * "MaterialConsumed" resolves to the table entry "material_consumed".
 */
export function normalizeEventType(
  entityType: string | undefined,
  eventType: string | undefined
): string {
  if (!eventType) return "unknown";
  const key = String(eventType).trim().replace(/::/g, "_").replace(/ /g, "_");
  const candidates = [key.toLowerCase(), toSnakeCase(key)];
  for (const c of candidates) {
    const mapped = MES_EVENT_TO_FORGE[c];
    if (mapped) return mapped;
  }
  // Compound "entity_event" keys: try the part after the entity prefix.
  for (const c of candidates) {
    if (c.includes("_")) {
      const rest = c.slice(c.indexOf("_") + 1);
      const mapped = MES_EVENT_TO_FORGE[rest];
      if (mapped) return mapped;
    }
  }
  // Entity-prefixed compound (e.g. "stepexecution_step_started").
  if (entityType) {
    const compound = `${toSnakeCase(entityType)}_${toSnakeCase(key)}`;
    const mapped = MES_EVENT_TO_FORGE[compound];
    if (mapped) return mapped;
  }
  const snake = toSnakeCase(key);
  return snake.includes("_") ? snake.replace("_", ".") : snake;
}

/** Louisville two-shift rule: day 06:00-18:00, night otherwise. */
export function deriveShift(eventTime: Date): "day" | "night" {
  const hourText = new Intl.DateTimeFormat("en-US", {
    timeZone: LOUISVILLE_TZ,
    hour: "numeric",
    hourCycle: "h23",
  }).format(eventTime);
  const hour = Number.parseInt(hourText, 10);
  return hour >= DAY_SHIFT_START_HOUR && hour < DAY_SHIFT_END_HOUR
    ? "day"
    : "night";
}

type Raw = Record<string, unknown>;

function pick(raw: Raw, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = raw[k];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return undefined;
}

function nested(raw: Raw, ...path: string[]): string | undefined {
  let cur: unknown = raw;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Raw)[key];
  }
  if (cur === undefined || cur === null || cur === "") return undefined;
  return typeof cur === "object" ? undefined : String(cur);
}

function truthy(raw: Raw, ...keys: string[]): boolean {
  return keys.some((k) => {
    const v = raw[k];
    return v !== undefined && v !== null && v !== "" && v !== false;
  });
}

/** Mirrors `_assess_quality` in the Python record builder. */
export function assessQuality(raw: Raw): QualityCode {
  if (truthy(raw, "error", "is_error", "isError")) return "QUALITY_CODE_BAD";
  const hasId = truthy(
    raw,
    "batch_id",
    "batchId",
    "production_order_id",
    "productionOrderId",
    "equipment_id",
    "equipmentId",
    "lot_id",
    "lotId",
    "id"
  );
  const hasTime = truthy(
    raw,
    "event_timestamp",
    "eventTimestamp",
    "timestamp",
    "createdAt",
    "created_at"
  );
  if (hasId && hasTime) return "QUALITY_CODE_GOOD";
  if (hasId || hasTime) return "QUALITY_CODE_UNCERTAIN";
  return "QUALITY_CODE_NOT_AVAILABLE";
}

function parseDate(v: unknown): Date | undefined {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

/** Event time: explicit event timestamp, else the entity's own timestamps. */
export function extractSourceTime(raw: Raw): Date | undefined {
  for (const k of [
    "event_timestamp",
    "eventTimestamp",
    "timestamp",
    "updatedAt",
    "createdAt",
    "created_at",
  ]) {
    const d = parseDate(raw[k]);
    if (d) return d;
  }
  return undefined;
}

/** JSON-encode the raw event; Prisma Decimal/BigInt/Date become strings. */
export function encodeRawValue(raw: Raw): string {
  return JSON.stringify(raw, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value
  );
}

/** Tag path convention shared with the Python adapter: mes.<source>.<entity>. */
export function deriveTagPath(entityType: string | undefined): string {
  return `mes.backend.${(entityType || "event").toLowerCase()}`;
}

function defined(obj: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

export function mapDomainEventToRecord(
  params: DomainEventParams,
  opts: MapperOptions
): ContextualRecordMessage {
  const now = opts.now ?? new Date();
  const raw: Raw = (params.data ?? {}) as Raw;
  const ctx = params.context ?? {};

  const sourceTime = extractSourceTime(raw) ?? now;
  const eventType = normalizeEventType(params.entityType, params.eventType);

  const productionOrderId =
    pick(raw, "production_order_id", "productionOrderId") ??
    nested(raw, "productionOrder", "id");
  const batchId =
    ctx.batchId || pick(raw, "batch_id", "batchId") || nested(raw, "batch", "id");
  const recipeId =
    pick(raw, "recipe_id", "recipeId") ?? nested(raw, "recipe", "id");
  const equipmentId =
    ctx.assetId ||
    pick(raw, "equipment_id", "equipmentId", "assetId") ||
    nested(raw, "equipmentPhase", "equipment", "id");
  const lotId = pick(raw, "lot_id", "lotId") ?? nested(raw, "lot", "id");
  const operatorId = pick(
    raw,
    "operator_id",
    "operatorId",
    "initiatedBy",
    "userId",
    "user_id",
    "createdBy"
  );
  const scheduleOrderId =
    ctx.scheduleOrderId || pick(raw, "schedule_order_id", "scheduleOrderId");
  const equipmentPhase =
    ctx.phase || pick(raw, "phase") || nested(raw, "equipmentPhase", "name");
  const processStep =
    pick(raw, "stepName", "step_name", "operationName") ??
    nested(raw, "step", "name");
  const whiskeyType =
    nested(raw, "whiskeyType", "name") ?? nested(raw, "recipe", "whiskeyType", "name");
  const entityId = pick(raw, "id");

  const extra = defined({
    event_type: eventType,
    event_timestamp: sourceTime.toISOString(),
    entity_type: params.entityType,
    entity_id: entityId,
    source_event_type: params.eventType,
    production_order_id: productionOrderId,
    work_order_id: productionOrderId,
    schedule_order_id: scheduleOrderId,
    equipment_phase: equipmentPhase,
    process_step: processStep,
    severity: ctx.severity || pick(raw, "severity"),
    quality_result_id: pick(raw, "test_id", "testId"),
    material_id: pick(raw, "material_id", "itemId") ?? nested(raw, "item", "id"),
    whiskey_type: whiskeyType,
  });

  const serverTime = parseDate(raw["updatedAt"]) ?? parseDate(raw["createdAt"]);

  return {
    record_id: randomUUID(),
    source: {
      adapter_id: opts.adapterId,
      system: "forge-mes",
      tag_path: deriveTagPath(params.entityType),
    },
    timestamp: {
      source_time: toTimestamp(sourceTime),
      ...(serverTime ? { server_time: toTimestamp(serverTime) } : {}),
      ingestion_time: toTimestamp(now),
    },
    value: {
      json_value: encodeRawValue(raw),
      quality: assessQuality(raw),
      data_type: "object",
    },
    context: {
      ...defined({
        equipment_id: equipmentId,
        area: ctx.area || opts.area,
        site: opts.site,
        batch_id: batchId,
        lot_id: lotId,
        recipe_id: recipeId,
        operating_mode: pick(raw, "newState", "state", "status"),
        shift: deriveShift(sourceTime),
        operator_id: operatorId,
      }),
      extra,
    },
    lineage: {
      schema_ref: FORGE_MES_SCHEMA_REF,
      adapter_id: opts.adapterId,
      adapter_version: opts.adapterVersion,
      transformation_chain: ["forge-mes-backend:domain-event"],
    },
  };
}
