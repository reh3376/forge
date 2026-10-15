import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  SeparationEvent,
  EnumSeparationStatus,
  EnumRecipeInstanceStatus,
} from "@prisma/client";
import { ScheduleOrderRecipeInstanceService } from "../scheduleOrderRecipeInstance/scheduleOrderRecipeInstance.service";

export interface ProductionOrderSummary {
  id: string;
  name: string | null;
  quantity: number | null;
  customerId: string;
  customerName: string;
  containerType: string | null;
  finalProof: number | null;
  createdAt: Date;
}

export interface SeparationReadinessResult {
  ready: boolean;
  issues: string[];
  productionOrders: ProductionOrderSummary[];
  aggregatedActuals: {
    totalProofGallons: number;
    totalWineGallons: number;
  };
}

export interface LotAssignmentInput {
  lotId: string;
  productionOrderId: string;
  proofGallons: number;
}

export interface FifoAllocationResult {
  allocations: {
    productionOrderId: string;
    productionOrderName: string;
    fifoSequence: number;
    quantityRequested: number;
    quantityAllocated: number;
    proofGallonsAllocated: number;
    allocationComplete: boolean;
    lotIds: string[];
  }[];
  summary: {
    totalRequested: number;
    totalAllocated: number;
    totalProofGallonsAllocated: number;
  };
}

@Injectable()
export class SeparationEventService {
  private readonly logger = new Logger(SeparationEventService.name);

  constructor(
    protected readonly prisma: PrismaService,
    private readonly soInstanceService: ScheduleOrderRecipeInstanceService
  ) {}

  /**
   * Get yield values from RecipeParameterActuals (Output parameters)
   */
  private async getYieldsFromParameters(
    instanceId: string
  ): Promise<{ totalWineGallons: number; totalProofGallons: number }> {
    const parameterActuals = await this.prisma.recipeParameterActual.findMany({
      where: { scheduleOrderRecipeInstanceId: instanceId },
      include: { recipeParameter: true },
    });

    let totalWineGallons = 0;
    let totalProofGallons = 0;

    for (const actual of parameterActuals) {
      const paramName =
        actual.recipeParameter.recipeParamName?.toLowerCase() || "";
      if (
        paramName.includes("winegallons") ||
        paramName.includes("wine_gallons")
      ) {
        totalWineGallons += actual.valueActual || 0;
      } else if (
        paramName.includes("proofgallons") ||
        paramName.includes("proof_gallons")
      ) {
        totalProofGallons += actual.valueActual || 0;
      }
    }

    return { totalWineGallons, totalProofGallons };
  }

  /**
   * Validate that a schedule order is ready for separation
   */
  async validateSeparationReadiness(
    scheduleOrderId: string
  ): Promise<SeparationReadinessResult> {
    const issues: string[] = [];

    // Get schedule order with related data
    const scheduleOrder = await this.prisma.scheduleOrder.findUnique({
      where: { id: scheduleOrderId },
      include: {
        productionOrders: {
          include: { customer: true },
        },
        scheduleOrderRecipeInstance: {
          include: {
            recipeParameterActuals: {
              include: { recipeParameter: true },
            },
            separationEvent: true,
          },
        },
      },
    });

    if (!scheduleOrder) {
      return {
        ready: false,
        issues: [`Schedule order ${scheduleOrderId} not found`],
        productionOrders: [],
        aggregatedActuals: { totalProofGallons: 0, totalWineGallons: 0 },
      };
    }

    // Check if SO recipe instance exists
    if (!scheduleOrder.scheduleOrderRecipeInstance) {
      issues.push("Schedule order has no recipe instance. Create one first.");
    }

    // Check if separation already in progress
    if (scheduleOrder.scheduleOrderRecipeInstance?.separationEvent) {
      issues.push("Separation already initiated for this schedule order.");
    }

    // Get total yields from RecipeParameterActuals
    let totalPG = 0;
    let totalWG = 0;
    if (scheduleOrder.scheduleOrderRecipeInstance) {
      const yields = await this.getYieldsFromParameters(
        scheduleOrder.scheduleOrderRecipeInstance.id
      );
      totalPG = yields.totalProofGallons;
      totalWG = yields.totalWineGallons;
    }

    if (totalPG === 0) {
      issues.push("No proof gallons recorded. Record yield parameters first.");
    }

    // Get production order summaries sorted by creation date (FIFO)
    const productionOrders: ProductionOrderSummary[] =
      scheduleOrder.productionOrders
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((po) => ({
          id: po.id,
          name: po.name,
          quantity: po.quantity,
          customerId: po.customerId,
          customerName: po.customer?.name || "Unknown",
          containerType: po.containerType,
          finalProof: po.finalProof,
          createdAt: po.createdAt,
        }));

    return {
      ready: issues.length === 0,
      issues,
      productionOrders,
      aggregatedActuals: {
        totalProofGallons: totalPG,
        totalWineGallons: totalWG,
      },
    };
  }

  /**
   * Initiate separation process
   */
  async initiateSeparation(
    scheduleOrderId: string,
    userId: string
  ): Promise<SeparationEvent> {
    const readiness = await this.validateSeparationReadiness(scheduleOrderId);

    if (!readiness.ready) {
      throw new Error(
        `Cannot initiate separation: ${readiness.issues.join(", ")}`
      );
    }

    const scheduleOrder = await this.prisma.scheduleOrder.findUnique({
      where: { id: scheduleOrderId },
      include: {
        scheduleOrderRecipeInstance: true,
        productionOrders: true,
      },
    });

    if (!scheduleOrder?.scheduleOrderRecipeInstance) {
      throw new Error("Schedule order recipe instance not found");
    }

    // Calculate expected barrels based on proof gallons
    // Typical barrel is ~53 gallons at ~125 proof = ~66.25 PG per barrel
    const expectedBarrels = Math.ceil(
      readiness.aggregatedActuals.totalProofGallons / 66.25
    );

    // Create separation event
    const separationEvent = await this.prisma.separationEvent.create({
      data: {
        scheduleOrderRecipeInstance: {
          connect: { id: scheduleOrder.scheduleOrderRecipeInstance.id },
        },
        status: EnumSeparationStatus.Initiated,
        totalProofGallonsAvailable:
          readiness.aggregatedActuals.totalProofGallons,
        totalWineGallonsAvailable: readiness.aggregatedActuals.totalWineGallons,
        totalBarrelsExpected: expectedBarrels,
        initiatedBy: userId,
        createdBy: userId,
      },
    });

    // Create FIFO allocations for each production order
    const sortedPOs = scheduleOrder.productionOrders.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );

    for (let i = 0; i < sortedPOs.length; i++) {
      const po = sortedPOs[i];
      await this.prisma.fifoAllocation.create({
        data: {
          separationEvent: { connect: { id: separationEvent.id } },
          productionOrder: { connect: { id: po.id } },
          fifoSequence: i + 1,
          quantityRequested: po.quantity || 0,
          quantityAllocated: 0,
          allocationComplete: false,
          createdBy: userId,
        },
      });
    }

    // Update instance status
    await this.prisma.scheduleOrderRecipeInstance.update({
      where: { id: scheduleOrder.scheduleOrderRecipeInstance.id },
      data: {
        status: EnumRecipeInstanceStatus.InSeparation,
        separationStarted: true,
      },
    });

    this.logger.log(
      `Initiated separation for SO ${scheduleOrderId}, created ${sortedPOs.length} FIFO allocations`
    );

    return separationEvent;
  }

  /**
   * Execute FIFO allocation - assign lots to production orders
   */
  async executeFifoAllocation(
    separationEventId: string,
    lotAssignments: LotAssignmentInput[]
  ): Promise<FifoAllocationResult> {
    const separationEvent = await this.prisma.separationEvent.findUnique({
      where: { id: separationEventId },
      include: {
        fifoAllocations: {
          include: {
            productionOrder: true,
          },
          orderBy: { fifoSequence: "asc" },
        },
      },
    });

    if (!separationEvent) {
      throw new Error(`Separation event ${separationEventId} not found`);
    }

    // Group lot assignments by production order
    const lotsByPO = new Map<
      string,
      { lotId: string; proofGallons: number }[]
    >();
    for (const assignment of lotAssignments) {
      const existing = lotsByPO.get(assignment.productionOrderId) || [];
      existing.push({
        lotId: assignment.lotId,
        proofGallons: assignment.proofGallons,
      });
      lotsByPO.set(assignment.productionOrderId, existing);
    }

    const allocationResults: FifoAllocationResult["allocations"] = [];
    let totalAllocated = 0;
    let totalPGAllocated = 0;

    return await this.prisma.$transaction(async (prisma) => {
      // Update each FIFO allocation and assign lots
      for (const allocation of separationEvent.fifoAllocations) {
        const lotsForPO = lotsByPO.get(allocation.productionOrderId) || [];
        const quantityAllocated = lotsForPO.length;
        const proofGallonsAllocated = lotsForPO.reduce(
          (sum, l) => sum + l.proofGallons,
          0
        );

        // Assign lots to this allocation
        for (const lot of lotsForPO) {
          await prisma.lot.update({
            where: { id: lot.lotId },
            data: {
              fifoAllocation: { connect: { id: allocation.id } },
              productionOrder: {
                connect: { id: allocation.productionOrderId },
              },
              sourceScheduleOrderId:
                separationEvent.scheduleOrderRecipeInstanceId,
            },
          });
        }

        // Update allocation
        await prisma.fifoAllocation.update({
          where: { id: allocation.id },
          data: {
            quantityAllocated,
            proofGallonsAllocated,
            allocationComplete:
              quantityAllocated >= allocation.quantityRequested,
            allocatedAt: new Date(),
          },
        });

        allocationResults.push({
          productionOrderId: allocation.productionOrderId,
          productionOrderName: allocation.productionOrder.name || "Unknown",
          fifoSequence: allocation.fifoSequence,
          quantityRequested: allocation.quantityRequested,
          quantityAllocated,
          proofGallonsAllocated,
          allocationComplete: quantityAllocated >= allocation.quantityRequested,
          lotIds: lotsForPO.map((l) => l.lotId),
        });

        totalAllocated += quantityAllocated;
        totalPGAllocated += proofGallonsAllocated;
      }

      // Update separation event status
      await prisma.separationEvent.update({
        where: { id: separationEventId },
        data: {
          status: EnumSeparationStatus.InProgress,
          totalBarrelsActual: totalAllocated,
        },
      });

      return {
        allocations: allocationResults,
        summary: {
          totalRequested: separationEvent.fifoAllocations.reduce(
            (sum, a) => sum + a.quantityRequested,
            0
          ),
          totalAllocated,
          totalProofGallonsAllocated: totalPGAllocated,
        },
      };
    });
  }

  /**
   * Complete the separation process
   */
  async completeSeparation(
    separationEventId: string,
    userId: string
  ): Promise<SeparationEvent> {
    const separationEvent = await this.prisma.separationEvent.findUnique({
      where: { id: separationEventId },
      include: {
        scheduleOrderRecipeInstance: true,
        fifoAllocations: true,
      },
    });

    if (!separationEvent) {
      throw new Error(`Separation event ${separationEventId} not found`);
    }

    // Mark separation as complete
    const updated = await this.prisma.separationEvent.update({
      where: { id: separationEventId },
      data: {
        status: EnumSeparationStatus.Completed,
        completedAt: new Date(),
        completedBy: userId,
      },
    });

    // Mark instance as completed
    await this.prisma.scheduleOrderRecipeInstance.update({
      where: { id: separationEvent.scheduleOrderRecipeInstanceId },
      data: {
        status: EnumRecipeInstanceStatus.Completed,
        separationCompletedAt: new Date(),
      },
    });

    this.logger.log(`Completed separation for event ${separationEventId}`);

    return updated;
  }

  /**
   * Get separation event by ID
   */
  async findById(id: string) {
    return this.prisma.separationEvent.findUnique({
      where: { id },
      include: {
        fifoAllocations: {
          include: {
            productionOrder: { include: { customer: true } },
            lots: true,
          },
          orderBy: { fifoSequence: "asc" },
        },
        scheduleOrderRecipeInstance: {
          include: {
            scheduleOrder: true,
          },
        },
      },
    });
  }

  /**
   * Find by schedule order ID
   */
  async findByScheduleOrderId(scheduleOrderId: string) {
    const so = await this.prisma.scheduleOrder.findUnique({
      where: { id: scheduleOrderId },
      include: {
        scheduleOrderRecipeInstance: {
          include: {
            separationEvent: {
              include: {
                fifoAllocations: {
                  include: {
                    productionOrder: true,
                    lots: true,
                  },
                  orderBy: { fifoSequence: "asc" },
                },
              },
            },
          },
        },
      },
    });

    return so?.scheduleOrderRecipeInstance?.separationEvent || null;
  }
}
