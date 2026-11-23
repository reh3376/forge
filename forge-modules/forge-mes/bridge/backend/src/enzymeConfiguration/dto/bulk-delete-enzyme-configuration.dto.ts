import { ApiProperty } from "@nestjs/swagger";
import {
  IsArray,
  IsString,
  ArrayMinSize,
  ArrayMaxSize,
  IsOptional,
  IsBoolean,
} from "class-validator";

export class BulkDeleteEnzymeConfigurationDto {
  @ApiProperty({
    description: "Array of enzyme configuration IDs to delete",
    type: [String],
    minItems: 1,
    maxItems: 50,
    example: ["config123", "config456", "config789"],
  })
  @IsArray()
  @ArrayMinSize(1, {
    message: "At least one enzyme configuration ID is required",
  })
  @ArrayMaxSize(50, {
    message: "Maximum 50 enzyme configuration IDs allowed per bulk operation",
  })
  @IsString({ each: true, message: "Each ID must be a string" })
  ids!: string[];

  @ApiProperty({
    description: "User ID performing the deletion (required for soft delete)",
    example: "user123",
  })
  @IsString()
  updatedBy!: string;

  @ApiProperty({
    description:
      "Whether to perform hard delete (permanent) or soft delete (set active to false)",
    default: false,
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  hardDelete?: boolean = false;
}

export class BulkDeleteResponseDto {
  @ApiProperty({
    description: "Successfully deleted enzyme configuration IDs",
    type: [String],
    example: ["config123", "config456"],
  })
  deleted!: string[];

  @ApiProperty({
    description: "Failed enzyme configuration deletions with error details",
    type: "array",
    items: {
      type: "object",
      properties: {
        index: { type: "number", description: "Index in the original array" },
        id: { type: "string", description: "ID that failed to delete" },
        error: { type: "string", description: "Error message" },
      },
    },
  })
  failed!: Array<{
    index: number;
    id: string;
    error: string;
  }>;

  @ApiProperty({
    description: "Summary of the bulk delete operation",
    type: "object",
    properties: {
      total: {
        type: "number",
        description: "Total number of configurations processed",
      },
      successful: {
        type: "number",
        description: "Number of successfully deleted configurations",
      },
      failed: { type: "number", description: "Number of failed deletions" },
      deleteType: {
        type: "string",
        description: "Type of deletion performed (soft or hard)",
      },
    },
  })
  summary!: {
    total: number;
    successful: number;
    failed: number;
    deleteType: "soft" | "hard";
  };
}
