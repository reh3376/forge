import { ObjectType, Field, Int } from "@nestjs/graphql";
import { EnumS88StepState, EnumProductionPhase } from "@prisma/client";
import { StepExecution } from "../base/StepExecution";
import { GraphQLJSON } from "graphql-type-json";

@ObjectType()
export class SfcStepSummary {
  @Field(() => Int)
  stepIndex!: number;

  @Field(() => Int)
  branchIndex!: number;

  @Field(() => String)
  stepName!: string;

  @Field(() => EnumS88StepState)
  state!: keyof typeof EnumS88StepState;

  @Field(() => Boolean)
  isActive!: boolean;

  @Field(() => Boolean)
  isComplete!: boolean;

  @Field(() => Date, { nullable: true })
  actualStartTime?: Date | null;

  @Field(() => Date, { nullable: true })
  actualEndTime?: Date | null;

  @Field(() => Int, { nullable: true })
  actualDuration?: number | null;
}

@ObjectType()
export class SfcPhaseState {
  @Field(() => EnumProductionPhase)
  phase!: keyof typeof EnumProductionPhase;

  @Field(() => [SfcStepSummary])
  steps!: SfcStepSummary[];

  @Field(() => Int)
  currentStepIndex!: number;

  @Field(() => Int)
  totalSteps!: number;

  @Field(() => Int)
  completedSteps!: number;
}

@ObjectType()
export class SfcStateResponse {
  @Field(() => String)
  batchId!: string;

  @Field(() => StepExecution, { nullable: true })
  currentStep?: StepExecution | null;

  @Field(() => [SfcPhaseState])
  phases!: SfcPhaseState[];

  @Field(() => [StepExecution])
  activeSteps!: StepExecution[];

  @Field(() => [StepExecution])
  recentlyCompletedSteps!: StepExecution[];

  @Field(() => GraphQLJSON, { nullable: true })
  conditionOverrides?: any;
}
