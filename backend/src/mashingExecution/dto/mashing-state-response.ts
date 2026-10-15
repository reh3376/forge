import { Field, ObjectType, Int, Float } from "@nestjs/graphql";

@ObjectType()
export class LinkedBomItem {
  @Field()
  id!: string;

  @Field({ nullable: true })
  itemId?: string;

  @Field({ nullable: true })
  itemName?: string;

  @Field(() => Float, { nullable: true })
  quantityPlanned?: number;

  @Field({ nullable: true })
  units?: string;
}

@ObjectType()
export class MashingStepState {
  @Field()
  stepExecutionId!: string;

  @Field()
  mashingProtocolStepId!: string;

  @Field()
  stepName!: string;

  @Field(() => Int)
  stepIndex!: number;

  @Field({ nullable: true })
  stepType?: string;

  @Field()
  state!: string;

  @Field(() => Float, { nullable: true })
  targetTemperature?: number;

  @Field(() => Int, { nullable: true })
  targetDuration?: number;

  @Field(() => Date, { nullable: true })
  actualStartTime?: Date;

  @Field(() => Float, { nullable: true })
  elapsedSeconds?: number;

  @Field(() => [LinkedBomItem], { nullable: true })
  linkedBomItems?: LinkedBomItem[];
}

@ObjectType()
export class CompletedMashingStep {
  @Field()
  stepExecutionId!: string;

  @Field()
  mashingProtocolStepId!: string;

  @Field()
  stepName!: string;

  @Field(() => Int)
  stepIndex!: number;

  @Field(() => Float, { nullable: true })
  actualTemperature?: number;

  @Field(() => Int, { nullable: true })
  actualDuration?: number;

  @Field(() => Date, { nullable: true })
  completedAt?: Date;
}

@ObjectType()
export class PendingMashingStep {
  @Field()
  id!: string;

  @Field(() => Int)
  index!: number;

  @Field({ nullable: true })
  stepType?: string;

  @Field({ nullable: true })
  promptMessage?: string;

  @Field(() => Float, { nullable: true })
  temperatureSetpoint?: number;

  @Field(() => Float, { nullable: true })
  stepTime?: number;

  @Field(() => [LinkedBomItem], { nullable: true })
  linkedBomItems?: LinkedBomItem[];
}

@ObjectType()
export class MashingStateResponse {
  @Field()
  scheduleOrderId!: string;

  @Field({ nullable: true })
  batchId?: string;

  @Field(() => MashingStepState, { nullable: true })
  currentStep?: MashingStepState;

  @Field(() => [CompletedMashingStep])
  completedSteps!: CompletedMashingStep[];

  @Field(() => [PendingMashingStep])
  pendingSteps!: PendingMashingStep[];

  @Field(() => Float)
  overallProgress!: number;
}
