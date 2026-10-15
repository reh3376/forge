import { ApiProperty } from "@nestjs/swagger";
import { EnumEnzymeCategory } from "@prisma/client";

export class EnzymeConfigurationResponseDto {
  @ApiProperty({
    description: "Unique identifier for the enzyme configuration",
    example: "clzhhlsx30f09mbc9r5mj02z7",
  })
  id = "";

  @ApiProperty({
    description: "Global unique identifier",
    example: "clzhhlsx30f09mbc9r5mj02z8",
  })
  globalId?: string;

  @ApiProperty({
    description: "Associated item ID",
    example: "clzhhlsx30f09mbc9r5mj02z9",
  })
  itemId = "";

  @ApiProperty({
    description: "Category of the enzyme",
    enum: EnumEnzymeCategory,
    example: "LIQUIFACTION",
  })
  category: EnumEnzymeCategory = EnumEnzymeCategory.LIQUIFACTION;

  @ApiProperty({
    description: "Dose per metric ton of grain",
    example: 0.13,
  })
  dosePerMetricTon = 0;

  @ApiProperty({
    description: "Instructions for enzyme application",
    example: "with water/backset before grain",
  })
  instructions = "";

  @ApiProperty({
    description: "Whether the configuration is active",
    example: true,
  })
  active = true;

  @ApiProperty({
    description: "Creation timestamp",
    example: "2024-01-01T00:00:00.000Z",
  })
  createdAt = new Date();

  @ApiProperty({
    description: "Username of the creator",
    example: "john.doe",
  })
  createdBy = "";

  @ApiProperty({
    description: "Last update timestamp",
    example: "2024-01-01T00:00:00.000Z",
  })
  updatedAt = new Date();

  @ApiProperty({
    description: "Username of the last updater",
    example: "jane.doe",
    required: false,
  })
  updatedBy?: string;

  @ApiProperty({
    description: "Schema version",
    example: "0001-a",
    required: false,
  })
  schemaVersion?: string;

  @ApiProperty({
    description: "Associated item information",
    required: false,
  })
  item?: {
    id: string;
    itemName?: string;
    itemNumber?: string;
  };

  constructor(partial: Partial<EnzymeConfigurationResponseDto>) {
    Object.assign(this, partial);
  }

  static fromEntity(entity: any): EnzymeConfigurationResponseDto {
    return new EnzymeConfigurationResponseDto({
      id: entity.id,
      globalId: entity.globalId,
      itemId: entity.itemId,
      category: entity.category,
      dosePerMetricTon: entity.dosePerMetricTon,
      instructions: entity.instructions,
      active: entity.active,
      createdAt: entity.createdAt,
      createdBy: entity.createdBy,
      updatedAt: entity.updatedAt,
      updatedBy: entity.updatedBy,
      schemaVersion: entity.schemaVersion,
      item: entity.item
        ? {
            id: entity.item.id,
            itemName: entity.item.itemName,
            itemNumber: entity.item.itemNumber,
          }
        : undefined,
    });
  }
}
