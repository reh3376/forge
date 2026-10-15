import { ApiProperty } from "@nestjs/swagger";
import {
  IsString,
  IsNumber,
  IsOptional,
  Min,
  IsEnum,
  IsArray,
  ValidateIf,
  ArrayMinSize,
} from "class-validator";
import { EnumProductionOrderContainerType } from "@prisma/client";

export class CreateProductionOrderWithScheduleDto {
  @ApiProperty({
    required: true,
    description: "The recipe ID to use for the production order",
  })
  @IsString()
  recipeId!: string;

  @ApiProperty({
    required: true,
    description: "The item ID to produce",
  })
  @IsString()
  itemId!: string;

  @ApiProperty({
    required: false,
    description:
      "The BOM ID to use for the production order. If not provided, a BOM will be created from the recipe BOM",
  })
  @IsString()
  @IsOptional()
  bomId?: string;

  @ApiProperty({
    required: true,
    description: "The customer ID for the production order",
  })
  @IsString()
  customerId!: string;

  @ApiProperty({
    required: true,
    description: "The order quantity (in barrels)",
    type: Number,
  })
  @IsNumber()
  @Min(1)
  orderQty!: number;

  @ApiProperty({
    required: true,
    description: "The number of barrels per fermentation",
    type: Number,
  })
  @IsNumber()
  @Min(1)
  bblsPerFerm!: number;

  @ApiProperty({
    required: true,
    description: "The final proof of the product",
    type: Number,
  })
  @IsNumber()
  finalProof!: number;

  @ApiProperty({
    required: true,
    description: "The container type for the product",
    enum: EnumProductionOrderContainerType,
  })
  @IsEnum(EnumProductionOrderContainerType)
  containerType!: EnumProductionOrderContainerType;

  @ApiProperty({
    required: false,
    description:
      "List of container item IDs. Required if containerType is LargeBarrel.",
    type: [String],
  })
  @IsArray()
  @ValidateIf(
    (o) => o.containerType === EnumProductionOrderContainerType.LargeBarrel
  )
  @ArrayMinSize(1, {
    message: "At least one container item is required for large barrel",
  })
  @IsString({ each: true })
  containerItems?: string[];

  @ApiProperty({
    required: false,
    description: "The recipe group ID (will be looked up if not provided)",
  })
  @IsString()
  @IsOptional()
  recipeGroupId?: string;

  @ApiProperty({
    required: false,
    description: "Username of the creator",
    default: "system",
  })
  @IsString()
  @IsOptional()
  username: string = "system";
}
