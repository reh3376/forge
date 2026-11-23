import { InputType, Field, Int } from "@nestjs/graphql";
import { EnumProductionPhase } from "@prisma/client";

@InputType()
export class CreateStepExecutionInput {
  @Field(() => String)
  batchId!: string;

  @Field(() => EnumProductionPhase)
  phase!: keyof typeof EnumProductionPhase;

  @Field(() => String)
  stepName!: string;

  @Field(() => Int)
  stepIndex!: number;

  @Field(() => Int, { nullable: true, defaultValue: 0 })
  branchIndex?: number;

  @Field(() => String, { nullable: true })
  mashingProtocolStepId?: string;

  @Field(() => String, { nullable: true })
  phaseProtocolStepId?: string;

  @Field(() => String, { nullable: true })
  operationName?: string;

  @Field(() => Int, { nullable: true })
  plannedDuration?: number;

  @Field(() => Date, { nullable: true })
  plannedStartTime?: Date;

  @Field(() => Date, { nullable: true })
  plannedEndTime?: Date;
}
