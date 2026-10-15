import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class GenerateRecipeBomDto {
  @ApiProperty({
    description: "Recipe name (contains mash bill information)",
    example: "Straight Bourbon 70-21-00-09",
  })
  @IsString()
  recipeName: string = "";
}

export class BomItemSuggestion {
  @ApiProperty({
    description: "Item name",
  })
  name: string = "";

  @ApiProperty({
    description: "Item group/category",
    required: false,
  })
  itemGroup?: string;

  @ApiProperty({
    description: "Suggested quantity",
    required: false,
  })
  quantity?: number;

  @ApiProperty({
    description: "Unit of measure",
    required: false,
  })
  unit?: string = "";

  @ApiProperty({
    description: "Type of ingredient (grain, water, backset, etc.)",
    required: false,
  })
  type: string = "";

  @ApiProperty({
    description: "Percentage in mash bill (for grains)",
    required: false,
  })
  percentage?: number;
}

export class GenerateRecipeBomResultDto {
  @ApiProperty({
    description: "Extracted mash bill from recipe name",
    example: "70-21-00-09",
  })
  mashBill: string = "";

  @ApiProperty({
    description: "Corn percentage",
    example: 70,
  })
  cornPct: number = 0;

  @ApiProperty({
    description: "Rye percentage",
    example: 21,
  })
  ryePct: number = 0;

  @ApiProperty({
    description: "Wheat percentage",
    example: 0,
  })
  wheatPct: number = 0;

  @ApiProperty({
    description: "Malt percentage",
    example: 9,
  })
  maltPct: number = 0;

  @ApiProperty({
    description: "Suggested recipe BOM items",
    type: [BomItemSuggestion],
  })
  suggestedItems: BomItemSuggestion[] = [];

  @ApiProperty({
    description: "Whether mash bill was successfully parsed",
    example: true,
  })
  success: boolean = false;

  @ApiProperty({
    description: "Error message if parsing failed",
    required: false,
  })
  error?: string;
}
