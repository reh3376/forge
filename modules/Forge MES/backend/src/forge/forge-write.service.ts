/**
 * Registry and dispatcher for hub -> spoke writes (BACKLOG FB-054).
 *
 * Domain modules register a `ForgeWriteTarget` for a tag prefix (the
 * changeover module owns `mes.changeover`). `ForgeSpokeServer` hands every
 * inbound `Write` RPC to `write()`, which picks the target by longest matching
 * prefix. Nothing here knows about gRPC, so targets are unit-testable and the
 * same registry answers `Discover` (`describe()`) and `GET /api/forge/tags`.
 */
import { Injectable, Logger } from "@nestjs/common";
import type { ContextualRecordMessage } from "./contextual-record.mapper";

export type WriteRejectCode =
  | "invalid_tag"
  | "no_target"
  | "invalid_payload"
  | "invalid_state"
  | "conflict"
  | "not_found";

/** A write the target understood but refuses; becomes `success=false` on the wire. */
export class WriteRejectedError extends Error {
  constructor(
    public readonly code: WriteRejectCode,
    message: string
  ) {
    super(message);
    this.name = "WriteRejectedError";
  }
}

export interface WriteTagDescriptor {
  tag_path: string;
  data_type: string;
  description: string;
  engineering_units?: string;
  metadata?: Record<string, unknown>;
}

export interface WriteContext {
  /** The hub asked for a read-back record. */
  confirm: boolean;
  /** Identity the hub presented (adapter id on the request); for audit fields. */
  requestedBy: string;
}

export interface SpokeWriteResult {
  success: boolean;
  message: string;
  /** Set when the target refused the write (see WriteRejectCode). */
  code?: WriteRejectCode;
  readback?: ContextualRecordMessage;
}

export interface ForgeWriteTarget {
  /** Tag prefix this target owns, e.g. "mes.changeover" (`/` and `.` both accepted). */
  readonly prefix: string;
  /** Tags the target exposes, for Discover. */
  describe(): WriteTagDescriptor[];
  /** Apply one write. Throw WriteRejectedError to refuse it cleanly. */
  write(
    tagPath: string,
    value: unknown,
    ctx: WriteContext
  ): Promise<SpokeWriteResult>;
}

export interface WriteStats {
  received: number;
  succeeded: number;
  rejected: number;
  failed: number;
  lastTagPath?: string;
  lastMessage?: string;
  lastWriteAt?: string;
  lastError?: string;
  targets: string[];
}

/** Canonical dotted form: trims, turns `/` into `.`, collapses repeats. */
export function normalizeTagPath(tagPath: string): string {
  return String(tagPath ?? "")
    .trim()
    .replace(/\//g, ".")
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "");
}

@Injectable()
export class ForgeWriteService {
  private readonly logger = new Logger(ForgeWriteService.name);
  private readonly targets = new Map<string, ForgeWriteTarget>();
  private received = 0;
  private succeeded = 0;
  private rejected = 0;
  private failed = 0;
  private lastTagPath?: string;
  private lastMessage?: string;
  private lastWriteAt?: Date;
  private lastError?: string;

  register(target: ForgeWriteTarget): void {
    const prefix = normalizeTagPath(target.prefix);
    if (!prefix) throw new Error("write target prefix must not be empty");
    const existing = this.targets.get(prefix);
    if (existing && existing !== target) {
      throw new Error(`write target for '${prefix}' is already registered`);
    }
    this.targets.set(prefix, target);
    this.logger.log(`Write target registered: ${prefix}`);
  }

  unregister(prefix: string): boolean {
    return this.targets.delete(normalizeTagPath(prefix));
  }

  /** Target owning `tagPath` (longest prefix wins), if any. */
  resolve(
    tagPath: string
  ): { target: ForgeWriteTarget; prefix: string; tagPath: string } | undefined {
    const normalized = normalizeTagPath(tagPath);
    let best: { target: ForgeWriteTarget; prefix: string } | undefined;
    for (const [prefix, target] of this.targets) {
      const owns = normalized === prefix || normalized.startsWith(`${prefix}.`);
      if (owns && (!best || prefix.length > best.prefix.length)) {
        best = { target, prefix };
      }
    }
    return best ? { ...best, tagPath: normalized } : undefined;
  }

  describe(): WriteTagDescriptor[] {
    const all: WriteTagDescriptor[] = [];
    for (const target of this.targets.values()) all.push(...target.describe());
    return all.sort((a, b) => a.tag_path.localeCompare(b.tag_path));
  }

  /**
   * Apply one write. Refusals (unknown tag, bad payload, illegal state
   * transition, ...) come back as `success=false` with a `code`; anything
   * else the target throws is counted as a failure and re-thrown.
   */
  async write(
    tagPath: string,
    value: unknown,
    ctx: WriteContext
  ): Promise<SpokeWriteResult> {
    this.received++;
    this.lastWriteAt = new Date();
    this.lastTagPath = tagPath;
    const resolved = this.resolve(tagPath);
    if (!resolved) {
      return this.reject(
        new WriteRejectedError(
          normalizeTagPath(tagPath) ? "no_target" : "invalid_tag",
          normalizeTagPath(tagPath)
            ? `no write target for '${tagPath}' (registered: ${[...this.targets.keys()].join(", ") || "none"})`
            : "empty tag path"
        )
      );
    }
    try {
      const result = await resolved.target.write(resolved.tagPath, value, ctx);
      if (result.success) this.succeeded++;
      else this.rejected++;
      this.lastMessage = result.message;
      return result;
    } catch (err) {
      if (err instanceof WriteRejectedError) return this.reject(err);
      this.failed++;
      this.lastError = err instanceof Error ? err.message : String(err);
      this.logger.error(`Write to '${tagPath}' failed: ${this.lastError}`);
      throw err;
    }
  }

  getStats(): WriteStats {
    return {
      received: this.received,
      succeeded: this.succeeded,
      rejected: this.rejected,
      failed: this.failed,
      lastTagPath: this.lastTagPath,
      lastMessage: this.lastMessage,
      lastWriteAt: this.lastWriteAt?.toISOString(),
      lastError: this.lastError,
      targets: [...this.targets.keys()].sort(),
    };
  }

  private reject(err: WriteRejectedError): SpokeWriteResult {
    this.rejected++;
    this.lastMessage = `${err.code}: ${err.message}`;
    this.logger.warn(`Write to '${this.lastTagPath}' rejected (${this.lastMessage})`);
    return { success: false, message: this.lastMessage, code: err.code };
  }
}
