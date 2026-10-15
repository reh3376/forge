import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
  IsString,
} from "class-validator";
import { UpdateEnzymeConfigurationDto } from "./update-enzyme-configuration.dto";

export class BulkUpdateItemDto {
  @ApiProperty({
    description: "ID of the enzyme configuration to update",
    example: "config123",
  })
  @IsString()
  id!: string;

  @ApiProperty({
    description: "Update data for the enzyme configuration",
    type: UpdateEnzymeConfigurationDto,
  })
  @ValidateNested()
  @Type(() => UpdateEnzymeConfigurationDto)
  data!: UpdateEnzymeConfigurationDto;
}

export class BulkUpdateEnzymeConfigurationDto {
  @ApiProperty({
    description: "Array of enzyme configuration updates",
    type: [BulkUpdateItemDto],
    minItems: 1,
    maxItems: 50,
    example: [
      {
        id: "config123",
        data: {
          dosePerMetricTon: 0.75,
          instructions: "Updated instructions",
          updatedBy: "user123",
        },
      },
      {
        id: "config456",
        data: {
          active: false,
          updatedBy: "user123",
        },
      },
    ],
  })
  @IsArray()
  @ArrayMinSize(1, {
    message: "At least one enzyme configuration update is required",
  })
  @ArrayMaxSize(50, {
    message:
      "Maximum 50 enzyme configuration updates allowed per bulk operation",
  })
  @ValidateNested({ each: true })
  @Type(() => BulkUpdateItemDto)
  updates!: BulkUpdateItemDto[];
}

export class BulkUpdateResponseDto {
  @ApiProperty({
    description: "Successfully updated enzyme configurations",
    type: "array",
    items: { type: "object" },
  })
  updated!: any[];

  @ApiProperty({
    description: "Failed enzyme configuration updates with error details",
    type: "array",
    items: {
      type: "object",
      properties: {
        index: { type: "number", description: "Index in the original array" },
        id: { type: "string", description: "ID that failed to update" },
        data: {
          type: "object",
          description: "Original update data that failed",
        },
        error: { type: "string", description: "Error message" },
      },
    },
  })
  failed!: Array<{
    index: number;
    id: string;
    data: UpdateEnzymeConfigurationDto;
    error: string;
  }>;

  @ApiProperty({
    description: "Summary of the bulk update operation",
    type: "object",
    properties: {
      total: {
        type: "number",
        description: "Total number of configurations processed",
      },
      successful: {
        type: "number",
        description: "Number of successfully updated configurations",
      },
      failed: { type: "number", description: "Number of failed updates" },
    },
  })
  summary!: {
    total: number;
    successful: number;
    failed: number;
  };
}
