import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsArray, ValidateNested, IsOptional } from "class-validator";
import { Type } from "class-transformer";

class RecipeBomItemDto {
  @ApiProperty({
    description: "Item ID",
  })
  @IsString()
  itemId: string = "";

  @ApiProperty({
    description: "Item name",
  })
  @IsString()
  name: string = "";

  @ApiProperty({
    description: "Item group/category",
    required: false,
  })
  @IsString()
  @IsOptional()
  itemGroup?: string;

  @ApiProperty({
    description: "Quantity of the item",
    required: false,
  })
  @IsOptional()
  quantity?: number;

  @ApiProperty({
    description: "Unit of measure",
    required: false,
  })
  @IsString()
  @IsOptional()
  unit?: string;
}

export class ValidateRecipeBomDto {
  @ApiProperty({
    description: "Recipe name (contains mash bill information)",
  })
  @IsString()
  recipeName: string = "";

  @ApiProperty({
    description: "List of recipe BOM items to validate",
    type: [RecipeBomItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeBomItemDto)
  recipeBomItems: RecipeBomItemDto[] = [];
}

export class ValidationResultDto {
  isValid: boolean = false;
  issues: string[] = [];
  mashBill?: string;
}
