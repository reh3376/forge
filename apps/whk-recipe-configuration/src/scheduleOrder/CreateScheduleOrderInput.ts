import { InputType, Field } from "@nestjs/graphql";
import { IsString, IsOptional } from "class-validator";

/**
 * GraphQL input type for creating a ScheduleOrder from ProductionOrders
 * This is used by the frontend "Add to Schedule" dialog
 */
@InputType()
export class CreateScheduleOrderInput {
  @Field(() => String)
  @IsString()
  name!: string;

  @Field(() => String)
  @IsString()
  recipeName!: string;

  @Field(() => String, { description: "ISO date string for estimated start" })
  @IsString()
  estimatedStart!: string;

  @Field(() => String, { description: "ISO date string for estimated end" })
  @IsString()
  estimatedEnd!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  status?: string;

  @Field(() => String, {
    nullable: true,
    description:
      "Optional - will be derived from ProductionOrders if not provided",
  })
  @IsOptional()
  @IsString()
  recipeGroupId?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  scheduleOrderRecipeId?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  createdBy?: string;
}
