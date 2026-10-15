import { ApiProperty } from "@nestjs/swagger";
import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  IsDateString,
  IsEnum,
  Min,
  IsObject,
  IsEmail,
  IsBoolean,
} from "class-validator";
import { Type } from "class-transformer";
import { EnumProductionOrderContainerType } from "@prisma/client";

export class ProductionOrderWizardDto {
  @ApiProperty({
    required: true,
    description: "The production order name/identifier",
  })
  @IsString()
  orderName!: string;

  @ApiProperty({
    required: true,
    description: "The quantity to produce",
    type: Number,
  })
  @IsNumber()
  @Min(1)
  quantity!: number;

  @ApiProperty({
    required: true,
    description: "The units ID for the production order",
  })
  @IsString()
  units!: string;

  @ApiProperty({
    required: false,
    description: "Priority level for the production order",
    default: "medium",
  })
  @IsString()
  @IsOptional()
  priority?: string;

  @ApiProperty({
    required: true,
    description: "Start date for the production order",
  })
  @IsDateString()
  startDate!: string;

  @ApiProperty({
    required: true,
    description: "End date for the production order",
  })
  @IsDateString()
  endDate!: string;

  @ApiProperty({
    required: true,
    description: "Customer code for the production order",
  })
  @IsString()
  customerCode!: string;

  @ApiProperty({
    required: false,
    description: "Additional notes for the production order",
  })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({
    required: true,
    description: "Final proof of the product",
    type: Number,
  })
  @IsNumber()
  finalProof!: number;

  @ApiProperty({
    required: true,
    description: "Container type for the product",
    enum: EnumProductionOrderContainerType,
  })
  @IsEnum(EnumProductionOrderContainerType)
  containerType!: EnumProductionOrderContainerType;

  @ApiProperty({
    required: true,
    description: "Number of fermenters",
    type: Number,
  })
  @IsNumber()
  @Min(1)
  fermenters!: number;

  @ApiProperty({
    required: true,
    description: "Number of cooks",
    type: Number,
  })
  @IsNumber()
  @Min(1)
  cooks!: number;

  @ApiProperty({
    required: true,
    description: "Total grain load",
    type: Number,
  })
  @IsNumber()
  totalGrainLoad!: number;

  @ApiProperty({
    required: true,
    description: "Estimated barrels per fermenter",
    type: Number,
  })
  @IsNumber()
  estBblsPerFerm!: number;

  @ApiProperty({
    required: true,
    description: "Estimated proof gallons per bushel",
    type: Number,
  })
  @IsNumber()
  estPGsPerBshl!: number;

  @ApiProperty({
    required: true,
    description: "Estimated proof gallons per barrel",
    type: Number,
  })
  @IsNumber()
  estPGsPerBbl!: number;

  @ApiProperty({
    required: true,
    description: "Upper control limit",
    type: Number,
  })
  @IsNumber()
  upperControlLimit!: number;

  @ApiProperty({
    required: true,
    description: "Lower control limit",
    type: Number,
  })
  @IsNumber()
  lowerControlLimit!: number;
}

export class RecipeWizardDto {
  @ApiProperty({
    required: true,
    description: "Recipe ID",
  })
  @IsString()
  id!: string;

  @ApiProperty({
    required: true,
    description: "Recipe name",
  })
  @IsString()
  Recipe!: string;

  @ApiProperty({
    required: true,
    description: "Whiskey type",
  })
  @IsString()
  whiskeyType!: string;
}

export class BomItemWizardDto {
  @ApiProperty({
    required: true,
    description: "BOM item ID",
  })
  @IsString()
  id!: string;

  @ApiProperty({
    required: true,
    description: "Item code",
  })
  @IsString()
  itemCode!: string;

  @ApiProperty({
    required: true,
    description: "Item name",
  })
  @IsString()
  name!: string;

  @ApiProperty({
    required: true,
    description: "Quantity required",
    type: Number,
  })
  @IsNumber()
  quantity!: number;

  @ApiProperty({
    required: true,
    description: "Unit of measurement",
  })
  @IsString()
  unit!: string;

  @ApiProperty({
    required: true,
    description: "Item category",
  })
  @IsString()
  category!: string;

  @ApiProperty({
    required: true,
    description: "Item group",
  })
  @IsString()
  itemGroup!: string;
}

export class BinConfigurationWizardDto {
  @ApiProperty({
    required: true,
    description: "Silo 110 configuration ID",
  })
  @IsString()
  sil110ConfigId!: string;

  @ApiProperty({
    required: true,
    description: "Silo 115 configuration ID",
  })
  @IsString()
  sil115ConfigId!: string;

  @ApiProperty({
    required: true,
    description: "Silo 120 configuration ID",
  })
  @IsString()
  sil120ConfigId!: string;

  @ApiProperty({
    required: true,
    description: "Total number of cooks",
    type: Number,
  })
  @IsNumber()
  totalCooks!: number;

  @ApiProperty({
    required: true,
    description: "Total number of fermenters",
    type: Number,
  })
  @IsNumber()
  totalFermenters!: number;

  @ApiProperty({
    required: true,
    description: "Cooks per fermenter",
    type: Number,
  })
  @IsNumber()
  cooksPerFermenter!: number;

  @ApiProperty({
    required: true,
    description: "Entry proof",
    type: Number,
  })
  @IsNumber()
  entryProof!: number;

  @ApiProperty({
    required: true,
    description: "Proof gallons per barrel",
    type: Number,
  })
  @IsNumber()
  proofGallonsPerBarrel!: number;

  @ApiProperty({
    required: true,
    description: "Barrels per fermenter",
    type: Number,
  })
  @IsNumber()
  barrelsPerFermenter!: number;
}

export class ScheduleOrderWizardDto {
  @ApiProperty({
    required: true,
    description: "Estimated start time",
  })
  @IsDateString()
  estimatedStart!: string;

  @ApiProperty({
    required: true,
    description: "Estimated end time",
  })
  @IsDateString()
  estimatedEnd!: string;

  @ApiProperty({
    required: true,
    description: "Total barrels",
    type: Number,
  })
  @IsNumber()
  totalBarrels!: number;

  @ApiProperty({
    required: true,
    description: "Total proof gallons",
    type: Number,
  })
  @IsNumber()
  totalProofGallons!: number;

  @ApiProperty({
    required: true,
    description: "Duration in specified units",
    type: Number,
  })
  @IsNumber()
  duration!: number;

  @ApiProperty({
    required: true,
    description: "Duration units (e.g., hours, days)",
  })
  @IsString()
  durationUnits!: string;
}

export class MetadataWizardDto {
  @ApiProperty({
    required: true,
    description: "User who created the production order",
  })
  @IsEmail()
  createdBy!: string;

  @ApiProperty({
    required: true,
    description: "Source of the creation request",
  })
  @IsString()
  source!: string;

  @ApiProperty({
    required: true,
    description: "Version of the wizard",
  })
  @IsString()
  version!: string;
}

export class CreateProductionOrderWizardDto {
  @ApiProperty({
    required: true,
    description: "Production order details",
    type: ProductionOrderWizardDto,
  })
  @ValidateNested()
  @Type(() => ProductionOrderWizardDto)
  productionOrder!: ProductionOrderWizardDto;

  @ApiProperty({
    required: true,
    description: "Recipe information",
    type: RecipeWizardDto,
  })
  @ValidateNested()
  @Type(() => RecipeWizardDto)
  recipe!: RecipeWizardDto;

  @ApiProperty({
    required: true,
    description: "BOM items for the production order",
    type: [BomItemWizardDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BomItemWizardDto)
  bomItems!: BomItemWizardDto[];

  @ApiProperty({
    required: true,
    description: "Bin configuration details",
    type: BinConfigurationWizardDto,
  })
  @ValidateNested()
  @Type(() => BinConfigurationWizardDto)
  binConfigurations!: BinConfigurationWizardDto;

  @ApiProperty({
    required: true,
    description: "Schedule order details",
    type: ScheduleOrderWizardDto,
  })
  @ValidateNested()
  @Type(() => ScheduleOrderWizardDto)
  scheduleOrder!: ScheduleOrderWizardDto;

  @ApiProperty({
    required: true,
    description: "Metadata for the request",
    type: MetadataWizardDto,
  })
  @ValidateNested()
  @Type(() => MetadataWizardDto)
  metadata!: MetadataWizardDto;

  @ApiProperty({
    required: false,
    description: "Automatically schedule the order after creation",
    type: Boolean,
  })
  @IsBoolean()
  @IsOptional()
  autoSchedule?: boolean;
}
