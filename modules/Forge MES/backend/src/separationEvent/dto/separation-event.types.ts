import {
  ObjectType,
  Field,
  ID,
  Float,
  Int,
  InputType,
  registerEnumType,
} from "@nestjs/graphql";
import { EnumSeparationStatus } from "@prisma/client";

// Register the enum for GraphQL
registerEnumType(EnumSeparationStatus, {
  name: "EnumSeparationStatus",
  description: "Status of a separation event",
});

@ObjectType()
export class ProductionOrderSummaryType {
  @Field(() => ID)
  id!: string;

  @Field({ nullable: true })
  name?: string;

  @Field(() => Int, { nullable: true })
  quantity?: number;

  @Field()
  customerId!: string;

  @Field()
  customerName!: string;

  @Field({ nullable: true })
  containerType?: string;

  @Field(() => Float, { nullable: true })
  finalProof?: number;

  @Field()
  createdAt!: Date;
}

@ObjectType()
export class AggregatedActualsForSeparation {
  @Field(() => Float)
  totalProofGallons!: number;

  @Field(() => Float)
  totalWineGallons!: number;
}

@ObjectType()
export class SeparationReadinessResultType {
  @Field()
  ready!: boolean;

  @Field(() => [String])
  issues!: string[];

  @Field(() => [ProductionOrderSummaryType])
  productionOrders!: ProductionOrderSummaryType[];

  @Field(() => AggregatedActualsForSeparation)
  aggregatedActuals!: AggregatedActualsForSeparation;
}

@ObjectType()
export class FifoAllocationType {
  @Field(() => ID)
  id!: string;

  @Field()
  separationEventId!: string;

  @Field()
  productionOrderId!: string;

  @Field(() => Int)
  fifoSequence!: number;

  @Field(() => Int)
  quantityRequested!: number;

  @Field(() => Int)
  quantityAllocated!: number;

  @Field(() => Float, { nullable: true })
  proofGallonsAllocated?: number;

  @Field()
  allocationComplete!: boolean;

  @Field({ nullable: true })
  allocatedAt?: Date;

  @Field()
  createdBy!: string;

  @Field()
  createdAt!: Date;
}

@ObjectType()
export class SeparationEventType {
  @Field(() => ID)
  id!: string;

  @Field()
  scheduleOrderRecipeInstanceId!: string;

  @Field(() => EnumSeparationStatus)
  status!: EnumSeparationStatus;

  @Field(() => Float)
  totalProofGallonsAvailable!: number;

  @Field(() => Float)
  totalWineGallonsAvailable!: number;

  @Field(() => Int)
  totalBarrelsExpected!: number;

  @Field(() => Int, { nullable: true })
  totalBarrelsActual?: number;

  @Field()
  initiatedBy!: string;

  @Field({ nullable: true })
  completedAt?: Date;

  @Field({ nullable: true })
  completedBy?: string;

  @Field()
  createdBy!: string;

  @Field()
  createdAt!: Date;

  @Field(() => [FifoAllocationType], { nullable: true })
  fifoAllocations?: FifoAllocationType[];
}

@InputType()
export class LotAssignmentInput {
  @Field()
  lotId!: string;

  @Field()
  productionOrderId!: string;

  @Field(() => Float)
  proofGallons!: number;
}

@ObjectType()
export class AllocationResultItem {
  @Field()
  productionOrderId!: string;

  @Field()
  productionOrderName!: string;

  @Field(() => Int)
  fifoSequence!: number;

  @Field(() => Int)
  quantityRequested!: number;

  @Field(() => Int)
  quantityAllocated!: number;

  @Field(() => Float)
  proofGallonsAllocated!: number;

  @Field()
  allocationComplete!: boolean;

  @Field(() => [String])
  lotIds!: string[];
}

@ObjectType()
export class AllocationSummary {
  @Field(() => Int)
  totalRequested!: number;

  @Field(() => Int)
  totalAllocated!: number;

  @Field(() => Float)
  totalProofGallonsAllocated!: number;
}

@ObjectType()
export class FifoAllocationResultType {
  @Field(() => [AllocationResultItem])
  allocations!: AllocationResultItem[];

  @Field(() => AllocationSummary)
  summary!: AllocationSummary;
}
