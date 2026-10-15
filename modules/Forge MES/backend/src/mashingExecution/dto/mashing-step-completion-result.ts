import { Field, ObjectType, Int, Float } from "@nestjs/graphql";

@ObjectType()
export class MashingStepActualOutput {
  @Field()
  id!: string;

  @Field(() => Float)
  actualValue!: number;

  @Field(() => Float, { nullable: true })
  timeActualValue?: number;

  @Field(() => Date, { nullable: true })
  stepCompletedAt?: Date;

  @Field()
  createdBy!: string;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType()
export class StepExecutionOutput {
  @Field()
  id!: string;

  @Field()
  batchId!: string;

  @Field()
  phase!: string;

  @Field(() => Int)
  stepIndex!: number;

  @Field()
  stepName!: string;

  @Field()
  state!: string;

  @Field({ nullable: true })
  previousState?: string;

  @Field(() => Date, { nullable: true })
  actualStartTime?: Date;

  @Field(() => Date, { nullable: true })
  actualEndTime?: Date;

  @Field(() => Int, { nullable: true })
  actualDuration?: number;

  @Field({ nullable: true })
  startedBy?: string;

  @Field({ nullable: true })
  completedBy?: string;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType()
export class BatchDeviationOutput {
  @Field()
  id!: string;

  @Field()
  batchId!: string;

  @Field()
  deviationType!: string;

  @Field()
  severity!: string;

  @Field()
  status!: string;

  @Field({ nullable: true })
  parameterName?: string;

  @Field(() => Float, { nullable: true })
  plannedValue?: number;

  @Field(() => Float, { nullable: true })
  actualValue?: number;

  @Field(() => Float, { nullable: true })
  deviationPercent?: number;

  @Field({ nullable: true })
  units?: string;

  @Field()
  description!: string;

  @Field()
  isAutoDetected!: boolean;

  @Field(() => Date)
  detectedAt!: Date;

  @Field()
  detectedBy!: string;
}

@ObjectType()
export class MashingStepCompletionResult {
  @Field(() => StepExecutionOutput)
  stepExecution!: StepExecutionOutput;

  @Field(() => MashingStepActualOutput)
  actual!: MashingStepActualOutput;

  @Field(() => [BatchDeviationOutput])
  deviations!: BatchDeviationOutput[];
}
