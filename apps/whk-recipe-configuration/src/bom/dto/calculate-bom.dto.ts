import { ApiProperty } from "@nestjs/swagger";
import { IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CalculateBomDto {
  @ApiProperty({
    required: true,
    type: String,
    description: "Recipe ID",
  })
  @IsString()
  recipeId!: string;

  @ApiProperty({
    required: false,
    type: String,
    description: "Recipe BOM ID (optional, defaults to highest revision)",
  })
  @IsOptional()
  @IsString()
  recipeBomId?: string;

  @ApiProperty({
    required: true,
    type: String,
    description: "Container type",
  })
  @IsString()
  containerType!: string;

  @ApiProperty({
    required: false,
    type: String,
    description: "Container item ID (optional)",
  })
  @IsOptional()
  @IsString()
  containerItemId?: string;

  @ApiProperty({
    required: true,
    type: Number,
    description: "Order quantity",
  })
  @IsNumber()
  @Min(0)
  orderQuantity!: number;

  @ApiProperty({
    required: true,
    type: Number,
    description: "Total grain weight in lbs",
  })
  @IsNumber()
  @Min(0)
  totalGrainWeight!: number;

  @ApiProperty({
    required: true,
    type: Number,
    description: "Total cooks",
  })
  @IsNumber()
  @Min(0)
  totalCooks!: number;

  @ApiProperty({
    required: true,
    type: Number,
    description: "Total fermenters",
  })
  @IsNumber()
  @Min(0)
  totalFermenters!: number;
}

export class CalculatedBomItemDto {
  @ApiProperty({
    type: String,
    description: "Item ID",
  })
  itemId!: string;

  @ApiProperty({
    type: String,
    description: "Item number",
  })
  itemNumber!: string;

  @ApiProperty({
    type: String,
    description: "Item name",
  })
  itemName!: string;

  @ApiProperty({
    type: String,
    description: "Item type",
  })
  itemType!: string;

  @ApiProperty({
    type: Number,
    description: "Original recipe BOM quantity",
  })
  originalQuantity!: number;

  @ApiProperty({
    type: Number,
    description: "Calculated actual quantity",
  })
  calculatedQuantity!: number;

  @ApiProperty({
    type: String,
    description: "Units of measure",
  })
  units!: string;

  constructor(partial: Partial<CalculatedBomItemDto>) {
    Object.assign(this, partial);
  }
}

export class CalculatedBomDto {
  @ApiProperty({
    type: String,
    description: "Recipe ID",
  })
  recipeId!: string;

  @ApiProperty({
    type: String,
    description: "Recipe BOM ID",
  })
  recipeBomId!: string;

  @ApiProperty({
    type: [CalculatedBomItemDto],
    description: "Calculated BOM items",
  })
  items!: CalculatedBomItemDto[];

  constructor(partial: Partial<CalculatedBomDto>) {
    Object.assign(this, partial);
  }
}
