import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsOptional,
  IsString,
  IsBoolean,
  IsEnum,
  IsNumber,
  Min,
  Max,
} from "class-validator";
import { EnumEnzymeCategory } from "@prisma/client";

export class SearchEnzymeConfigurationDto {
  @ApiPropertyOptional({
    description: "Search term for item name (case-insensitive partial match)",
    example: "Liquozyme",
  })
  @IsOptional()
  @IsString()
  itemName?: string;

  @ApiPropertyOptional({
    description: "Search term for item number (case-insensitive partial match)",
    example: "ENZ001",
  })
  @IsOptional()
  @IsString()
  itemNumber?: string;

  @ApiPropertyOptional({
    description: "Filter by enzyme category",
    enum: EnumEnzymeCategory,
    example: "LIQUIFACTION",
  })
  @IsOptional()
  @IsEnum(EnumEnzymeCategory)
  category?: EnumEnzymeCategory;

  @ApiPropertyOptional({
    description: "Filter by active status",
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  active?: boolean;

  @ApiPropertyOptional({
    description: "Minimum dose per metric ton",
    example: 0.1,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  minDose?: number;

  @ApiPropertyOptional({
    description: "Maximum dose per metric ton",
    example: 10.0,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  maxDose?: number;

  @ApiPropertyOptional({
    description:
      "Search term for instructions (case-insensitive partial match)",
    example: "mash",
  })
  @IsOptional()
  @IsString()
  instructions?: string;

  @ApiPropertyOptional({
    description: "Filter by schema version",
    example: "0001-a",
  })
  @IsOptional()
  @IsString()
  schemaVersion?: string;

  @ApiPropertyOptional({
    description: "Filter by creator user ID",
    example: "user123",
  })
  @IsOptional()
  @IsString()
  createdBy?: string;

  @ApiPropertyOptional({
    description: "Filter by last updater user ID",
    example: "user456",
  })
  @IsOptional()
  @IsString()
  updatedBy?: string;

  @ApiPropertyOptional({
    description: "Filter by creation date (from)",
    example: "2024-01-01",
  })
  @IsOptional()
  @IsString()
  createdAfter?: string;

  @ApiPropertyOptional({
    description: "Filter by creation date (to)",
    example: "2024-12-31",
  })
  @IsOptional()
  @IsString()
  createdBefore?: string;

  @ApiPropertyOptional({
    description: "Filter by update date (from)",
    example: "2024-01-01",
  })
  @IsOptional()
  @IsString()
  updatedAfter?: string;

  @ApiPropertyOptional({
    description: "Filter by update date (to)",
    example: "2024-12-31",
  })
  @IsOptional()
  @IsString()
  updatedBefore?: string;
}
