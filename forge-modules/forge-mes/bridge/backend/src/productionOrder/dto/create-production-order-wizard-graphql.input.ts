import { InputType, Field, ArgsType } from "@nestjs/graphql";
import { ApiProperty } from "@nestjs/swagger";
import {
  ValidateNested,
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsDateString,
  IsEnum,
  IsBoolean,
} from "class-validator";
import { Type } from "class-transformer";
import { EnumProductionOrderContainerType } from "../base/EnumProductionOrderContainerType";

@InputType()
export class ProductionOrderWizardInput {
  @Field(() => String)
  @IsString()
  @ApiProperty({ description: "Production order name" })
  orderName!: string;

  @Field(() => Number)
  @IsNumber()
  @ApiProperty({ description: "Production quantity" })
  quantity!: number;

  @Field(() => String)
  @IsString()
  @ApiProperty({ description: "Units ID for the production order" })
  units!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @ApiProperty({ description: "Priority level", required: false })
  priority?: string;

  @Field(() => String)
  @IsDateString()
  @ApiProperty({ description: "Production start date" })
  startDate!: string;

  @Field(() => String)
  @IsDateString()
  @ApiProperty({ description: "Production end date" })
  endDate!: string;

  @Field(() => String)
  @IsString()
  @ApiProperty({ description: "Customer code" })
  customerCode!: string;

  @Field(() => Number)
  @IsNumber()
  @ApiProperty({ description: "Final proof value" })
  finalProof!: number;

  @Field(() => EnumProductionOrderContainerType)
  @IsEnum(EnumProductionOrderContainerType)
  @ApiProperty({ description: "Container type for production" })
  containerType!: EnumProductionOrderContainerType;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: "Number of fermenters", required: false })
  fermenters?: number;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: "Number of cooks", required: false })
  cooks?: number;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: "Total grain load", required: false })
  totalGrainLoad?: number;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiProperty({
    description: "Estimated barrels per fermenter",
    required: false,
  })
  estBblsPerFerm?: number;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiProperty({
    description: "Estimated proof gallons per bushel",
    required: false,
  })
  estPGsPerBshl?: number;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiProperty({
    description: "Estimated proof gallons per barrel",
    required: false,
  })
  estPGsPerBbl?: number;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: "Upper control limit", required: false })
  upperControlLimit?: number;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: "Lower control limit", required: false })
  lowerControlLimit?: number;
}

@InputType()
export class RecipeWizardInput {
  @Field(() => String)
  @IsString()
  @ApiProperty({ description: "Recipe ID" })
  id!: string;

  @Field(() => String)
  @IsString()
  @ApiProperty({ description: "Recipe name" })
  Recipe!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @ApiProperty({ description: "Whiskey type", required: false })
  whiskeyType?: string;
}

@InputType()
export class BomItemWizardInput {
  @Field(() => String)
  @IsString()
  @ApiProperty({ description: "BOM item ID" })
  id!: string;

  @Field(() => String)
  @IsString()
  @ApiProperty({ description: "Item code" })
  itemCode!: string;

  @Field(() => String)
  @IsString()
  @ApiProperty({ description: "Item name" })
  name!: string;

  @Field(() => Number)
  @IsNumber()
  @ApiProperty({ description: "Quantity required" })
  quantity!: number;

  @Field(() => String)
  @IsString()
  @ApiProperty({ description: "Unit of measurement" })
  unit!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @ApiProperty({ description: "Item category", required: false })
  category?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @ApiProperty({ description: "Item group", required: false })
  itemGroup?: string;
}

@InputType()
export class BinConfigurationWizardInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @ApiProperty({ description: "SIL110 configuration ID", required: false })
  sil110ConfigId?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @ApiProperty({ description: "SIL115 configuration ID", required: false })
  sil115ConfigId?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @ApiProperty({ description: "SIL120 configuration ID", required: false })
  sil120ConfigId?: string;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: "Total number of cooks", required: false })
  totalCooks?: number;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: "Total number of fermenters", required: false })
  totalFermenters?: number;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: "Cooks per fermenter", required: false })
  cooksPerFermenter?: number;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: "Entry proof", required: false })
  entryProof?: number;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: "Proof gallons per barrel", required: false })
  proofGallonsPerBarrel?: number;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: "Barrels per fermenter", required: false })
  barrelsPerFermenter?: number;
}

@InputType()
export class ScheduleOrderWizardInput {
  @Field(() => String)
  @IsDateString()
  @ApiProperty({ description: "Estimated start time" })
  estimatedStart!: string;

  @Field(() => String)
  @IsDateString()
  @ApiProperty({ description: "Estimated end time" })
  estimatedEnd!: string;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: "Total barrels", required: false })
  totalBarrels?: number;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: "Total proof gallons", required: false })
  totalProofGallons?: number;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: "Duration in specified units", required: false })
  duration?: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @ApiProperty({
    description: "Duration units (hours, days, etc.)",
    required: false,
  })
  durationUnits?: string;
}

@InputType()
export class MetadataWizardInput {
  @Field(() => String)
  @IsString()
  @ApiProperty({ description: "User who created the order" })
  createdBy!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @ApiProperty({ description: "Source of the request", required: false })
  source?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @ApiProperty({ description: "Version of the wizard", required: false })
  version?: string;
}

@InputType()
export class CreateProductionOrderWizardInput {
  @Field(() => ProductionOrderWizardInput)
  @ValidateNested()
  @Type(() => ProductionOrderWizardInput)
  @ApiProperty({ description: "Production order details" })
  productionOrder!: ProductionOrderWizardInput;

  @Field(() => RecipeWizardInput)
  @ValidateNested()
  @Type(() => RecipeWizardInput)
  @ApiProperty({ description: "Recipe information" })
  recipe!: RecipeWizardInput;

  @Field(() => [BomItemWizardInput])
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BomItemWizardInput)
  @ApiProperty({
    description: "BOM items for the production order",
    type: [BomItemWizardInput],
  })
  bomItems!: BomItemWizardInput[];

  @Field(() => BinConfigurationWizardInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => BinConfigurationWizardInput)
  @ApiProperty({ description: "Bin configuration settings", required: false })
  binConfigurations?: BinConfigurationWizardInput;

  @Field(() => ScheduleOrderWizardInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => ScheduleOrderWizardInput)
  @ApiProperty({ description: "Schedule order information", required: false })
  scheduleOrder?: ScheduleOrderWizardInput;

  @Field(() => MetadataWizardInput)
  @ValidateNested()
  @Type(() => MetadataWizardInput)
  @ApiProperty({ description: "Request metadata" })
  metadata!: MetadataWizardInput;

  @Field(() => Boolean, { nullable: true })
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: "Automatically schedule the order",
    required: false,
  })
  autoSchedule?: boolean;
}

@ArgsType()
export class CreateProductionOrderWizardArgs {
  @Field(() => CreateProductionOrderWizardInput)
  @ValidateNested()
  @Type(() => CreateProductionOrderWizardInput)
  @ApiProperty({ description: "Production order wizard data" })
  data!: CreateProductionOrderWizardInput;
}
