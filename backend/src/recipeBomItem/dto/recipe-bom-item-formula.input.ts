import { InputType, Field } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import {
  IsOptional,
  IsEnum,
  IsNumber,
  IsString,
  IsBoolean,
  Max,
} from "class-validator";
import { GraphQLJSON } from "graphql-type-json";
import {
  EnumBomCalculationMode,
  EnumBomFormulaType,
} from "./bom-formula-config.dto";

/**
 * Input type for formula configuration fields on RecipeBomItem.
 * These are used to extend the base create/update inputs with formula fields.
 */
@InputType()
export class RecipeBomItemFormulaInput {
  @ApiProperty({
    required: false,
    enum: [
      "STATIC",
      "FORMULA_GRAIN",
      "FORMULA_WATER",
      "ENZYME_NORMALIZED",
      "EXPRESSION",
    ],
    description: "BOM item calculation mode for quantity derivation",
  })
  @IsEnum(EnumBomCalculationMode)
  @IsOptional()
  @Field(() => EnumBomCalculationMode, {
    nullable: true,
    description: "BOM item calculation mode for quantity derivation",
  })
  calculationMode?: EnumBomCalculationMode;

  @ApiProperty({
    required: false,
    enum: ["SIMPLE_RATIO", "WATER_PER_BUSHEL", "BACKSET_PERCENTAGE", "CUSTOM"],
    description: "Type of formula calculation",
  })
  @IsEnum(EnumBomFormulaType)
  @IsOptional()
  @Field(() => EnumBomFormulaType, {
    nullable: true,
    description: "Type of formula calculation",
  })
  formulaType?: EnumBomFormulaType;

  @ApiProperty({
    required: false,
    type: Number,
    description: "Multiplier for formula calculation (e.g., 0.70 for 70%)",
  })
  @IsNumber()
  @Max(99999999999)
  @IsOptional()
  @Field(() => Number, {
    nullable: true,
    description: "Multiplier for formula calculation (e.g., 0.70 for 70%)",
  })
  formulaMultiplier?: number;

  @ApiProperty({
    required: false,
    type: String,
    description: "Custom expression for EXPRESSION calculation mode",
  })
  @IsString()
  @IsOptional()
  @Field(() => String, {
    nullable: true,
    description: "Custom expression for EXPRESSION calculation mode",
  })
  customExpression?: string;

  @ApiProperty({
    required: false,
    type: String,
    description: "Link to a FormulaLibrary entry",
  })
  @IsString()
  @IsOptional()
  @Field(() => String, {
    nullable: true,
    description: "Link to a FormulaLibrary entry",
  })
  formulaLibraryId?: string;

  @ApiProperty({
    required: false,
    type: Object,
    description: "Variables for expression evaluation",
  })
  @IsOptional()
  @Field(() => GraphQLJSON, {
    nullable: true,
    description: "Variables for expression evaluation",
  })
  expressionVariables?: Record<string, any>;

  @ApiProperty({
    required: false,
    type: Boolean,
    description: "Whether the expression has been validated",
  })
  @IsBoolean()
  @IsOptional()
  @Field(() => Boolean, {
    nullable: true,
    description: "Whether the expression has been validated",
  })
  expressionValidated?: boolean;
}
