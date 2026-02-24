import { MigrationParams } from "./umzug.config";
import { EnzymeItemValidator } from "../../src/enzymeConfiguration/utils/enzyme-item-validator";

/**
 * CORRECTED: Pre-migration script to ensure enzyme items have correct itemGroup
 * This script ONLY sets itemGroup to "RM-ENZ" for existing enzyme items
 * CONSTRAINTS: Cannot modify itemName, description, number, erpId, itemType, or itemClass
 * Run this BEFORE the enzyme configuration migration
 */

export async function up({ prisma }: MigrationParams): Promise<void> {
  console.log("Starting enzyme item group correction migration...");

  // Get standardized enzyme items from our validator (ensures consistency)
  const standardizedItems = EnzymeItemValidator.getStandardizedEnzymeItems();

  // Extract only the ERP IDs to find existing items
  const enzymeErpIds = standardizedItems.map((item) => item.erpId);

  const migrationUser = "enzyme-item-group-correction-script";
  const now = new Date();
  let updatedCount = 0;
  let notFoundCount = 0;
  let alreadyCorrectCount = 0;

  console.log(`Looking for ${enzymeErpIds.length} enzyme items by ERP ID...`);

  for (const erpId of enzymeErpIds) {
    console.log(`Processing enzyme with ERP ID: ${erpId}`);

    // Find existing item by erpId (primary identifier)
    const existingItem = await prisma.item.findFirst({
      where: {
        erpId: erpId,
      },
    });

    if (!existingItem) {
      console.log(`  ❌ Item not found with ERP ID: ${erpId}`);
      console.log(`     This item must exist in the ERP system first.`);
      notFoundCount++;
      continue;
    }

    console.log(
      `  ✅ Item found: ${existingItem.itemName} (${existingItem.erpId})`
    );
    console.log(`     Current itemGroup: ${existingItem.itemGroup}`);
    console.log(`     Current itemClass: ${existingItem.itemClass}`);
    console.log(`     Current itemType: ${existingItem.itemType}`);

    // Check if itemGroup is already correct
    if (existingItem.itemGroup === "RM-ENZ") {
      console.log(`  ✅ Item already has correct itemGroup: RM-ENZ`);
      alreadyCorrectCount++;
      continue;
    }

    // ONLY update itemGroup - DO NOT modify any other fields
    await prisma.item.update({
      where: { id: existingItem.id },
      data: {
        itemGroup: "RM-ENZ",
        updatedAt: now,
        updatedBy: migrationUser,
      },
    });
    console.log(
      `  📝 Updated itemGroup from '${existingItem.itemGroup}' to 'RM-ENZ'`
    );
    console.log(
      `  🔒 Left unchanged: itemName, description, number, erpId, itemType, itemClass`
    );
    updatedCount++;
  }

  console.log("\n=== ENZYME ITEM GROUP CORRECTION SUMMARY ===");
  console.log(`✅ Updated itemGroup: ${updatedCount} enzyme items`);
  console.log(`✅ Already correct: ${alreadyCorrectCount} enzyme items`);
  console.log(`❌ Not found: ${notFoundCount} enzyme items`);
  console.log(`📦 Total processed: ${enzymeErpIds.length} enzyme ERP IDs`);
  console.log(
    "🔒 CONSTRAINTS RESPECTED: Only itemGroup modified, all other fields left unchanged"
  );

  if (notFoundCount > 0) {
    console.log(
      "\n⚠️  Some enzyme items were not found. They may need to be created in the ERP system first."
    );
  }

  console.log("Enzyme item group correction migration completed!");
}

export async function down({ prisma }: MigrationParams): Promise<void> {
  console.log("Rolling back enzyme item group correction migration...");

  // Get standardized ERP IDs from our validator
  const standardizedItems = EnzymeItemValidator.getStandardizedEnzymeItems();
  const enzymeErpIds = standardizedItems.map((item) => item.erpId);

  // Find items that were updated by this migration
  const enzymeItems = await prisma.item.findMany({
    where: {
      erpId: {
        in: enzymeErpIds,
      },
      itemGroup: "RM-ENZ",
      updatedBy: "enzyme-item-group-correction-script",
    },
  });

  console.log(`Found ${enzymeItems.length} items to rollback...`);

  // Note: We cannot reliably rollback itemGroup changes without knowing the original value
  // This is a limitation of only tracking the current state
  console.log(
    "⚠️  WARNING: Cannot reliably rollback itemGroup changes without original values"
  );
  console.log(
    "⚠️  Manual review may be required to restore original itemGroup values"
  );

  // If you need to rollback, you would need to manually set itemGroup values
  // based on your business rules or backup data

  for (const item of enzymeItems) {
    console.log(
      `Item: ${item.itemName} (${item.erpId}) - Current itemGroup: ${item.itemGroup}`
    );
  }

  console.log("Enzyme item group correction migration rollback completed!");
}
