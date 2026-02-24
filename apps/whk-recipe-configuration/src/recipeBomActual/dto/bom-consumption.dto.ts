import {
  Field,
  InputType,
  ObjectType,
  Float,
  Int,
  registerEnumType,
} from "@nestjs/graphql";

// --- Enum ---

export enum LotLookupType {
  INVENTORY_ID = "INVENTORY_ID",
  SUPPLIER_LOT = "SUPPLIER_LOT",
  NOT_FOUND = "NOT_FOUND",
}

registerEnumType(LotLookupType, {
  name: "LotLookupType",
  description: "The type of match found during lot/inventory lookup",
});

// --- Query result ---

@ObjectType()
export class LotLookupResult {
  @Field(() => LotLookupType)
  type!: LotLookupType;

  @Field(() => String, { nullable: true })
  inventoryId?: string;

  @Field(() => String, { nullable: true })
  lotNumber?: string;

  @Field(() => String, { nullable: true })
  itemName?: string;

  @Field(() => String, { nullable: true })
  assetName?: string;

  @Field(() => Int, { nullable: true })
  currentQuantity?: number;

  @Field(() => String, { nullable: true })
  quantityUnit?: string;

  @Field(() => Int, { nullable: true })
  fifoIndex?: number;

  @Field(() => Boolean)
  isRecommended!: boolean;

  @Field(() => Int, { nullable: true })
  availableQuantity?: number;
}

// --- Mutation inputs ---

@InputType()
export class RecordBomConsumptionInput {
  @Field(() => String)
  recipeBomItemId!: string;

  @Field(() => String)
  scheduleOrderRecipeInstanceId!: string;

  @Field(() => Float)
  quantityActual!: number;

  @Field(() => String, { nullable: true })
  lotNumber?: string;

  @Field(() => String, { nullable: true })
  inventoryId?: string;

  @Field(() => Float, { nullable: true })
  quantityPlanned?: number;

  @Field(() => Date, { nullable: true })
  consumedAt?: Date;

  @Field(() => String, { nullable: true })
  notes?: string;

  @Field(() => String)
  createdBy!: string;
}

@InputType()
export class UpdateBomConsumptionInput {
  @Field(() => Float, { nullable: true })
  quantityActual?: number;

  @Field(() => String, { nullable: true })
  lotNumber?: string;

  @Field(() => String, { nullable: true })
  inventoryId?: string;

  @Field(() => Date, { nullable: true })
  consumedAt?: Date;

  @Field(() => String, { nullable: true })
  notes?: string;

  @Field(() => String, { nullable: true })
  updatedBy?: string;
}
