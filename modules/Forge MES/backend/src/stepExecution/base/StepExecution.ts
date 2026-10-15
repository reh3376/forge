import { ObjectType, Field, Int, registerEnumType } from "@nestjs/graphql";
import { EnumS88StepState, EnumProductionPhase } from "@prisma/client";
import { GraphQLJSON } from "graphql-type-json";

registerEnumType(EnumS88StepState, {
  name: "EnumS88StepState",
  description: "S88 Procedural Step States (ISA-88.02)",
});

@ObjectType()
export class StepExecution {
  @Field(() => String)
  id!: string;

  @Field(() => String, { nullable: true })
  globalId?: string | null;

  @Field(() => String)
  batchId!: string;

  @Field(() => String, { nullable: true })
  mashingProtocolStepId?: string | null;

  @Field(() => String, { nullable: true })
  phaseProtocolStepId?: string | null;

  @Field(() => EnumProductionPhase)
  phase!: keyof typeof EnumProductionPhase;

  @Field(() => String, { nullable: true })
  operationName?: string | null;

  @Field(() => Int)
  stepIndex!: number;

  @Field(() => Int)
  branchIndex!: number;

  @Field(() => String)
  stepName!: string;

  @Field(() => EnumS88StepState)
  state!: keyof typeof EnumS88StepState;

  @Field(() => EnumS88StepState, { nullable: true })
  previousState?: keyof typeof EnumS88StepState | null;

  @Field(() => String, { nullable: true })
  allocatedAssetId?: string | null;

  @Field(() => String, { nullable: true })
  equipmentMode?: string | null;

  @Field(() => Date, { nullable: true })
  plannedStartTime?: Date | null;

  @Field(() => Date, { nullable: true })
  plannedEndTime?: Date | null;

  @Field(() => Int, { nullable: true })
  plannedDuration?: number | null;

  @Field(() => Date, { nullable: true })
  actualStartTime?: Date | null;

  @Field(() => Date, { nullable: true })
  actualEndTime?: Date | null;

  @Field(() => Int, { nullable: true })
  actualDuration?: number | null;

  @Field(() => Boolean)
  entryConditionMet!: boolean;

  @Field(() => Date, { nullable: true })
  entryConditionMetAt?: Date | null;

  @Field(() => Boolean)
  exitConditionMet!: boolean;

  @Field(() => Date, { nullable: true })
  exitConditionMetAt?: Date | null;

  @Field(() => GraphQLJSON, { nullable: true })
  conditionOverrides?: any;

  @Field(() => String, { nullable: true })
  startedBy?: string | null;

  @Field(() => String, { nullable: true })
  completedBy?: string | null;

  @Field(() => String, { nullable: true })
  pausedBy?: string | null;

  @Field(() => String, { nullable: true })
  pauseReason?: string | null;

  @Field(() => String, { nullable: true })
  heldBy?: string | null;

  @Field(() => String, { nullable: true })
  holdReason?: string | null;

  @Field(() => String, { nullable: true })
  abortedBy?: string | null;

  @Field(() => String, { nullable: true })
  abortReason?: string | null;

  @Field(() => GraphQLJSON, { nullable: true })
  stateHistory?: any;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String)
  createdBy!: string;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => String, { nullable: true })
  schemaVersion?: string | null;
}
