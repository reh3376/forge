import {
  Injectable,
  BadRequestException,
  ConflictException,
  Inject,
  Logger,
  OnModuleInit,
} from "@nestjs/common";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import {
  AuditAction,
  EnumChangeoverState,
  EnumEquipmentOperationalState,
  EnumStateTransitionTrigger,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ScheduleOrderService } from "../scheduleOrder/scheduleOrder.service";
import { ScheduleOrderQueueService } from "../scheduleOrderQueue/scheduleOrderQueue.service";
import { ScheduleOrderRecipeInstanceService } from "../scheduleOrderRecipeInstance/scheduleOrderRecipeInstance.service";
import { MqttService } from "../providers/mqtt/mqtt.service";
import { AuditService } from "../audit/audit.service";
import {
  ChangeoverState,
  ChangeoverArea,
  AreaChangeoverState,
  TransitionResult,
  VALID_TRANSITIONS,
  CHANGEOVER_TOPICS,
  RECIPE_TOPICS,
  MQTT_BASE_PATH,
  VALID_AREAS,
  CHANGEOVER_TO_EQUIPMENT_STATE,
} from "./changeover.types";
import {
  ChangeoverRequestDto,
  CipCompleteDto,
  RecipeLoadedDto,
  StartProductionDto,
  ResetErrorDto,
} from "./dto/changeover.dto";

/**
 * Map between our app-level ChangeoverState enum and the Prisma EnumChangeoverState.
 * They have identical values so this is a direct cast, but we keep the mapping
 * explicit to avoid coupling the domain types file to Prisma.
 */
function toPrismaState(state: ChangeoverState): EnumChangeoverState {
  return state as unknown as EnumChangeoverState;
}

function fromPrismaState(state: EnumChangeoverState): ChangeoverState {
  return state as unknown as ChangeoverState;
}

@Injectable()
export class ChangeoverService implements OnModuleInit {
  /** In-memory cache — always kept in sync with DB writes. */
  private areaStates = new Map<ChangeoverArea, AreaChangeoverState>();

  /** Per-area mutex to serialize state transitions and prevent race conditions. */
  private areaLocks = new Map<ChangeoverArea, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduleOrderService: ScheduleOrderService,
    private readonly scheduleOrderQueueService: ScheduleOrderQueueService,
    private readonly scheduleOrderRecipeInstanceService: ScheduleOrderRecipeInstanceService,
    private readonly mqttService: MqttService,
    private readonly auditService: AuditService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger
  ) {}

  async onModuleInit() {
    for (const area of VALID_AREAS) {
      // Upsert: load existing row or create default PRODUCTION row
      const row = await this.prisma.changeoverAreaState.upsert({
        where: { area },
        update: {}, // no-op on existing rows — just load them
        create: {
          area,
          state: EnumChangeoverState.PRODUCTION,
          activeSOId: null,
          nextSOId: null,
          error: null,
          metadata: {},
        },
      });

      this.areaStates.set(area, {
        state: fromPrismaState(row.state),
        area: area,
        activeSOId: row.activeSOId,
        nextSOId: row.nextSOId,
        assetId: row.assetId,
        error: row.error,
        enteredAt: row.enteredAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        metadata: (row.metadata as Record<string, unknown>) ?? {},
      });
    }

    // Hydrate PRODUCTION areas with current queue data so the UI shows
    // the active/next SO even if no changeover has been triggered yet.
    await this.hydrateProductionAreas();

    this.logger.log(
      "Changeover state loaded from DB: " +
        VALID_AREAS.map(
          (a) =>
            `${a}=${this.areaStates.get(a)!.state}` +
            (this.areaStates.get(a)!.activeSOId
              ? ` (active=${this.areaStates.get(a)!.activeSOId})`
              : "")
        ).join(", ")
    );
  }

  /**
   * Hydrate the cooker area with current queue data on startup.
   *
   * Only the cooker maps 1:1 to the global queue (index 0 = active,
   * index 1 = next).  Fermentation and barreling are parallel — multiple
   * SOs run concurrently across different equipment — so they need the
   * per-asset model (future work) and should NOT be hydrated from the
   * global queue.
   */
  private async hydrateProductionAreas(): Promise<void> {
    const cookerState = this.areaStates.get("cooker" as ChangeoverArea);
    if (
      !cookerState ||
      cookerState.state !== ChangeoverState.PRODUCTION ||
      cookerState.activeSOId
    ) {
      return; // already hydrated or not in PRODUCTION
    }

    const activeSO = await this.getActiveSO();
    const nextSO = await this.getNextSO();

    const activeSOId = activeSO?.scheduleOrder?.id || null;
    const nextSOId = nextSO?.scheduleOrder?.id || null;

    if (!activeSOId) return; // nothing running

    cookerState.activeSOId = activeSOId;
    cookerState.nextSOId = nextSOId;

    await this.prisma.changeoverAreaState.update({
      where: { area: "cooker" },
      data: { activeSOId, nextSOId },
    });

    this.logger.log(
      `[cooker] Hydrated PRODUCTION state: activeSOId=${activeSOId}, nextSOId=${nextSOId}`
    );
  }

  // ─── Public Endpoint Methods ───────────────────────────────────────

  async requestChangeover(
    area: ChangeoverArea,
    dto: ChangeoverRequestDto
  ): Promise<TransitionResult> {
    return this.withAreaLock(area, async () => {
      await this.assertState(
        area,
        [ChangeoverState.PRODUCTION, ChangeoverState.COOK_COMPLETE],
        "requestChangeover"
      );

      const activeSO = await this.getActiveSO();
      if (!activeSO) {
        throw new BadRequestException("No active schedule order in queue");
      }

      const nextSO = await this.getNextSO();
      if (!nextSO) {
        throw new BadRequestException(
          "No next schedule order in queue at index 1"
        );
      }

      const activeSOId = activeSO.scheduleOrder?.id;
      const nextSOId = nextSO.scheduleOrder?.id;

      if (!activeSOId) {
        throw new BadRequestException(
          "Active queue entry has no linked schedule order"
        );
      }
      if (!nextSOId) {
        throw new BadRequestException(
          "Next queue entry has no linked schedule order"
        );
      }

      if (!dto.force) {
        const so = await this.prisma.scheduleOrder.findUnique({
          where: { id: activeSOId },
          select: { executedCooks: true, totalCooks: true },
        });
        if (so && (so.executedCooks || 0) < (so.totalCooks || 0)) {
          throw new BadRequestException(
            `Active SO has ${so.executedCooks}/${so.totalCooks} cooks complete. ` +
              `Use force=true to override.`
          );
        }
      }

      const metadata = {
        requestedBy: dto.requestedBy,
        reason: dto.reason,
        force: dto.force,
      };

      const result = await this.transitionState(
        area,
        ChangeoverState.AWAITING_CHANGEOVER,
        dto.requestedBy,
        { activeSOId, nextSOId, metadata }
      );

      const auditLog = await this.auditService.logChange({
        entityType: "Changeover",
        entityId: `${area}-changeover`,
        action: AuditAction.UPDATE,
        oldValues: { state: result.previousState },
        newValues: {
          state: result.currentState,
          requestedBy: dto.requestedBy,
          force: dto.force,
          activeSOId,
          nextSOId,
        },
        userId: dto.requestedBy,
      });

      result.auditLogId = auditLog?.id;
      await this.publishChangeoverState(area);

      return result;
    });
  }

  async cipComplete(
    area: ChangeoverArea,
    dto: CipCompleteDto
  ): Promise<TransitionResult> {
    return this.withAreaLock(area, async () => {
      await this.assertState(
        area,
        [ChangeoverState.CIP_IN_PROGRESS, ChangeoverState.AWAITING_CHANGEOVER],
        "cipComplete"
      );

      const triggeredBy = dto.reportedBy || "system";
      const previousState = this.areaStates.get(area)!.state;

      // Transition to CIP_COMPLETE
      await this.transitionState(
        area,
        ChangeoverState.CIP_COMPLETE,
        triggeredBy,
        {
          metadata: {
            cipStartTime: dto.cipStartTime,
            cipEndTime: dto.cipEndTime,
            cipDurationSeconds: dto.cipDurationSeconds,
          },
        }
      );

      // Load next SO recipe for publishing
      const areaState = this.areaStates.get(area)!;
      if (areaState.nextSOId) {
        try {
          const recipe =
            await this.scheduleOrderRecipeInstanceService.getWithAllComponents(
              areaState.nextSOId
            );
          if (recipe) {
            await this.publishRecipe(area, recipe);
          }
        } catch (err) {
          this.logger.warn(
            `Failed to load recipe for next SO ${areaState.nextSOId}: ${err}`
          );
        }
      }

      // Auto-advance to RECIPE_LOADING
      const result = await this.transitionState(
        area,
        ChangeoverState.RECIPE_LOADING,
        triggeredBy
      );

      const auditLog = await this.auditService.logChange({
        entityType: "Changeover",
        entityId: `${area}-changeover`,
        action: AuditAction.UPDATE,
        oldValues: { state: previousState },
        newValues: {
          state: result.currentState,
          cipStartTime: dto.cipStartTime,
          cipEndTime: dto.cipEndTime,
          cipDurationSeconds: dto.cipDurationSeconds,
          reportedBy: triggeredBy,
        },
        userId: triggeredBy,
      });

      result.auditLogId = auditLog?.id;
      await this.publishChangeoverState(area);

      return result;
    });
  }

  async recipeLoaded(
    area: ChangeoverArea,
    dto: RecipeLoadedDto
  ): Promise<TransitionResult> {
    return this.withAreaLock(area, async () => {
      await this.assertState(
        area,
        [ChangeoverState.RECIPE_LOADING, ChangeoverState.CIP_COMPLETE],
        "recipeLoaded"
      );

      const triggeredBy = dto.loadedBy || "system";

      const nextSO = await this.getNextSO();
      const nextSOId = nextSO?.scheduleOrder?.id;
      if (!nextSO || !nextSOId) {
        throw new BadRequestException(
          "No next schedule order in queue at index 1"
        );
      }

      try {
        await this.scheduleOrderService.recordRecipeLoadedToPLC({
          scheduleOrderId: nextSOId,
          scheduleOrderRecipeInstanceId: dto.scheduleOrderRecipeInstanceId,
          cookerNumber: dto.cookerNumber,
          sourceUpdatedAt: dto.sourceUpdatedAt,
          loadedBy: dto.loadedBy,
        });
      } catch (err: any) {
        if (
          err?.message?.includes("not found") ||
          err?.message?.includes("mismatch")
        ) {
          throw new ConflictException(err.message);
        }
        throw err;
      }

      const metadata = {
        recipeInstanceId: dto.scheduleOrderRecipeInstanceId,
        cookerNumber: dto.cookerNumber,
      };

      // Auto-advance: RECIPE_LOADING → RECIPE_LOADED → READY_TO_START
      await this.transitionState(
        area,
        ChangeoverState.RECIPE_LOADED,
        triggeredBy,
        { metadata }
      );
      const result = await this.transitionState(
        area,
        ChangeoverState.READY_TO_START,
        triggeredBy
      );

      const auditLog = await this.auditService.logChange({
        entityType: "Changeover",
        entityId: `${area}-changeover`,
        action: AuditAction.UPDATE,
        oldValues: { state: ChangeoverState.RECIPE_LOADING },
        newValues: {
          state: result.currentState,
          recipeInstanceId: dto.scheduleOrderRecipeInstanceId,
          cookerNumber: dto.cookerNumber,
          loadedBy: triggeredBy,
        },
        userId: triggeredBy,
      });

      result.auditLogId = auditLog?.id;
      await this.publishChangeoverState(area);

      return result;
    });
  }

  async startProduction(
    area: ChangeoverArea,
    dto: StartProductionDto
  ): Promise<TransitionResult> {
    return this.withAreaLock(area, async () => {
      await this.assertState(
        area,
        [ChangeoverState.READY_TO_START],
        "startProduction"
      );

      const advanceResult =
        await this.scheduleOrderService.advanceScheduleOrderQueue({
          advancedBy: dto.startedBy,
          notes: dto.notes,
        });

      if (!advanceResult.success) {
        throw new BadRequestException(
          `Queue advance failed: ${advanceResult.message}`
        );
      }

      // Derive nextSOId from the queue after advance (advanceResult doesn't populate it)
      const nextAfterAdvance = await this.getNextSO();
      const nextSOId = nextAfterAdvance?.scheduleOrder?.id || null;

      const result = await this.transitionState(
        area,
        ChangeoverState.PRODUCTION,
        dto.startedBy,
        {
          activeSOId: advanceResult.newActiveSOId || null,
          nextSOId,
          metadata: {
            startedBy: dto.startedBy,
            previousSOId: advanceResult.previousSOId,
          },
        }
      );

      const auditLog = await this.auditService.logChange({
        entityType: "Changeover",
        entityId: `${area}-changeover`,
        action: AuditAction.UPDATE,
        oldValues: { state: ChangeoverState.READY_TO_START },
        newValues: {
          state: result.currentState,
          startedBy: dto.startedBy,
          newActiveSOId: advanceResult.newActiveSOId,
          previousSOId: advanceResult.previousSOId,
        },
        userId: dto.startedBy,
      });

      result.auditLogId = auditLog?.id;
      await this.publishChangeoverState(area);
      await this.publishQueueState(area);

      return result;
    });
  }

  async getNextRecipe(area: ChangeoverArea): Promise<any> {
    const nextSO = await this.getNextSO();
    const nextSOId = nextSO?.scheduleOrder?.id;
    if (!nextSO || !nextSOId) {
      return { message: "No next schedule order in queue", recipe: null };
    }

    const recipe =
      await this.scheduleOrderRecipeInstanceService.getWithAllComponents(
        nextSOId
      );

    if (!recipe) {
      return {
        message: `No recipe instance found for SO ${nextSOId}`,
        recipe: null,
      };
    }

    return {
      scheduleOrderId: nextSOId,
      scheduleOrderName: nextSO.scheduleOrder?.name,
      recipeInstanceId: recipe.id,
      updatedAt: recipe.updatedAt?.toISOString(),
      recipe: {
        id: recipe.recipe?.id,
        name: recipe.recipe?.Recipe,
        revision: recipe.recipe?.revision,
      },
      recipeBoms: recipe.recipeBoms?.map((bom: any) => ({
        id: bom.id,
        items: bom.recipeBomITem?.map((item: any) => ({
          id: item.id,
          itemId: item.item?.id,
          itemName: item.item?.itemName,
          quantity: item.quantity,
          units: item.displayUnits?.name,
        })),
      })),
      mashingProtocols: recipe.mashingProtocols?.map((protocol: any) => ({
        id: protocol.id,
        steps: protocol.steps?.map((step: any) => ({
          id: step.id,
          index: step.index,
          itemName: step.recipeBomItem?.item?.itemName,
          quantity: step.recipeBomItem?.quantity,
        })),
      })),
      recipeParameters: recipe.recipeParameters?.map((param: any) => ({
        id: param.id,
        name: param.masterRecipeParameter?.recipeParamName,
        value: param.recipeNumericalSetpoint,
        units: param.units?.name,
      })),
    };
  }

  async resetError(
    area: ChangeoverArea,
    dto: ResetErrorDto
  ): Promise<TransitionResult> {
    return this.withAreaLock(area, async () => {
      await this.assertState(area, [ChangeoverState.ERROR], "resetError");

      const allowedTargets = [
        ChangeoverState.AWAITING_CHANGEOVER,
        ChangeoverState.CIP_COMPLETE,
      ];
      if (!allowedTargets.includes(dto.targetState)) {
        throw new BadRequestException(
          `Cannot reset to ${dto.targetState}. Allowed: ${allowedTargets.join(
            ", "
          )}`
        );
      }

      const result = await this.transitionState(
        area,
        dto.targetState,
        dto.resetBy,
        {
          error: null,
          metadata: { resetBy: dto.resetBy, resetReason: dto.reason },
        }
      );

      const auditLog = await this.auditService.logChange({
        entityType: "Changeover",
        entityId: `${area}-changeover`,
        action: AuditAction.UPDATE,
        oldValues: { state: ChangeoverState.ERROR },
        newValues: {
          state: result.currentState,
          resetBy: dto.resetBy,
          reason: dto.reason,
        },
        userId: dto.resetBy,
      });

      result.auditLogId = auditLog?.id;
      await this.publishChangeoverState(area);

      return result;
    });
  }

  getAreaState(area: ChangeoverArea): AreaChangeoverState {
    const state = this.areaStates.get(area);
    if (!state) {
      throw new BadRequestException(`Unknown area: ${area}`);
    }
    return { ...state };
  }

  // ─── Concurrency Control ─────────────────────────────────────────

  /**
   * Serialize all state-mutating operations for a given area.
   * Prevents race conditions where concurrent requests both pass assertState
   * before either writes.
   */
  private async withAreaLock<T>(
    area: ChangeoverArea,
    fn: () => Promise<T>
  ): Promise<T> {
    const previous = this.areaLocks.get(area) ?? Promise.resolve();
    let resolve: () => void;
    const next = new Promise<void>((r) => (resolve = r));
    this.areaLocks.set(area, next);

    try {
      await previous;
      return await fn();
    } finally {
      resolve!();
    }
  }

  // ─── State Machine Helpers ─────────────────────────────────────────

  private async transitionState(
    area: ChangeoverArea,
    target: ChangeoverState,
    triggeredBy: string,
    updates?: {
      activeSOId?: string | null;
      nextSOId?: string | null;
      error?: string | null;
      metadata?: Record<string, unknown>;
    }
  ): Promise<TransitionResult> {
    const areaState = this.areaStates.get(area)!;
    const previous = areaState.state;

    const allowed = VALID_TRANSITIONS[previous] || [];
    if (!allowed.includes(target)) {
      throw new BadRequestException(
        `Invalid transition: ${previous} → ${target} for area ${area}. ` +
          `Allowed from ${previous}: [${allowed.join(", ")}]`
      );
    }

    const now = new Date();
    const mergedMetadata = updates?.metadata
      ? { ...(areaState.metadata ?? {}), ...updates.metadata }
      : areaState.metadata;

    // Persist to DB
    const row = await this.prisma.changeoverAreaState.update({
      where: { area },
      data: {
        state: toPrismaState(target),
        enteredAt: now,
        ...(updates?.activeSOId !== undefined && {
          activeSOId: updates.activeSOId,
        }),
        ...(updates?.nextSOId !== undefined && {
          nextSOId: updates.nextSOId,
        }),
        ...(updates?.error !== undefined && { error: updates.error }),
        metadata: mergedMetadata as Prisma.InputJsonValue,
      },
    });

    // Update in-memory cache
    areaState.state = target;
    areaState.enteredAt = row.enteredAt.toISOString();
    areaState.updatedAt = row.updatedAt.toISOString();
    if (updates?.activeSOId !== undefined)
      areaState.activeSOId = updates.activeSOId;
    if (updates?.nextSOId !== undefined) areaState.nextSOId = updates.nextSOId;
    if (updates?.error !== undefined) areaState.error = updates.error;
    areaState.metadata = mergedMetadata as Record<string, unknown>;

    this.logger.log(
      `[${area}] State transition: ${previous} → ${target} by ${triggeredBy}`
    );

    // Update equipment operational state if an asset is linked to this area
    await this.updateEquipmentOperationalState(
      area,
      previous,
      target,
      triggeredBy
    );

    return {
      success: true,
      previousState: previous,
      currentState: target,
      area,
      message: `Transitioned from ${previous} to ${target}`,
    };
  }

  async transitionToError(
    area: ChangeoverArea,
    errorMessage: string,
    triggeredBy: string
  ): Promise<TransitionResult> {
    const areaState = this.areaStates.get(area)!;
    const previous = areaState.state;
    const now = new Date();

    // Persist to DB — ERROR is always reachable, no transition validation
    const row = await this.prisma.changeoverAreaState.update({
      where: { area },
      data: {
        state: EnumChangeoverState.ERROR,
        error: errorMessage,
        enteredAt: now,
      },
    });

    // Update cache
    areaState.state = ChangeoverState.ERROR;
    areaState.error = errorMessage;
    areaState.enteredAt = row.enteredAt.toISOString();
    areaState.updatedAt = row.updatedAt.toISOString();

    this.logger.error(
      `[${area}] ERROR transition from ${previous}: ${errorMessage} (by ${triggeredBy})`
    );

    await this.auditService.logChange({
      entityType: "Changeover",
      entityId: `${area}-changeover`,
      action: AuditAction.UPDATE,
      oldValues: { state: previous },
      newValues: {
        state: ChangeoverState.ERROR,
        error: errorMessage,
        triggeredBy,
      },
      userId: triggeredBy,
    });

    return {
      success: true,
      previousState: previous,
      currentState: ChangeoverState.ERROR,
      area,
      message: errorMessage,
    };
  }

  private async assertState(
    area: ChangeoverArea,
    expected: ChangeoverState[],
    operation: string
  ) {
    const current = await this.getStateFromDb(area);
    if (!expected.includes(current)) {
      throw new BadRequestException(
        `Operation '${operation}' requires state [${expected.join(", ")}] ` +
          `but area '${area}' is in state '${current}'`
      );
    }
  }

  /**
   * Read state from DB (authoritative) and refresh the cache.
   */
  private async getStateFromDb(area: ChangeoverArea): Promise<ChangeoverState> {
    const row = await this.prisma.changeoverAreaState.findUnique({
      where: { area },
    });
    if (!row) {
      throw new BadRequestException(`Unknown area: ${area}`);
    }

    // Refresh cache
    const areaState = this.areaStates.get(area as ChangeoverArea);
    if (areaState) {
      areaState.state = fromPrismaState(row.state);
      areaState.activeSOId = row.activeSOId;
      areaState.nextSOId = row.nextSOId;
      areaState.assetId = row.assetId;
      areaState.error = row.error;
      areaState.enteredAt = row.enteredAt.toISOString();
      areaState.updatedAt = row.updatedAt.toISOString();
      areaState.metadata = (row.metadata as Record<string, unknown>) ?? {};
    }

    return fromPrismaState(row.state);
  }

  // ─── MQTT Publishing ──────────────────────────────────────────────

  private async publishChangeoverState(area: ChangeoverArea): Promise<void> {
    const brokerId = this.getFirstConnectedBrokerId();
    if (!brokerId) return;

    const areaState = this.areaStates.get(area)!;
    const topic = this.buildTopicPath(area, CHANGEOVER_TOPICS.STATE);

    try {
      await this.mqttService.publish(
        brokerId,
        topic,
        JSON.stringify({
          state: areaState.state,
          area: areaState.area,
          activeSOId: areaState.activeSOId,
          nextSOId: areaState.nextSOId,
          error: areaState.error,
          enteredAt: areaState.enteredAt,
          updatedAt: areaState.updatedAt,
        }),
        { retain: true }
      );
    } catch (err) {
      this.logger.warn(
        `Failed to publish changeover state for ${area}: ${err}`
      );
    }
  }

  private async publishQueueState(area: ChangeoverArea): Promise<void> {
    const brokerId = this.getFirstConnectedBrokerId();
    if (!brokerId) return;

    const areaState = this.areaStates.get(area)!;
    const queueEntries = await this.getQueueEntries();

    try {
      await this.mqttService.publish(
        brokerId,
        this.buildTopicPath(area, CHANGEOVER_TOPICS.ACTIVE_ORDER),
        JSON.stringify({ scheduleOrderId: areaState.activeSOId }),
        { retain: true }
      );

      await this.mqttService.publish(
        brokerId,
        this.buildTopicPath(area, CHANGEOVER_TOPICS.NEXT_ORDER),
        JSON.stringify({ scheduleOrderId: areaState.nextSOId }),
        { retain: true }
      );

      await this.mqttService.publish(
        brokerId,
        this.buildTopicPath(area, CHANGEOVER_TOPICS.QUEUE_STATE),
        JSON.stringify(
          queueEntries.map((q) => ({
            queueIndex: q.queueIndex,
            scheduleOrderId: q.scheduleOrder?.id,
            scheduleOrderName: q.scheduleOrder?.name,
          }))
        ),
        { retain: true }
      );

      await this.mqttService.publish(
        brokerId,
        this.buildTopicPath(area, CHANGEOVER_TOPICS.QUEUE_DEPTH),
        JSON.stringify({ depth: queueEntries.length }),
        { retain: true }
      );
    } catch (err) {
      this.logger.warn(`Failed to publish queue state for ${area}: ${err}`);
    }
  }

  private async publishRecipe(
    area: ChangeoverArea,
    recipe: any
  ): Promise<void> {
    const brokerId = this.getFirstConnectedBrokerId();
    if (!brokerId) return;

    try {
      await this.mqttService.publish(
        brokerId,
        this.buildTopicPath(area, RECIPE_TOPICS.NEXT),
        JSON.stringify(recipe),
        { retain: true }
      );

      await this.mqttService.publish(
        brokerId,
        this.buildTopicPath(area, RECIPE_TOPICS.UPDATED_AT),
        JSON.stringify({
          updatedAt:
            recipe.updatedAt?.toISOString?.() || new Date().toISOString(),
        }),
        { retain: true }
      );
    } catch (err) {
      this.logger.warn(`Failed to publish recipe for ${area}: ${err}`);
    }
  }

  private buildTopicPath(area: ChangeoverArea, subtopic: string): string {
    return `${MQTT_BASE_PATH}/${area}/${subtopic}`;
  }

  // ─── Equipment State Management ──────────────────────────────────

  /**
   * Updates the linked asset's operational state when changeover state changes.
   * Only fires if the ChangeoverAreaState has an assetId set.
   * Creates an EquipmentStateTransition audit record.
   */
  private async updateEquipmentOperationalState(
    area: ChangeoverArea,
    fromChangeoverState: ChangeoverState,
    toChangeoverState: ChangeoverState,
    triggeredBy: string
  ): Promise<void> {
    const areaState = this.areaStates.get(area);
    if (!areaState?.assetId) return;

    const targetEquipState = CHANGEOVER_TO_EQUIPMENT_STATE[toChangeoverState];
    if (!targetEquipState) return;

    const targetEnum =
      targetEquipState as unknown as EnumEquipmentOperationalState;

    try {
      // Read current asset state
      const asset = await this.prisma.asset.findUnique({
        where: { id: areaState.assetId },
        select: { operationalState: true },
      });

      if (!asset) {
        this.logger.warn(
          `[${area}] Asset ${areaState.assetId} not found for equipment state update`
        );
        return;
      }

      const fromState =
        asset.operationalState ?? EnumEquipmentOperationalState.Available;

      // Skip if already in target state
      if (fromState === targetEnum) return;

      // Update asset operational state
      await this.prisma.asset.update({
        where: { id: areaState.assetId },
        data: { operationalState: targetEnum },
      });

      // Create audit trail
      await this.prisma.equipmentStateTransition.create({
        data: {
          assetId: areaState.assetId,
          fromState,
          toState: targetEnum,
          triggerType: EnumStateTransitionTrigger.SystemAction,
          triggeredBy,
          changeoverArea: area,
          notes: `Changeover ${fromChangeoverState} → ${toChangeoverState}`,
        },
      });

      this.logger.log(
        `[${area}] Equipment state: ${fromState} → ${targetEnum} for asset ${areaState.assetId}`
      );
    } catch (err) {
      this.logger.warn(
        `[${area}] Failed to update equipment state for asset ${areaState.assetId}: ${err}`
      );
    }
  }

  /**
   * Sets the asset ID for an area's changeover state.
   * Call this to link a specific asset (e.g., Cooker 01) to an area changeover.
   */
  async setAreaAsset(
    area: ChangeoverArea,
    assetId: string | null
  ): Promise<void> {
    await this.prisma.changeoverAreaState.update({
      where: { area },
      data: { assetId },
    });

    const areaState = this.areaStates.get(area);
    if (areaState) {
      areaState.assetId = assetId;
    }
  }

  // ─── Data Access Helpers ──────────────────────────────────────────

  private async getActiveSO() {
    return this.prisma.scheduleOrderQueue.findFirst({
      where: { queueIndex: 0 },
      include: {
        scheduleOrder: {
          select: { id: true, name: true, status: true },
        },
      },
    });
  }

  private async getNextSO() {
    return this.prisma.scheduleOrderQueue.findFirst({
      where: { queueIndex: 1 },
      include: {
        scheduleOrder: {
          select: { id: true, name: true, status: true },
        },
      },
    });
  }

  private async getQueueEntries() {
    return this.prisma.scheduleOrderQueue.findMany({
      where: { queueIndex: { gte: 0 } },
      orderBy: { queueIndex: "asc" },
      include: {
        scheduleOrder: {
          select: { id: true, name: true },
        },
      },
    });
  }

  private getFirstConnectedBrokerId(): string | null {
    try {
      const brokers = this.mqttService.getConnectedBrokers();
      return brokers.length > 0 ? brokers[0] : null;
    } catch {
      return null;
    }
  }
}
