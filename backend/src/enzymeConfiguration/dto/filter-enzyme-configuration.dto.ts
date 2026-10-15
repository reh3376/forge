import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional, IsBoolean, IsEnum, IsString } from "class-validator";
import { EnumEnzymeCategory } from "@prisma/client";

export class FilterEnzymeConfigurationDto {
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
}

export class FilterWithPaginationDto extends FilterEnzymeConfigurationDto {
  @ApiPropertyOptional({
    description: "Page number (1-based)",
    minimum: 1,
    default: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({
    description: "Number of items per page",
    minimum: 1,
    maximum: 100,
    default: 10,
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: "Field to sort by",
    example: "createdAt",
  })
  @IsOptional()
  @IsString()
  sortBy?: string = "createdAt";

  @ApiPropertyOptional({
    description: "Sort order",
    enum: ["asc", "desc"],
    example: "desc",
  })
  @IsOptional()
  @IsString()
  sortOrder?: "asc" | "desc" = "desc";
}
