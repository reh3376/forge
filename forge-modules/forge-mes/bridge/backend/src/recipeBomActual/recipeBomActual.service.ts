import { Injectable, Inject, forwardRef } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RecipeBomActualServiceBase } from "./base/recipeBomActual.service.base";
import { ScheduleOrderRecipeInstanceService } from "../scheduleOrderRecipeInstance/scheduleOrderRecipeInstance.service";
import { AuditService } from "../audit/audit.service";
import {
  LotLookupResult,
  LotLookupType,
  RecordBomConsumptionInput,
  UpdateBomConsumptionInput,
} from "./dto/bom-consumption.dto";
import { AuditAction, RecipeBomActual } from "@prisma/client";

@Injectable()
export class RecipeBomActualService extends RecipeBomActualServiceBase {
  constructor(
    protected readonly prisma: PrismaService,
    @Inject(forwardRef(() => ScheduleOrderRecipeInstanceService))
    private readonly scheduleOrderRecipeInstanceService: ScheduleOrderRecipeInstanceService,
    private readonly auditService: AuditService
  ) {
    super(prisma);
  }

  /**
   * Lookup inventory by scanned code (UUID or lot number) for a given item.
   * Returns FIFO recommendation when multiple lots exist.
   */
  async lookupLotOrInventory(
    code: string,
    itemId: string
  ): Promise<LotLookupResult> {
    // 1. Try UUID direct lookup
    const isUuid =
      /^[a-z0-9]{25}$/.test(code) || // cuid
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        code
      ); // uuid v4

    if (isUuid) {
      const inventory = await this.prisma.inventory.findUnique({
        where: { id: code },
        include: { item: true, asset: true },
      });

      if (inventory && inventory.itemId === itemId) {
        const hasQuantity = (inventory.currentQuantity ?? 0) > 0;
        const isRecommended = hasQuantity
          ? await this.isFifoFirst(inventory)
          : false;
        return {
          type: LotLookupType.INVENTORY_ID,
          inventoryId: inventory.id,
          lotNumber: inventory.lotNumber ?? undefined,
          itemName: inventory.item?.itemName ?? undefined,
          assetName: inventory.asset?.name ?? undefined,
          currentQuantity: inventory.currentQuantity ?? undefined,
          quantityUnit: inventory.units ?? undefined,
          fifoIndex: inventory.fifoIndex ?? undefined,
          isRecommended,
          availableQuantity: inventory.currentQuantity ?? undefined,
        };
      }
    }

    // 2. Fallback: search by lot number for the given item
    const inventories = await this.prisma.inventory.findMany({
      where: {
        lotNumber: code,
        itemId,
        currentQuantity: { gt: 0 },
      },
      orderBy: { fifoIndex: "asc" },
      include: { item: true, asset: true },
    });

    if (inventories.length > 0) {
      const first = inventories[0];
      const isRecommended = await this.isFifoFirst(first);
      return {
        type: LotLookupType.SUPPLIER_LOT,
        inventoryId: first.id,
        lotNumber: first.lotNumber ?? undefined,
        itemName: first.item?.itemName ?? undefined,
        assetName: first.asset?.name ?? undefined,
        currentQuantity: first.currentQuantity ?? undefined,
        quantityUnit: first.units ?? undefined,
        fifoIndex: first.fifoIndex ?? undefined,
        isRecommended,
        availableQuantity: first.currentQuantity ?? undefined,
      };
    }

    // 3. Not found
    return {
      type: LotLookupType.NOT_FOUND,
      isRecommended: false,
    };
  }

  /**
   * Check if this inventory record is the FIFO-first (oldest) for its item+asset.
   */
  private async isFifoFirst(inventory: {
    id: string;
    itemId: string;
    assetId: string;
  }): Promise<boolean> {
    const first = await this.prisma.inventory.findFirst({
      where: {
        itemId: inventory.itemId,
        assetId: inventory.assetId,
        currentQuantity: { gt: 0 },
      },
      orderBy: { fifoIndex: "asc" },
      select: { id: true },
    });

    return first?.id === inventory.id;
  }

  /**
   * Record a BOM consumption entry with validation.
   * Delegates to ScheduleOrderRecipeInstanceService.recordBomActual() for
   * core record creation + production event logging.
   */
  async recordBomConsumption(
    input: RecordBomConsumptionInput
  ): Promise<RecipeBomActual> {
    // Validate recipeBomItem exists
    const bomItem = await this.prisma.recipeBomItem.findUnique({
      where: { id: input.recipeBomItemId },
    });
    if (!bomItem) {
      throw new Error(`RecipeBomItem ${input.recipeBomItemId} not found`);
    }

    // Validate scheduleOrderRecipeInstance exists
    const instance = await this.prisma.scheduleOrderRecipeInstance.findUnique({
      where: { id: input.scheduleOrderRecipeInstanceId },
    });
    if (!instance) {
      throw new Error(
        `ScheduleOrderRecipeInstance ${input.scheduleOrderRecipeInstanceId} not found`
      );
    }

    // Delegate to existing recordBomActual which handles creation + event logging
    const actual =
      await this.scheduleOrderRecipeInstanceService.recordBomActual(
        input.scheduleOrderRecipeInstanceId,
        {
          recipeBomItemId: input.recipeBomItemId,
          quantityActual: input.quantityActual,
          quantityPlanned: input.quantityPlanned,
          lotNumber: input.lotNumber,
          inventoryId: input.inventoryId,
          consumedAt: input.consumedAt,
          createdBy: input.createdBy,
        }
      );

    // If notes provided, update the record (recordBomActual doesn't handle notes)
    if (input.notes) {
      return this.prisma.recipeBomActual.update({
        where: { id: actual.id },
        data: { notes: input.notes },
      });
    }

    return actual;
  }

  /**
   * Update an existing BOM consumption record.
   */
  async updateBomConsumption(
    id: string,
    input: UpdateBomConsumptionInput
  ): Promise<RecipeBomActual> {
    const existing = await this.prisma.recipeBomActual.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new Error(`RecipeBomActual ${id} not found`);
    }

    const updated = await this.prisma.recipeBomActual.update({
      where: { id },
      data: {
        ...(input.quantityActual !== undefined && {
          quantityActual: input.quantityActual,
        }),
        ...(input.lotNumber !== undefined && {
          lotNumber: input.lotNumber,
        }),
        ...(input.inventoryId !== undefined && {
          inventoryId: input.inventoryId,
        }),
        ...(input.consumedAt !== undefined && {
          consumedAt: input.consumedAt,
        }),
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(input.updatedBy !== undefined && {
          updatedBy: input.updatedBy,
        }),
      },
    });

    await this.auditService.logChange({
      entityType: "RecipeBomActual",
      entityId: id,
      action: AuditAction.UPDATE,
      oldValues: {
        quantityActual: existing.quantityActual,
        lotNumber: existing.lotNumber,
        inventoryId: existing.inventoryId,
        notes: existing.notes,
      },
      newValues: {
        quantityActual: updated.quantityActual,
        lotNumber: updated.lotNumber,
        inventoryId: updated.inventoryId,
        notes: updated.notes,
      },
      userId: input.updatedBy || undefined,
    });

    return updated;
  }
}
