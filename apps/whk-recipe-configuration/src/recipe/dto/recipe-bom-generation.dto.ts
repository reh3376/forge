import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsNumber, IsOptional, IsNotEmpty } from "class-validator";

export class RecipeBomGenerationDto {
  @ApiProperty({
    required: true,
    description: "Recipe string in the format 'CUS-70-20-00-10-v01'",
    example: "CUS-70-20-00-10-v01",
  })
  @IsString()
  @IsNotEmpty()
  recipeString = "";

  @ApiProperty({
    required: true,
    description: "Selected saccharification enzyme item ID (CUID)",
    example: "clzhhlsx30f09mbc9r5mj02z7",
  })
  @IsString()
  @IsNotEmpty()
  saccharificationEnzymeId = "";

  @ApiProperty({
    required: true,
    description: "Selected liquifaction enzyme item ID (CUID)",
    example: "clzhhlwfj0f8ysuwb7whvgy9s",
  })
  @IsString()
  @IsNotEmpty()
  liquifactionEnzymeId = "";

  @ApiProperty({
    required: true,
    description: "Selected viscosity enzyme item ID (CUID)",
    example: "clyd1ofou0024fd45e71gyxcu",
  })
  @IsString()
  @IsNotEmpty()
  viscosityEnzymeId = "";

  @ApiProperty({
    required: true,
    description: "Selected yeast item ID (CUID)",
    example: "clyd1ofvj0094fd458f9plrz2",
  })
  @IsString()
  @IsNotEmpty()
  yeastItemId = "";

  @ApiProperty({
    required: true,
    description: "Pounds of yeast per fermenter",
    example: 2.5,
  })
  @IsNumber()
  yeastPoundsPerFermenter = 0;

  @ApiProperty({
    required: true,
    description: "Username of creator",
    example: "john.doe",
  })
  @IsString()
  @IsNotEmpty()
  username = "";

  @ApiProperty({
    required: false,
    description:
      "Estimated total grain weight in pounds (for enzyme calculations)",
    example: 10000,
  })
  @IsNumber()
  @IsOptional()
  totalGrainWeight?: number;
}
