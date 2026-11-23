import { ApiProperty } from "@nestjs/swagger";
import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";
import { EnumEnzymeCategory } from "@prisma/client";

export class EnzymeSelectionDto {
  @ApiProperty({
    description: "Enzyme category",
    enum: EnumEnzymeCategory,
    example: "LIQUIFACTION",
  })
  @IsString()
  category!: EnumEnzymeCategory;

  @ApiProperty({
    description: "Selected enzyme configuration ID",
    example: "clzhhlsx30f09mbc9r5mj02z7",
  })
  @IsString()
  enzymeConfigurationId!: string;
}

export class EnzymeCalculatorInputDto {
  @ApiProperty({
    description: "Array of enzyme selections - one per category",
    type: [EnzymeSelectionDto],
    example: [
      {
        category: "LIQUIFACTION",
        enzymeConfigurationId: "clzhhlsx30f09mbc9r5mj02z7",
      },
      {
        category: "SACCHARIFICATION",
        enzymeConfigurationId: "clzhhlsx30f09mbc9r5mj02z8",
      },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EnzymeSelectionDto)
  enzymeSelections!: EnzymeSelectionDto[];

  @ApiProperty({
    description: "Total grain load in pounds",
    minimum: 1000,
    maximum: 50000,
    example: 5000,
  })
  @IsNumber()
  @Min(1000, { message: "Grain load must be at least 1,000 lbs" })
  @Max(50000, { message: "Grain load cannot exceed 50,000 lbs" })
  totalGrainLoadLbs!: number;

  @ApiProperty({
    description:
      "Recipe ID (optional) - if provided, will use recipe mash bill",
    required: false,
    example: "clzhhlsx30f09mbc9r5mj02z9",
  })
  @IsOptional()
  @IsString()
  recipeId?: string;

  @ApiProperty({
    description:
      "Mash bill in format XX-XX-XX-XX (corn-rye-wheat-malt percentages)",
    required: false,
    example: "70-21-00-09",
  })
  @IsOptional()
  @IsString()
  mashBill?: string;
}

export class EnzymeCalculationResultDto {
  @ApiProperty({
    description: "Enzyme configuration ID",
    example: "clzhhlsx30f09mbc9r5mj02z7",
  })
  enzymeConfigurationId!: string;

  @ApiProperty({
    description: "Enzyme category",
    enum: EnumEnzymeCategory,
    example: "LIQUIFACTION",
  })
  category!: EnumEnzymeCategory;

  @ApiProperty({
    description: "Enzyme name from item",
    example: "Alpha-Amylase Enzyme",
  })
  enzymeName!: string;

  @ApiProperty({
    description: "Calculated dose in pounds",
    example: 0.65,
  })
  doseLbs!: number;

  @ApiProperty({
    description: "Application instructions",
    example: "Add with water/backset before grain addition. Mix thoroughly.",
  })
  instructions!: string;

  @ApiProperty({
    description: "Dose per metric ton from configuration",
    example: 0.13,
  })
  dosePerMetricTon!: number;
}

export class EnzymeCalculatorResponseDto {
  @ApiProperty({
    description: "Calculation ID for reference",
    example: "calc_clzhhlsx30f09mbc9r5mj02z7",
  })
  calculationId!: string;

  @ApiProperty({
    description: "Total grain load used in calculation",
    example: 5000,
  })
  totalGrainLoadLbs!: number;

  @ApiProperty({
    description: "Mash bill used (if provided)",
    required: false,
    example: "70-21-00-09",
  })
  mashBill?: string;

  @ApiProperty({
    description: "Recipe ID used (if provided)",
    required: false,
    example: "clzhhlsx30f09mbc9r5mj02z9",
  })
  recipeId?: string;

  @ApiProperty({
    description: "Array of enzyme calculations",
    type: [EnzymeCalculationResultDto],
  })
  enzymeCalculations!: EnzymeCalculationResultDto[];

  @ApiProperty({
    description: "Calculation timestamp",
    example: "2024-05-30T10:30:00.000Z",
  })
  calculatedAt!: string;

  @ApiProperty({
    description: "User who performed calculation",
    example: "john.doe",
  })
  calculatedBy!: string;
}
