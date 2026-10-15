import { Field, InputType, ObjectType, Int } from "@nestjs/graphql";

/**
 * Input for recording cook completion on a schedule order
 */
@InputType()
export class RecordCookCompleteInput {
  @Field(() => String)
  scheduleOrderId!: string;

  @Field(() => Int)
  cookIndex!: number;

  @Field(() => String)
  cookerNumber!: string;

  @Field(() => Date, { nullable: true })
  completedAt?: Date;

  @Field(() => String, { nullable: true })
  completedBy?: string;

  @Field(() => String, { nullable: true })
  notes?: string;
}

/**
 * Response for cook complete mutation
 */
@ObjectType()
export class CookCompleteResponse {
  @Field(() => String, { nullable: true })
  scheduleOrderId?: string;

  @Field(() => Int)
  executedCooks!: number;

  @Field(() => Int)
  totalCooks!: number;

  @Field(() => Int)
  cookIndex!: number;

  @Field(() => String)
  cookerNumber!: string;

  @Field(() => Boolean)
  allCooksComplete!: boolean;

  @Field(() => String, { nullable: true })
  auditLogId?: string;

  @Field(() => Boolean, { nullable: true })
  success?: boolean;

  @Field(() => String, { nullable: true })
  message?: string;
}

/**
 * Input for recording when a recipe is loaded on equipment
 */
@InputType()
export class RecordRecipeLoadedInput {
  @Field(() => String)
  scheduleOrderId!: string;

  @Field(() => String)
  scheduleOrderRecipeInstanceId!: string;

  @Field(() => String)
  cookerNumber!: string;

  @Field(() => Date, { nullable: true })
  loadedAt?: Date;

  @Field(() => String, { nullable: true })
  loadedBy?: string;

  @Field(() => String, { nullable: true })
  sourceUpdatedAt?: string;

  @Field(() => String, { nullable: true })
  equipmentId?: string;
}

/**
 * Response for recipe loaded mutation
 */
@ObjectType()
export class RecipeLoadedResponse {
  @Field(() => String, { nullable: true })
  scheduleOrderId?: string;

  @Field(() => String, { nullable: true })
  scheduleOrderRecipeInstanceId?: string;

  @Field(() => String, { nullable: true })
  cookerNumber?: string;

  @Field(() => String, { nullable: true })
  auditLogId?: string;

  @Field(() => String, { nullable: true })
  loadedUpdatedAt?: string;

  @Field(() => Boolean, { nullable: true })
  success?: boolean;

  @Field(() => String, { nullable: true })
  message?: string;
}

/**
 * Queue state entry type for tracking queue position
 */
@ObjectType()
export class QueueStateEntry {
  @Field(() => Int)
  queueIndex!: number;

  @Field(() => String)
  scheduleOrderId!: string;

  @Field(() => String, { nullable: true })
  scheduleOrderName?: string;
}

/**
 * Input for advancing schedule order queue
 */
@InputType()
export class AdvanceScheduleOrderQueueInput {
  @Field(() => String, {
    nullable: true,
    description: "Optional: specific queue ID to advance",
  })
  queueId?: string;

  @Field(() => String, {
    nullable: true,
    description: "User who initiated the advance",
  })
  advancedBy?: string;

  @Field(() => String, {
    nullable: true,
    description: "Optional: reason for advance",
  })
  reason?: string;

  @Field(() => String, {
    nullable: true,
    description: "Optional: notes about the advance",
  })
  notes?: string;
}

/**
 * Response for advance queue mutation
 */
@ObjectType()
export class AdvanceQueueResponse {
  @Field(() => Boolean)
  success!: boolean;

  @Field(() => String, { nullable: true })
  message?: string;

  @Field(() => String, { nullable: true })
  previousSOId?: string;

  @Field(() => String, { nullable: true })
  newActiveSOId?: string;

  @Field(() => String, { nullable: true })
  newActiveSOName?: string;

  @Field(() => [QueueStateEntry], { nullable: true })
  newQueueState?: QueueStateEntry[];

  @Field(() => String, { nullable: true })
  auditLogId?: string;

  @Field(() => String, { nullable: true })
  advancedOrderId?: string;

  @Field(() => String, { nullable: true })
  nextOrderId?: string;
}
