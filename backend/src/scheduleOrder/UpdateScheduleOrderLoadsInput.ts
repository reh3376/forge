import { Field, InputType, Float } from "@nestjs/graphql";
import { IsOptional, IsNumber, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

@InputType()
export class UpdateScheduleOrderLoadsInput {
  @ApiProperty({
    required: false,
    type: Number,
    description: "Total grain weight in pounds",
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Field(() => Float, {
    nullable: true,
    description: "Total grain weight in pounds",
  })
  grainLoad?: number;

  @ApiProperty({
    required: false,
    type: Number,
    description: "Total water volume in gallons",
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Field(() => Float, {
    nullable: true,
    description: "Total water volume in gallons",
  })
  waterLoad?: number;
}
