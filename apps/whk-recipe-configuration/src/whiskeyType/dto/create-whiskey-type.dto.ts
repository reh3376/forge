import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  MaxLength,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateWhiskeyTypeDto {
  @ApiProperty({
    description: "Unique code for the whiskey type",
    example: "RB",
    maxLength: 10,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  code!: string;

  @ApiProperty({
    description: "Name of the whiskey type",
    example: "Rye Bourbon",
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    description: "Description of the whiskey type",
    example: "Bourbon whiskey with significant rye content",
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: "Category of the whiskey type",
    example: "Bourbon",
    required: false,
  })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiProperty({
    description: "Whether the whiskey type is active",
    example: true,
    required: false,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @ApiProperty({
    description: "Whether this whiskey type is an official TTB definition",
    example: true,
    required: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isTTBDefinition?: boolean;

  @ApiProperty({
    description: "ID of the parent TTB whiskey type category",
    example: "ckz1234567890",
    required: false,
  })
  @IsString()
  @IsOptional()
  ttbWhiskeyTypeId?: string;
}
