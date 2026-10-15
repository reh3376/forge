import { ApiProperty } from "@nestjs/swagger";
import {
  IsString,
  IsNumber,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  Min,
} from "class-validator";
import { EnumEnzymeCategory } from "@prisma/client";

export class CreateEnzymeConfigurationDto {
  @ApiProperty({
    required: true,
    description:
      "Item ID (CUID) that this enzyme configuration is associated with",
    example: "clzhhlsx30f09mbc9r5mj02z7",
  })
  @IsString()
  @IsNotEmpty()
  itemId = "";

  @ApiProperty({
    required: true,
    description: "Category of the enzyme",
    enum: EnumEnzymeCategory,
    example: "LIQUIFACTION",
  })
  @IsEnum(EnumEnzymeCategory)
  category: EnumEnzymeCategory = EnumEnzymeCategory.LIQUIFACTION;

  @ApiProperty({
    required: true,
    description: "Dose per metric ton of grain",
    example: 0.13,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  dosePerMetricTon = 0;

  @ApiProperty({
    required: true,
    description: "Instructions for enzyme application",
    example: "with water/backset before grain",
  })
  @IsString()
  @IsNotEmpty()
  instructions = "";

  @ApiProperty({
    required: true,
    description: "Username of the creator",
    example: "john.doe",
  })
  @IsString()
  @IsNotEmpty()
  createdBy = "";

  @ApiProperty({
    required: false,
    description: "Schema version for future compatibility",
    example: "0001-a",
  })
  @IsString()
  @IsOptional()
  schemaVersion?: string;
}
