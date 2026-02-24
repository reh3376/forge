import { Field, InputType, Float, Int } from "@nestjs/graphql";

@InputType()
export class MashingStepActualsInput {
  @Field(() => Float)
  actualTemperature!: number;

  @Field(() => Int, { nullable: true })
  actualDuration?: number;

  @Field(() => Float, { nullable: true })
  timeActualValue?: number;

  @Field({ nullable: true })
  notes?: string;
}
