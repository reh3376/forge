/**
 * Backfill source for the spoke-hosted `Backfill` RPC (BACKLOG FB-061).
 *
 * The hub asks for a time range (and optionally tag paths); the spoke
 * replays what happened in that range as ContextualRecords. The durable
 * source is the `AuditLog` table: every CREATE/UPDATE/DELETE on a domain
 * entity is one row with the entity type, id, the values after (or before)
 * the change and who did it. Rows are mapped through the same
 * `mapDomainEventToRecord` the live push path uses, with event types
 * `audit.create` / `audit.update` / `audit.delete`, so a replayed record
 * sits next to the live ones with one extra marker: `extra.replay = backfill`.
 *
 * Rows are paged by cursor in `createdAt, id` order. A tag filter is pushed
 * into the query (FB-071): the tag path is a function of the entity type
 * (`mes.backend.<entity type>`), so `entityTypesForTags` inverts the filter
 * into an `entityType IN (...)` predicate and a narrow filter no longer scans
 * the whole range; the post-mapping `matchesTagFilter` stays as the safety
 * net. `maxRecords` caps what is emitted, not what is scanned.
 */
import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  ContextualRecordMessage,
  TAG_PATH_PREFIX,
  mapDomainEventToRecord,
} from "./contextual-record.mapper";
import { FORGE_CONFIG, ForgeConfig } from "./forge.config";
import { FORGE_MES_MANIFEST } from "./forge-manifest";

export interface BackfillRange {
  start?: Date;
  end?: Date;
  /** Tag paths (exact or prefix, e.g. `mes.changeover`); empty = everything. */
  tags: string[];
  /** 0 = no limit. */
  maxRecords: number;
}

export interface ForgeBackfillSource {
  replay(range: BackfillRange): AsyncIterable<ContextualRecordMessage>;
}

export interface BackfillStatus {
  enabled: boolean;
  runs: number;
  recordsReplayed: number;
  rowsScanned: number;
  lastRunAt?: string;
  lastError?: string;
}

/** The slice of an AuditLog row the replay needs (Prisma or a test double). */
export interface AuditLogRowLike {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  oldValues: unknown;
  newValues: unknown;
  userId: string | null;
  createdAt: Date;
}

/** `tagPath` equals one of `tags` or sits under one of them (`mes.changeover.cooker`). */
export function matchesTagFilter(tagPath: string | undefined, tags: readonly string[]): boolean {
  if (!tags.length) return true;
  if (!tagPath) return false;
  return tags.some((t) => tagPath === t || tagPath.startsWith(`${t}.`));
}

/**
 * Invert a tag filter into the AuditLog `entityType` values that can satisfy
 * it (FB-071). `undefined` = no predicate (everything matches); `[]` = nothing
 * in the audit log can match, so the query is skipped. Lower-cased, matched
 * case-insensitively, because `deriveTagPath` lower-cases the entity type.
 */
export function entityTypesForTags(tags: readonly string[]): string[] | undefined {
  if (!tags.length) return undefined;
  const types: string[] = [];
  for (const tag of tags) {
    if (tag === TAG_PATH_PREFIX || TAG_PATH_PREFIX.startsWith(`${tag}.`)) return undefined;
    if (!tag.startsWith(`${TAG_PATH_PREFIX}.`)) continue; // another tag tree: no audit row
    const rest = tag.slice(TAG_PATH_PREFIX.length + 1).toLowerCase();
    if (!rest || rest.includes(".")) continue; // deeper than deriveTagPath ever emits
    if (!types.includes(rest)) types.push(rest);
  }
  return types;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

@Injectable()
export class ForgeBackfillService implements ForgeBackfillSource {
  private readonly logger = new Logger(ForgeBackfillService.name);
  private runs = 0;
  private recordsReplayed = 0;
  private rowsScanned = 0;
  private lastRunAt?: number;
  private lastError?: string;

  constructor(
    @Inject(FORGE_CONFIG) private readonly config: ForgeConfig,
    @Optional() private readonly prisma?: PrismaService,
    private readonly pageSize = 500
  ) {}

  get enabled(): boolean {
    return Boolean(this.prisma);
  }

  getStatus(): BackfillStatus {
    return {
      enabled: this.enabled,
      runs: this.runs,
      recordsReplayed: this.recordsReplayed,
      rowsScanned: this.rowsScanned,
      lastRunAt: this.lastRunAt ? new Date(this.lastRunAt).toISOString() : undefined,
      lastError: this.lastError,
    };
  }

  /** One AuditLog row -> ContextualRecord (undefined when it cannot be mapped). */
  toRecord(row: AuditLogRowLike): ContextualRecordMessage | undefined {
    const action = String(row.action).toLowerCase();
    const values = asObject(action === "delete" ? row.oldValues ?? row.newValues : row.newValues ?? row.oldValues);
    const data: Record<string, unknown> = {
      ...values,
      id: row.entityId,
      eventTimestamp: row.createdAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      ...(row.userId ? { userId: row.userId } : {}),
    };
    try {
      const record = mapDomainEventToRecord(
        { entityType: row.entityType, eventType: `audit_${action}`, data },
        {
          adapterId: this.config.adapterId,
          adapterVersion: FORGE_MES_MANIFEST.version,
          site: this.config.site,
          area: this.config.area,
        }
      );
      record.context.extra.replay = "backfill";
      record.context.extra.audit_log_id = row.id;
      record.context.extra.audit_action = String(row.action);
      record.lineage.transformation_chain = [
        ...record.lineage.transformation_chain,
        "forge-mes-backend:audit-log-replay",
      ];
      return record;
    } catch (err) {
      this.logger.warn(`AuditLog ${row.id} (${row.entityType}) could not be mapped: ${err}`);
      return undefined;
    }
  }

  async *replay(range: BackfillRange): AsyncIterable<ContextualRecordMessage> {
    if (!this.prisma) {
      throw new Error("backfill is unavailable: Prisma is not wired into ForgeBackfillService");
    }
    this.runs++;
    this.lastRunAt = Date.now();
    const entityTypes = entityTypesForTags(range.tags);
    if (entityTypes && entityTypes.length === 0) return; // no audit row can carry those tags
    const where = {
      ...((range.start || range.end) && {
        createdAt: {
          ...(range.start && { gte: range.start }),
          ...(range.end && { lte: range.end }),
        },
      }),
      ...(entityTypes && { entityType: { in: entityTypes, mode: "insensitive" as const } }),
    };
    let cursor: string | undefined;
    let emitted = 0;
    try {
      for (;;) {
        const rows: AuditLogRowLike[] = await this.prisma.auditLog.findMany({
          where,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: this.pageSize,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        if (!rows.length) return;
        for (const row of rows) {
          this.rowsScanned++;
          const record = this.toRecord(row);
          if (!record || !matchesTagFilter(record.source.tag_path, range.tags)) continue;
          yield record;
          emitted++;
          this.recordsReplayed++;
          if (range.maxRecords > 0 && emitted >= range.maxRecords) return;
        }
        if (rows.length < this.pageSize) return;
        cursor = rows[rows.length - 1].id;
      }
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }
}
