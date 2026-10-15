import { InputType, Field } from "@nestjs/graphql";

@InputType()
export class StepStateTransitionInput {
  @Field(() => String)
  stepExecutionId!: string;

  @Field(() => String, { nullable: true })
  reason?: string;
}

@InputType()
export class AllocateEquipmentInput {
  @Field(() => String)
  stepExecutionId!: string;

  @Field(() => String)
  assetId!: string;

  @Field(() => String, { nullable: true })
  equipmentMode?: string;
}
