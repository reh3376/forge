import { ApiProperty } from "@nestjs/swagger";
import {
  IsString,
  IsNumber,
  IsOptional,
  IsNotEmpty,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsEnum,
} from "class-validator";
import { Type } from "class-transformer";
import { InputType, Field, Float, ObjectType } from "@nestjs/graphql";
import { GraphQLJSONObject } from "graphql-type-json";

// Enum for whiskey types
export enum WhiskeyType {
  FourGrainBourbon = "FourGrainBourbon",
  RyeWhiskey = "RyeWhiskey",
  WheatWhiskey = "WheatWhiskey",
  CornWhiskey = "CornWhiskey",
  MaltWhiskey = "MaltWhiskey",
}

// Mash bill composition
@InputType()
export class MashBillComposition {
  @ApiProperty({
    required: true,
    description: "Corn percentage (0-100)",
    example: 75,
  })
  @IsNumber()
  @Field(() => Float)
  corn!: number;

  @ApiProperty({
    required: true,
    description: "Rye percentage (0-100)",
    example: 21,
  })
  @IsNumber()
  @Field(() => Float)
  rye!: number;

  @ApiProperty({
    required: true,
    description: "Wheat percentage (0-100)",
    example: 0,
  })
  @IsNumber()
  @Field(() => Float)
  wheat!: number;

  @ApiProperty({
    required: true,
    description: "Malted barley percentage (0-100)",
    example: 4,
  })
  @IsNumber()
  @Field(() => Float)
  maltedBarley!: number;
}

// Recipe ingredient for BOM
@InputType()
export class RecipeIngredientInput {
  @ApiProperty({
    required: true,
    description: "Unique ingredient ID",
    example: "ing_1234567890",
  })
  @IsString()
  @IsNotEmpty()
  @Field(() => String)
  id!: string;

  @ApiProperty({
    required: true,
    description: "Item code/number",
    example: "CORN001",
  })
  @IsString()
  @IsNotEmpty()
  @Field(() => String)
  itemCode!: string;

  @ApiProperty({
    required: true,
    description: "Item name",
    example: "Yellow Corn",
  })
  @IsString()
  @IsNotEmpty()
  @Field(() => String)
  name!: string;

  @ApiProperty({
    required: true,
    description: "Quantity",
    example: 750,
  })
  @IsNumber()
  @Field(() => Float)
  quantity!: number;

  @ApiProperty({
    required: true,
    description: "Unit of measurement",
    example: "lb",
  })
  @IsString()
  @IsNotEmpty()
  @Field(() => String)
  unit!: string;

  @ApiProperty({
    required: true,
    description: "Ingredient category",
    example: "grains",
  })
  @IsString()
  @IsNotEmpty()
  @Field(() => String)
  category!: string;

  @ApiProperty({
    required: false,
    description: "Additional notes",
    example: "Premium grade corn",
  })
  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  notes?: string;

  // Formula configuration fields for dynamic BOM calculations
  @ApiProperty({
    required: false,
    description: "Calculation mode for this BOM item",
    example: "FORMULA_GRAIN",
    enum: [
      "STATIC",
      "FORMULA_GRAIN",
      "FORMULA_WATER",
      "ENZYME_NORMALIZED",
      "EXPRESSION",
    ],
  })
  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  calculationMode?: string;

  @ApiProperty({
    required: false,
    description: "Formula type when using formula-based calculation",
    example: "SIMPLE_RATIO",
    enum: ["SIMPLE_RATIO", "WATER_PER_BUSHEL", "BACKSET_PERCENTAGE", "CUSTOM"],
  })
  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  formulaType?: string;

  @ApiProperty({
    required: false,
    description: "Multiplier for formula calculations",
    example: 0.7,
  })
  @IsNumber()
  @IsOptional()
  @Field(() => Float, { nullable: true })
  formulaMultiplier?: number;

  @ApiProperty({
    required: false,
    description: "Custom expression for EXPRESSION calculation mode",
    example: "grainLoad * 0.001 + waterLoad * 0.002",
  })
  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  customExpression?: string;

  @ApiProperty({
    required: false,
    description: "Formula library ID for reusable formulas",
    example: "clzhhlsx30f09mbc9r5mj02z8",
  })
  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  formulaLibraryId?: string;

  @ApiProperty({
    required: false,
    description: "Expression variables as JSON object",
    example: { grainType: "corn", percentage: 0.75 },
  })
  @IsOptional()
  @Field(() => GraphQLJSONObject, { nullable: true })
  expressionVariables?: Record<string, unknown>;

  @ApiProperty({
    required: false,
    description: "Whether the custom expression has been validated",
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  @Field(() => Boolean, { nullable: true })
  expressionValidated?: boolean;

  @ApiProperty({
    required: false,
    description: "Operation where this BOM item is used",
    example: "Mashing01",
  })
  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  operation?: string;
}

// Recipe parameter input
@InputType()
export class RecipeParameterInput {
  @ApiProperty({
    required: true,
    description: "Parameter name",
    example: "High Wine Proof",
  })
  @IsString()
  @IsNotEmpty()
  @Field(() => String)
  name!: string;

  @ApiProperty({
    required: true,
    description: "Parameter value",
    example: 65.5,
  })
  @IsNumber()
  @Field(() => Float)
  value!: number;

  @ApiProperty({
    required: false,
    description: "Parameter unit",
    example: "proof",
  })
  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  unit?: string;

  @ApiProperty({
    required: false,
    description: "Parameter description",
    example: "Target proof for high wine distillation",
  })
  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  description?: string;
}

// Mashing protocol step input
@InputType()
export class MashingStepInput {
  @ApiProperty({
    required: true,
    description: "Step ID",
    example: "step_1234567890",
  })
  @IsString()
  @IsNotEmpty()
  @Field(() => String)
  id!: string;

  @ApiProperty({
    required: true,
    description: "Step index/order",
    example: 1,
  })
  @IsNumber()
  @Field(() => Float)
  index!: number;

  @ApiProperty({
    required: true,
    description: "Step type",
    example: "LiquidAdd",
  })
  @IsString()
  @IsNotEmpty()
  @Field(() => String)
  stepType!: string;

  @ApiProperty({
    required: false,
    description: "Hold type",
    example: "Heat",
  })
  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  holdType?: string;

  @ApiProperty({
    required: false,
    description: "Heat temperature setpoint",
    example: 180,
  })
  @IsNumber()
  @IsOptional()
  @Field(() => Float, { nullable: true })
  heatTempSp?: number;

  @ApiProperty({
    required: false,
    description: "Cool temperature setpoint",
    example: 150,
  })
  @IsNumber()
  @IsOptional()
  @Field(() => Float, { nullable: true })
  coolTempSp?: number;

  @ApiProperty({
    required: false,
    description: "Time duration in minutes",
    example: 30,
  })
  @IsNumber()
  @IsOptional()
  @Field(() => Float, { nullable: true })
  timeDuration?: number;

  @ApiProperty({
    required: false,
    description: "Water/backset setpoint",
    example: 1000,
  })
  @IsNumber()
  @IsOptional()
  @Field(() => Float, { nullable: true })
  waterBacksetSP?: number;

  @ApiProperty({
    required: false,
    description: "Additive type",
    example: "enzyme",
  })
  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  additiveType?: string;

  @ApiProperty({
    required: true,
    description: "Whether step is included",
    example: true,
  })
  @IsBoolean()
  @Field(() => Boolean)
  included!: boolean;

  @ApiProperty({
    required: false,
    description: "Step notes",
    example: "Add slowly while stirring",
  })
  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  notes?: string;
}

// Main master recipe creation input
@InputType()
export class CreateMasterRecipeInput {
  @ApiProperty({
    required: true,
    description: "Recipe name/identifier",
    example: "CUST001-75-21-00-04-v01",
  })
  @IsString()
  @IsNotEmpty()
  @Field(() => String)
  Recipe!: string;

  @ApiProperty({
    required: false,
    description: "Whether recipe is active",
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  @Field(() => Boolean, { nullable: true })
  active?: boolean;

  @ApiProperty({
    required: true,
    description: "Whiskey type",
    example: "FourGrainBourbon",
  })
  @IsEnum(WhiskeyType)
  @Field(() => String)
  whiskeyType!: WhiskeyType;

  @ApiProperty({
    required: true,
    description: "Recipe revision",
    example: "1",
  })
  @IsString()
  @IsNotEmpty()
  @Field(() => String)
  revision!: string;

  @ApiProperty({
    required: true,
    description: "Customer code",
    example: "CUST001",
  })
  @IsString()
  @IsNotEmpty()
  @Field(() => String)
  customerCode!: string;

  @ApiProperty({
    required: true,
    description: "Number of cooks per fermentation",
    example: 4,
  })
  @IsNumber()
  @Field(() => Float)
  cooksPerFerm!: number;

  @ApiProperty({
    required: true,
    description: "Creator username",
    example: "john.doe",
  })
  @IsString()
  @IsNotEmpty()
  @Field(() => String)
  createdBy!: string;

  @ApiProperty({
    required: true,
    description: "Mash bill composition",
    type: () => MashBillComposition,
  })
  @ValidateNested()
  @Type(() => MashBillComposition)
  @Field(() => MashBillComposition)
  mashBill!: MashBillComposition;

  @ApiProperty({
    required: false,
    description: "Base recipe ID for creating from existing",
    example: "clzhhlsx30f09mbc9r5mj02z7",
  })
  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  baseRecipeId?: string;

  @ApiProperty({
    required: true,
    description: "Recipe ingredients/BOM",
    type: [RecipeIngredientInput],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientInput)
  @Field(() => [RecipeIngredientInput])
  ingredients!: RecipeIngredientInput[];

  @ApiProperty({
    required: true,
    description: "Recipe parameters",
    type: [RecipeParameterInput],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeParameterInput)
  @Field(() => [RecipeParameterInput])
  parameters!: RecipeParameterInput[];

  @ApiProperty({
    required: true,
    description: "Mashing protocol steps",
    type: [MashingStepInput],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MashingStepInput)
  @Field(() => [MashingStepInput])
  mashingSteps!: MashingStepInput[];
}

// Master recipe update input (similar to create but with optional fields)
@InputType()
export class UpdateMasterRecipeInput {
  @ApiProperty({
    required: false,
    description: "Recipe name/identifier",
    example: "CUST001-75-21-00-04-v02",
  })
  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  Recipe?: string;

  @ApiProperty({
    required: false,
    description: "Whether recipe is active",
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  @Field(() => Boolean, { nullable: true })
  active?: boolean;

  @ApiProperty({
    required: false,
    description: "Whiskey type",
    example: "FourGrainBourbon",
  })
  @IsEnum(WhiskeyType)
  @IsOptional()
  @Field(() => String, { nullable: true })
  whiskeyType?: WhiskeyType;

  @ApiProperty({
    required: false,
    description: "Customer code",
    example: "CUST001",
  })
  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  customerCode?: string;

  @ApiProperty({
    required: false,
    description: "Number of cooks per fermentation",
    example: 4,
  })
  @IsNumber()
  @IsOptional()
  @Field(() => Float, { nullable: true })
  cooksPerFerm?: number;

  @ApiProperty({
    required: true,
    description: "Updater username",
    example: "john.doe",
  })
  @IsString()
  @IsNotEmpty()
  @Field(() => String)
  updatedBy!: string;

  @ApiProperty({
    required: false,
    description: "Mash bill composition",
    type: () => MashBillComposition,
  })
  @ValidateNested()
  @Type(() => MashBillComposition)
  @IsOptional()
  @Field(() => MashBillComposition, { nullable: true })
  mashBill?: MashBillComposition;

  @ApiProperty({
    required: false,
    description: "Recipe ingredients/BOM",
    type: [RecipeIngredientInput],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientInput)
  @IsOptional()
  @Field(() => [RecipeIngredientInput], { nullable: true })
  ingredients?: RecipeIngredientInput[];

  @ApiProperty({
    required: false,
    description: "Recipe parameters",
    type: [RecipeParameterInput],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeParameterInput)
  @IsOptional()
  @Field(() => [RecipeParameterInput], { nullable: true })
  parameters?: RecipeParameterInput[];

  @ApiProperty({
    required: false,
    description: "Mashing protocol steps",
    type: [MashingStepInput],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MashingStepInput)
  @IsOptional()
  @Field(() => [MashingStepInput], { nullable: true })
  mashingSteps?: MashingStepInput[];
}

// Response DTOs
@ObjectType()
export class MasterRecipeResponse {
  @ApiProperty({
    required: true,
    description: "Recipe ID",
    example: "clzhhlsx30f09mbc9r5mj02z7",
  })
  @Field(() => String)
  id!: string;

  @ApiProperty({
    required: true,
    description: "Recipe name",
    example: "CUST001-75-21-00-04-v01",
  })
  @Field(() => String)
  Recipe!: string;

  @ApiProperty({
    required: true,
    description: "Recipe revision",
    example: 1,
  })
  @Field(() => Float)
  revision!: number;

  @ApiProperty({
    required: true,
    description: "Whether recipe is active",
    example: true,
  })
  @Field(() => Boolean)
  active!: boolean;

  @ApiProperty({
    required: true,
    description: "Whiskey type",
    example: "FourGrainBourbon",
  })
  @Field(() => String)
  whiskeyType!: string;

  @ApiProperty({
    required: true,
    description: "Creation timestamp",
    example: "2024-01-15T10:30:00Z",
  })
  @Field(() => String)
  createdAt!: string;

  @ApiProperty({
    required: true,
    description: "Creator username",
    example: "john.doe",
  })
  @Field(() => String)
  createdBy!: string;

  @ApiProperty({
    required: false,
    description: "Update timestamp",
    example: "2024-01-16T14:20:00Z",
  })
  @Field(() => String, { nullable: true })
  updatedAt?: string;

  @ApiProperty({
    required: false,
    description: "Updater username",
    example: "jane.smith",
  })
  @Field(() => String, { nullable: true })
  updatedBy?: string;
}
