/**
 * Changeover commands as Forge write targets (BACKLOG FB-054).
 *
 * The hub, and through it the OT module, drives the per-area changeover
 * state machine by writing to
 *
 *     mes.changeover.<area>.<command>
 *         area    cooker | fermentation | barreling
 *         command request | cip-complete | recipe-loaded | start-production | reset
 *
 * with the same JSON body the REST endpoint takes
 * (`POST /api/changeover/<area>/<command>`), so Ignition and the OT module
 * speak one contract. A confirmed write returns the area state after the
 * transition as a ContextualRecord on `mes.changeover.<area>.state`.
 */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import {
  ContextualRecordMessage,
  mapDomainEventToRecord,
} from "../forge/contextual-record.mapper";
import { FORGE_CONFIG, ForgeConfig } from "../forge/forge.config";
import { FORGE_MES_MANIFEST } from "../forge/forge-manifest";
import {
  ForgeWriteService,
  ForgeWriteTarget,
  SpokeWriteResult,
  WriteContext,
  WriteRejectedError,
  WriteTagDescriptor,
  normalizeTagPath,
} from "../forge/forge-write.service";
import { ChangeoverService } from "./changeover.service";
import {
  ChangeoverArea,
  ChangeoverState,
  TransitionResult,
  VALID_AREAS,
} from "./changeover.types";
import {
  ChangeoverRequestDto,
  CipCompleteDto,
  RecipeLoadedDto,
  ResetErrorDto,
  StartProductionDto,
} from "./dto/changeover.dto";

export const CHANGEOVER_WRITE_PREFIX = "mes.changeover";
/** Read-only tag carried by the read-back record. */
export const CHANGEOVER_STATE_TAG = "state";

interface CommandSpec<D extends object> {
  dto: new () => D;
  description: string;
  acceptedStates: ChangeoverState[];
  run: (svc: ChangeoverService, area: ChangeoverArea, dto: D) => Promise<TransitionResult>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CHANGEOVER_COMMANDS: Record<string, CommandSpec<any>> = {
  request: {
    dto: ChangeoverRequestDto,
    description:
      "Request changeover: PRODUCTION | COOK_COMPLETE -> AWAITING_CHANGEOVER",
    acceptedStates: [ChangeoverState.PRODUCTION, ChangeoverState.COOK_COMPLETE],
    run: (svc, area, dto: ChangeoverRequestDto) => svc.requestChangeover(area, dto),
  },
  "cip-complete": {
    dto: CipCompleteDto,
    description:
      "Report CIP completion: -> CIP_COMPLETE -> RECIPE_LOADING (publishes recipe/next)",
    acceptedStates: [
      ChangeoverState.CIP_IN_PROGRESS,
      ChangeoverState.AWAITING_CHANGEOVER,
    ],
    run: (svc, area, dto: CipCompleteDto) => svc.cipComplete(area, dto),
  },
  "recipe-loaded": {
    dto: RecipeLoadedDto,
    description:
      "Confirm the recipe is loaded on the equipment: -> RECIPE_LOADED -> READY_TO_START",
    acceptedStates: [ChangeoverState.RECIPE_LOADING, ChangeoverState.CIP_COMPLETE],
    run: (svc, area, dto: RecipeLoadedDto) => svc.recipeLoaded(area, dto),
  },
  "start-production": {
    dto: StartProductionDto,
    description:
      "Start production: READY_TO_START -> PRODUCTION (advances the schedule-order queue)",
    acceptedStates: [ChangeoverState.READY_TO_START],
    run: (svc, area, dto: StartProductionDto) => svc.startProduction(area, dto),
  },
  reset: {
    dto: ResetErrorDto,
    description: "Leave ERROR: -> AWAITING_CHANGEOVER | CIP_COMPLETE",
    acceptedStates: [ChangeoverState.ERROR],
    run: (svc, area, dto: ResetErrorDto) => svc.resetError(area, dto),
  },
};

export function changeoverTag(area: string, command: string): string {
  return `${CHANGEOVER_WRITE_PREFIX}.${area}.${command}`;
}

/** Split `mes.changeover.<area>.<command>`; rejects unknown areas/commands. */
export function parseChangeoverTag(tagPath: string): {
  area: ChangeoverArea;
  command: string;
} {
  const parts = normalizeTagPath(tagPath).split(".");
  if (parts.length !== 4 || parts[0] !== "mes" || parts[1] !== "changeover") {
    throw new WriteRejectedError(
      "invalid_tag",
      `expected ${CHANGEOVER_WRITE_PREFIX}.<area>.<command>, got '${tagPath}'`
    );
  }
  const [, , area, command] = parts;
  if (!VALID_AREAS.includes(area as ChangeoverArea)) {
    throw new WriteRejectedError(
      "invalid_tag",
      `unknown changeover area '${area}' (valid: ${VALID_AREAS.join(", ")})`
    );
  }
  if (command === CHANGEOVER_STATE_TAG) {
    throw new WriteRejectedError(
      "invalid_tag",
      `'${tagPath}' is read-only; it is returned as the read-back of a confirmed command`
    );
  }
  if (!(command in CHANGEOVER_COMMANDS)) {
    throw new WriteRejectedError(
      "invalid_tag",
      `unknown changeover command '${command}' (valid: ${Object.keys(CHANGEOVER_COMMANDS).join(", ")})`
    );
  }
  return { area: area as ChangeoverArea, command };
}

@Injectable()
export class ChangeoverForgeWriteTarget implements ForgeWriteTarget, OnModuleInit {
  readonly prefix = CHANGEOVER_WRITE_PREFIX;

  constructor(
    private readonly changeover: ChangeoverService,
    private readonly writes: ForgeWriteService,
    @Inject(FORGE_CONFIG) private readonly config: ForgeConfig
  ) {}

  onModuleInit(): void {
    this.writes.register(this);
  }

  describe(): WriteTagDescriptor[] {
    const tags: WriteTagDescriptor[] = [];
    for (const area of VALID_AREAS) {
      for (const [command, spec] of Object.entries(CHANGEOVER_COMMANDS)) {
        tags.push({
          tag_path: changeoverTag(area, command),
          data_type: "object",
          description: spec.description,
          metadata: {
            area,
            command,
            payload: spec.dto.name,
            accepted_states: spec.acceptedStates,
            rest: `POST /api/changeover/${area}/${command}`,
          },
        });
      }
      tags.push({
        tag_path: changeoverTag(area, CHANGEOVER_STATE_TAG),
        data_type: "object",
        description: "Area changeover state (read-only; read-back of confirmed commands)",
        metadata: { area, readback: true },
      });
    }
    return tags;
  }

  async write(
    tagPath: string,
    value: unknown,
    ctx: WriteContext
  ): Promise<SpokeWriteResult> {
    const { area, command } = parseChangeoverTag(tagPath);
    const spec = CHANGEOVER_COMMANDS[command];
    const dto = this.validatePayload(spec, value, tagPath);

    let result: TransitionResult;
    try {
      result = await spec.run(this.changeover, area, dto);
    } catch (err) {
      if (err instanceof ConflictException) {
        throw new WriteRejectedError("conflict", err.message);
      }
      if (err instanceof NotFoundException) {
        throw new WriteRejectedError("not_found", err.message);
      }
      if (err instanceof BadRequestException) {
        throw new WriteRejectedError("invalid_state", err.message);
      }
      throw err;
    }

    const message =
      `${area}: ${result.previousState} -> ${result.currentState}` +
      (result.message ? ` (${result.message})` : "");
    return {
      success: result.success,
      message,
      ...(ctx.confirm ? { readback: this.stateRecord(area, command, result, ctx) } : {}),
    };
  }

  private validatePayload<D extends object>(
    spec: CommandSpec<D>,
    value: unknown,
    tagPath: string
  ): D {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new WriteRejectedError(
        "invalid_payload",
        `'${tagPath}' takes a JSON object (${spec.dto.name}), got ${
          value === null ? "null" : Array.isArray(value) ? "array" : typeof value
        }`
      );
    }
    const dto = plainToInstance(spec.dto, value);
    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      const detail = errors
        .map(
          (e) =>
            Object.values(e.constraints ?? {}).join("; ") || `${e.property} is invalid`
        )
        .join("; ");
      throw new WriteRejectedError("invalid_payload", `${spec.dto.name}: ${detail}`);
    }
    return dto;
  }

  /** The area state after the transition, as a ContextualRecord on the state tag. */
  private stateRecord(
    area: ChangeoverArea,
    command: string,
    result: TransitionResult,
    ctx: WriteContext
  ): ContextualRecordMessage {
    const state = this.changeover.getAreaState(area);
    const now = new Date();
    const record = mapDomainEventToRecord(
      {
        entityType: "Changeover",
        eventType: command,
        data: {
          id: `${area}-changeover`,
          ...state,
          transition: result,
          eventTimestamp: state.updatedAt || now.toISOString(),
          scheduleOrderId: state.activeSOId ?? undefined,
        },
        context: {
          area: this.config.area,
          assetId: state.assetId ?? undefined,
          scheduleOrderId: state.activeSOId ?? undefined,
        },
      },
      {
        adapterId: this.config.adapterId,
        adapterVersion: FORGE_MES_MANIFEST.version,
        site: this.config.site,
        area: this.config.area,
        now,
      }
    );
    record.source.tag_path = changeoverTag(area, CHANGEOVER_STATE_TAG);
    // Command names carry hyphens, which the event-type normaliser leaves
    // alone; name the event explicitly so it sorts with the other
    // "changeover.*" events the OT module subscribes to.
    record.context.extra.event_type = `changeover.${command}`;
    record.context.extra.changeover_area = area;
    record.context.extra.changeover_state = state.state;
    record.context.extra.write_command = command;
    record.context.extra.write_requested_by = ctx.requestedBy;
    record.lineage.transformation_chain = [
      ...record.lineage.transformation_chain,
      "forge-mes-backend:write-readback",
    ];
    return record;
  }
}
