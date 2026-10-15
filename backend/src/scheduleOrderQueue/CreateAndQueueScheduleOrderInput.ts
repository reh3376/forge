import { InputType, Field } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsOptional, IsDate } from "class-validator";
import { Type } from "class-transformer";

@InputType()
export class CreateAndQueueScheduleOrderInput {
  @ApiProperty({
    required: true,
    type: String,
    description:
      "The ID of the production order to create a schedule order for",
  })
  @IsString()
  @Field(() => String)
  productionOrderId!: string;

  @ApiProperty({
    required: false,
    type: Date,
    description: "Optional start date for the schedule order",
  })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  @Field(() => Date, {
    nullable: true,
  })
  startDate?: Date;

  @ApiProperty({
    required: false,
    type: Date,
    description: "Optional end date for the schedule order",
  })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  @Field(() => Date, {
    nullable: true,
  })
  endDate?: Date;

  @ApiProperty({
    required: true,
    type: String,
    description: "User who is creating the schedule order",
  })
  @IsString()
  @Field(() => String)
  createdBy!: string;
}
