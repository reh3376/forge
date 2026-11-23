import { Resolver, Query, Mutation, Args, ID } from "@nestjs/graphql";
import { UseGuards } from "@nestjs/common";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import { SeparationEventService } from "./separationEvent.service";
import {
  SeparationEventType,
  SeparationReadinessResultType,
  FifoAllocationResultType,
  LotAssignmentInput,
} from "./dto/separation-event.types";

@Resolver(() => SeparationEventType)
@UseGuards(GqlDefaultAuthGuard)
export class SeparationEventResolver {
  constructor(private readonly service: SeparationEventService) {}

  @Query(() => SeparationReadinessResultType, { name: "separationReadiness" })
  async separationReadiness(
    @Args("scheduleOrderId") scheduleOrderId: string
  ): Promise<SeparationReadinessResultType> {
    const result = await this.service.validateSeparationReadiness(
      scheduleOrderId
    );
    return {
      ready: result.ready,
      issues: result.issues,
      productionOrders: result.productionOrders.map((po) => ({
        id: po.id,
        name: po.name ?? undefined,
        quantity: po.quantity ?? undefined,
        customerId: po.customerId,
        customerName: po.customerName,
        containerType: po.containerType ?? undefined,
        finalProof: po.finalProof ?? undefined,
        createdAt: po.createdAt,
      })),
      aggregatedActuals: {
        totalProofGallons: result.aggregatedActuals.totalProofGallons,
        totalWineGallons: result.aggregatedActuals.totalWineGallons,
      },
    };
  }

  @Mutation(() => SeparationEventType, { name: "initiateSeparation" })
  async initiateSeparation(
    @Args("scheduleOrderId") scheduleOrderId: string,
    @Args("userId") userId: string
  ): Promise<SeparationEventType> {
    const event = await this.service.initiateSeparation(
      scheduleOrderId,
      userId
    );
    return this.mapToType(event);
  }

  @Mutation(() => FifoAllocationResultType, { name: "executeFifoAllocation" })
  async executeFifoAllocation(
    @Args("separationEventId") separationEventId: string,
    @Args({ name: "lotAssignments", type: () => [LotAssignmentInput] })
    lotAssignments: LotAssignmentInput[]
  ): Promise<FifoAllocationResultType> {
    const result = await this.service.executeFifoAllocation(
      separationEventId,
      lotAssignments.map((l) => ({
        lotId: l.lotId,
        productionOrderId: l.productionOrderId,
        proofGallons: l.proofGallons,
      }))
    );

    return {
      allocations: result.allocations.map((a) => ({
        productionOrderId: a.productionOrderId,
        productionOrderName: a.productionOrderName,
        fifoSequence: a.fifoSequence,
        quantityRequested: a.quantityRequested,
        quantityAllocated: a.quantityAllocated,
        proofGallonsAllocated: a.proofGallonsAllocated,
        allocationComplete: a.allocationComplete,
        lotIds: a.lotIds,
      })),
      summary: {
        totalRequested: result.summary.totalRequested,
        totalAllocated: result.summary.totalAllocated,
        totalProofGallonsAllocated: result.summary.totalProofGallonsAllocated,
      },
    };
  }

  @Mutation(() => SeparationEventType, { name: "completeSeparation" })
  async completeSeparation(
    @Args("separationEventId") separationEventId: string,
    @Args("userId") userId: string
  ): Promise<SeparationEventType> {
    const event = await this.service.completeSeparation(
      separationEventId,
      userId
    );
    return this.mapToType(event);
  }

  @Query(() => SeparationEventType, { name: "separationEvent", nullable: true })
  async separationEvent(
    @Args("id", { type: () => ID }) id: string
  ): Promise<SeparationEventType | null> {
    const event = await this.service.findById(id);
    return event ? this.mapToType(event) : null;
  }

  @Query(() => SeparationEventType, {
    name: "separationEventByScheduleOrder",
    nullable: true,
  })
  async separationEventByScheduleOrder(
    @Args("scheduleOrderId") scheduleOrderId: string
  ): Promise<SeparationEventType | null> {
    const event = await this.service.findByScheduleOrderId(scheduleOrderId);
    return event ? this.mapToType(event) : null;
  }

  private mapToType(event: any): SeparationEventType {
    return {
      id: event.id,
      scheduleOrderRecipeInstanceId: event.scheduleOrderRecipeInstanceId,
      status: event.status,
      totalProofGallonsAvailable: event.totalProofGallonsAvailable || 0,
      totalWineGallonsAvailable: event.totalWineGallonsAvailable || 0,
      totalBarrelsExpected: event.totalBarrelsExpected || 0,
      totalBarrelsActual: event.totalBarrelsActual ?? undefined,
      initiatedBy: event.initiatedBy,
      completedAt: event.completedAt ?? undefined,
      completedBy: event.completedBy ?? undefined,
      createdBy: event.createdBy,
      createdAt: event.createdAt,
      fifoAllocations: event.fifoAllocations?.map((a: any) => ({
        id: a.id,
        separationEventId: a.separationEventId,
        productionOrderId: a.productionOrderId,
        fifoSequence: a.fifoSequence,
        quantityRequested: a.quantityRequested,
        quantityAllocated: a.quantityAllocated,
        proofGallonsAllocated: a.proofGallonsAllocated ?? undefined,
        allocationComplete: a.allocationComplete,
        allocatedAt: a.allocatedAt ?? undefined,
        createdBy: a.createdBy,
        createdAt: a.createdAt,
      })),
    };
  }
}
