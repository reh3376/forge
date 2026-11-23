import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
} from "class-validator";
import { CreateEnzymeConfigurationDto } from "./create-enzyme-configuration.dto";

export class BulkCreateEnzymeConfigurationDto {
  @ApiProperty({
    description: "Array of enzyme configurations to create",
    type: [CreateEnzymeConfigurationDto],
    minItems: 1,
    maxItems: 50,
    example: [
      {
        itemId: "item123",
        category: "LIQUIFACTION",
        dosePerMetricTon: 0.5,
        instructions: "Add during mashing process",
        createdBy: "user123",
      },
      {
        itemId: "item456",
        category: "SACCHARIFICATION",
        dosePerMetricTon: 1.0,
        instructions: "Add after liquifaction",
        createdBy: "user123",
      },
    ],
  })
  @IsArray()
  @ArrayMinSize(1, { message: "At least one enzyme configuration is required" })
  @ArrayMaxSize(50, {
    message: "Maximum 50 enzyme configurations allowed per bulk operation",
  })
  @ValidateNested({ each: true })
  @Type(() => CreateEnzymeConfigurationDto)
  configurations!: CreateEnzymeConfigurationDto[];
}

export class BulkCreateResponseDto {
  @ApiProperty({
    description: "Successfully created enzyme configurations",
    type: "array",
    items: { type: "object" },
  })
  created!: any[];

  @ApiProperty({
    description: "Failed enzyme configurations with error details",
    type: "array",
    items: {
      type: "object",
      properties: {
        index: { type: "number", description: "Index in the original array" },
        data: { type: "object", description: "Original data that failed" },
        error: { type: "string", description: "Error message" },
      },
    },
  })
  failed!: Array<{
    index: number;
    data: CreateEnzymeConfigurationDto;
    error: string;
  }>;

  @ApiProperty({
    description: "Summary of the bulk operation",
    type: "object",
    properties: {
      total: {
        type: "number",
        description: "Total number of configurations processed",
      },
      successful: {
        type: "number",
        description: "Number of successfully created configurations",
      },
      failed: {
        type: "number",
        description: "Number of failed configurations",
      },
    },
  })
  summary!: {
    total: number;
    successful: number;
    failed: number;
  };
}
