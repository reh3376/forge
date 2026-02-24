import { InputType, Field, ArgsType } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import {
  IsOptional,
  IsEnum,
  IsNumber,
  IsString,
  IsBoolean,
  Max,
  ValidateNested,
  MaxLength,
  IsDate,
} from "class-validator";
import { Type } from "class-transformer";
import { GraphQLJSON } from "graphql-type-json";
import {
  EnumBomCalculationMode,
  EnumBomFormulaType,
} from "./bom-formula-config.dto";
import { RecipeBomItemWhereUniqueInput } from "../base/RecipeBomItemWhereUniqueInput";
import { UnitsWhereUniqueInput } from "../../units/base/UnitsWhereUniqueInput";
import { ItemWhereUniqueInput } from "../../item/base/ItemWhereUniqueInput";
import { MashingProtocolStepUpdateManyWithoutRecipeBomItemsInput } from "../base/MashingProtocolStepUpdateManyWithoutRecipeBomItemsInput";
import { EnumRecipeBomItemOperation } from "../base/EnumRecipeBomItemOperation";
import { RecipeBomActualUpdateManyWithoutRecipeBomItemsInput } from "../base/RecipeBomActualUpdateManyWithoutRecipeBomItemsInput";
import { RecipeBomWhereUniqueInput } from "../../recipeBom/base/RecipeBomWhereUniqueInput";

/**
 * Extended update input that includes formula configuration fields.
 * This extends the base RecipeBomItemUpdateInput with formula fields that exist
 * in Prisma but are not exposed in the Amplication-generated GraphQL types.
 */
@InputType()
export class RecipeBomItemUpdateInputExtended {
  // ==================== Base Fields ====================

  @ApiProperty({ required: false, type: () => RecipeBomItemWhereUniqueInput })
  @ValidateNested()
  @Type(() => RecipeBomItemWhereUniqueInput)
  @IsOptional()
  @Field(() => RecipeBomItemWhereUniqueInput, { nullable: true })
  activeInstance?: RecipeBomItemWhereUniqueInput | null;

  @ApiProperty({ required: false, type: () => RecipeBomItemWhereUniqueInput })
  @ValidateNested()
  @Type(() => RecipeBomItemWhereUniqueInput)
  @IsOptional()
  @Field(() => RecipeBomItemWhereUniqueInput, { nullable: true })
  classId?: RecipeBomItemWhereUniqueInput | null;

  @ApiProperty({ required: false, type: String })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  @Field(() => String, { nullable: true })
  createdBy?: string;

  @ApiProperty({ required: false, type: () => UnitsWhereUniqueInput })
  @ValidateNested()
  @Type(() => UnitsWhereUniqueInput)
  @IsOptional()
  @Field(() => UnitsWhereUniqueInput, { nullable: true })
  displayUnits?: UnitsWhereUniqueInput | null;

  @ApiProperty({ required: false, type: String })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  @Field(() => String, { nullable: true })
  globalId?: string | null;

  @ApiProperty({ required: false, type: Boolean })
  @IsBoolean()
  @IsOptional()
  @Field(() => Boolean, { nullable: true })
  isClassDefinition?: boolean | null;

  @ApiProperty({ required: false, type: () => ItemWhereUniqueInput })
  @ValidateNested()
  @Type(() => ItemWhereUniqueInput)
  @IsOptional()
  @Field(() => ItemWhereUniqueInput, { nullable: true })
  item?: ItemWhereUniqueInput | null;

  @ApiProperty({
    required: false,
    type: () => MashingProtocolStepUpdateManyWithoutRecipeBomItemsInput,
  })
  @ValidateNested()
  @Type(() => MashingProtocolStepUpdateManyWithoutRecipeBomItemsInput)
  @IsOptional()
  @Field(() => MashingProtocolStepUpdateManyWithoutRecipeBomItemsInput, {
    nullable: true,
  })
  mashingProtocolSteps?: MashingProtocolStepUpdateManyWithoutRecipeBomItemsInput;

  @ApiProperty({ required: false, enum: EnumRecipeBomItemOperation })
  @IsEnum(EnumRecipeBomItemOperation)
  @IsOptional()
  @Field(() => EnumRecipeBomItemOperation, { nullable: true })
  operation?:
    | "Mashing01"
    | "Fermentation01"
    | "Distillation01"
    | "Processing01";

  @ApiProperty({ required: false, type: Number })
  @IsNumber()
  @Max(99999999999)
  @IsOptional()
  @Field(() => Number, { nullable: true })
  quantity?: number | null;

  @ApiProperty({
    required: false,
    type: () => RecipeBomActualUpdateManyWithoutRecipeBomItemsInput,
  })
  @ValidateNested()
  @Type(() => RecipeBomActualUpdateManyWithoutRecipeBomItemsInput)
  @IsOptional()
  @Field(() => RecipeBomActualUpdateManyWithoutRecipeBomItemsInput, {
    nullable: true,
  })
  recipeBomActuals?: RecipeBomActualUpdateManyWithoutRecipeBomItemsInput;

  @ApiProperty({ required: false, type: () => RecipeBomWhereUniqueInput })
  @ValidateNested()
  @Type(() => RecipeBomWhereUniqueInput)
  @IsOptional()
  @Field(() => RecipeBomWhereUniqueInput, { nullable: true })
  recipeBoms?: RecipeBomWhereUniqueInput | null;

  @ApiProperty({ required: false })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  @Field(() => Date, { nullable: true })
  updatedBy?: Date | null;

  // ==================== Formula Configuration Fields ====================

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

/**
 * Args type for updateRecipeBomItemExtended mutation
 */
@ArgsType()
export class UpdateRecipeBomItemArgsExtended {
  @Field(() => RecipeBomItemWhereUniqueInput)
  @Type(() => RecipeBomItemWhereUniqueInput)
  @ValidateNested()
  where!: RecipeBomItemWhereUniqueInput;

  @Field(() => RecipeBomItemUpdateInputExtended)
  @Type(() => RecipeBomItemUpdateInputExtended)
  @ValidateNested()
  data!: RecipeBomItemUpdateInputExtended;
}
