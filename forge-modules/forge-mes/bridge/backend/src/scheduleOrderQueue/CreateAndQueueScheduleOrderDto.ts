import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsOptional, IsDate } from "class-validator";
import { Type } from "class-transformer";

export class CreateAndQueueScheduleOrderDto {
  @ApiProperty({
    required: true,
    type: String,
    description:
      "The ID of the production order to create a schedule order for",
  })
  @IsString()
  productionOrderId!: string;

  @ApiProperty({
    required: false,
    type: Date,
    description: "Optional start date for the schedule order",
  })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  startDate?: Date;

  @ApiProperty({
    required: false,
    type: Date,
    description: "Optional end date for the schedule order",
  })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  endDate?: Date;

  @ApiProperty({
    required: true,
    type: String,
    description: "User who is creating the schedule order",
  })
  @IsString()
  createdBy!: string;
}
