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

/** Result of lookupLotOrInventory — identifies the inventory record matching a scanned code and indicates FIFO compliance. */
@ObjectType()
export class LotLookupResult {
  @Field(() => LotLookupType, {
    description:
      "How the code was resolved: INVENTORY_ID (UUID matched directly), SUPPLIER_LOT (matched by lot number), or NOT_FOUND",
  })
  type!: LotLookupType;

  @Field(() => String, {
    nullable: true,
    description: "Internal UUID of the matched Inventory record",
  })
  inventoryId?: string;

  @Field(() => String, {
    nullable: true,
    description: "Supplier-assigned lot number for the matched inventory",
  })
  lotNumber?: string;

  @Field(() => String, {
    nullable: true,
    description: "Display name of the item in this inventory record",
  })
  itemName?: string;

  @Field(() => String, {
    nullable: true,
    description: "Name of the storage asset (silo or bin) where this lot is held",
  })
  assetName?: string;

  @Field(() => Int, {
    nullable: true,
    description: "Current remaining quantity in this inventory record",
  })
  currentQuantity?: number;

  @Field(() => String, {
    nullable: true,
    description: "Unit of measure for currentQuantity (e.g. lbs, bu)",
  })
  quantityUnit?: string;

  @Field(() => Int, {
    nullable: true,
    description:
      "FIFO ordering index — lower values indicate older receipts that should be consumed first",
  })
  fifoIndex?: number;

  @Field(() => Boolean, {
    description:
      "True when this record has the lowest fifoIndex among all non-zero lots for the same item+asset — i.e. it is the FIFO-recommended lot",
  })
  isRecommended!: boolean;

  @Field(() => Int, {
    nullable: true,
    description: "Alias for currentQuantity — available quantity remaining in this lot",
  })
  availableQuantity?: number;
}

// --- Mutation inputs ---

/** Input for the recordBomConsumption mutation. */
@InputType()
export class RecordBomConsumptionInput {
  @Field(() => String, { description: "ID of the RecipeBomItem being consumed" })
  recipeBomItemId!: string;

  @Field(() => String, {
    description: "ID of the active ScheduleOrderRecipeInstance this consumption belongs to",
  })
  scheduleOrderRecipeInstanceId!: string;

  @Field(() => Float, { description: "Actual quantity consumed (must be > 0)" })
  quantityActual!: number;

  @Field(() => String, {
    nullable: true,
    description: "Supplier lot number. Required when inventoryId is not provided",
  })
  lotNumber?: string;

  @Field(() => String, {
    nullable: true,
    description:
      "Inventory record UUID. When provided, currentQuantity is decremented after recording",
  })
  inventoryId?: string;

  @Field(() => Float, {
    nullable: true,
    description: "Planned quantity from the BOM item — stored for variance reporting",
  })
  quantityPlanned?: number;

  @Field(() => Date, {
    nullable: true,
    description: "When the material was physically consumed; defaults to now if omitted",
  })
  consumedAt?: Date;

  @Field(() => String, {
    nullable: true,
    description: "Optional operator notes (e.g. reason for over-consumption, quality remarks)",
  })
  notes?: string;

  @Field(() => String, {
    description: "Email of the authenticated user recording the consumption",
  })
  createdBy!: string;
}

/** Input for the updateBomConsumption mutation. All fields are optional — only provided fields are updated. */
@InputType()
export class UpdateBomConsumptionInput {
  @Field(() => Float, {
    nullable: true,
    description: "Corrected quantity. Inventory is adjusted by the delta (new - old)",
  })
  quantityActual?: number;

  @Field(() => String, { nullable: true, description: "Corrected supplier lot number" })
  lotNumber?: string;

  @Field(() => String, {
    nullable: true,
    description: "Corrected inventory record UUID. Inventory adjustment uses this ID",
  })
  inventoryId?: string;

  @Field(() => Date, {
    nullable: true,
    description: "Corrected consumption timestamp",
  })
  consumedAt?: Date;

  @Field(() => String, { nullable: true, description: "Updated operator notes" })
  notes?: string;

  @Field(() => String, {
    nullable: true,
    description: "Email of the user making the edit — written to updatedBy and the audit log",
  })
  updatedBy?: string;
}
