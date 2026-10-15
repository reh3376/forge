import { ApiProperty } from "@nestjs/swagger";
import { RecipeBom } from "../../recipeBom/base/RecipeBom";
import { RecipeBomItem } from "../../recipeBomItem/base/RecipeBomItem";

export class RecipeBomItemResponseDto {
  @ApiProperty({
    description: "Item ID",
  })
  itemId = "";

  @ApiProperty({
    description: "Item number",
  })
  itemNumber = "";

  @ApiProperty({
    description: "Item name",
  })
  itemName = "";

  @ApiProperty({
    description: "Item quantity",
  })
  quantity = 0;

  @ApiProperty({
    description: "Operation type",
  })
  operation = "";
}

export class RecipeBomResponseDto {
  @ApiProperty({
    description: "ID of the created recipe BOM",
  })
  id = "";

  @ApiProperty({
    description: "Revision string of the recipe BOM",
  })
  revision = "";

  @ApiProperty({
    description: "Items in the recipe BOM",
    type: [RecipeBomItemResponseDto],
  })
  items: RecipeBomItemResponseDto[] = [];

  constructor(partial: Partial<RecipeBomResponseDto>) {
    Object.assign(this, partial);
  }

  static fromEntity(
    recipeBom: RecipeBom & { recipeBomITem: (RecipeBomItem & { item: any })[] }
  ): RecipeBomResponseDto {
    return new RecipeBomResponseDto({
      id: recipeBom.id,
      revision: recipeBom.revision || "",
      items: recipeBom.recipeBomITem.map((bomItem) => ({
        itemId: bomItem.item?.id || "",
        itemNumber: bomItem.item?.itemNumber || "",
        itemName: bomItem.item?.itemName || "",
        quantity: bomItem.quantity || 0,
        operation: bomItem.operation || "",
      })),
    });
  }
}
