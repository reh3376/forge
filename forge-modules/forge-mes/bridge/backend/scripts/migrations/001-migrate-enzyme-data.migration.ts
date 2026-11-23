import { MigrationParams } from "./umzug.config";

export async function up({ prisma }: MigrationParams): Promise<void> {
  console.log("Starting enzyme data migration...");

  // Define the hardcoded enzyme data from the codebase
  const enzymeData = [
    {
      category: "LIQUIFACTION",
      name: "Termamyl SC DS",
      dosePerMetricTon: 0.13,
      instructions: "with water/backset before grain",
      itemNumber: "ENZ-UNI01-Enzyme (Termamyl SC DS)",
      itemDescription: "Enzyme (Termamyl SC DS)",
    },
    {
      category: "LIQUIFACTION",
      name: "Liquozyme PRO HP DI",
      dosePerMetricTon: 0.185,
      instructions: "with water/backset before grain",
      itemNumber: "ENZ-UNI04-Enzyme (Liquozyme PRO HP DI)",
      itemDescription: "Enzyme (Liquozyme PRO HP DI)",
    },
    {
      category: "LIQUIFACTION",
      name: "Amylex 6T",
      dosePerMetricTon: 0.25,
      instructions: "with water/backset before grain",
      itemNumber: "ENZ-UNI05-Enzyme (Amylex 6T)",
      itemDescription: "Enzyme (Amylex 6T)",
    },
    {
      category: "LIQUIFACTION",
      name: "Alphalase THP",
      dosePerMetricTon: 1.0,
      instructions: "with water/backset before grain",
      itemNumber: "ENZ-UNI06-Enzyme (Alphalase THP)",
      itemDescription: "Enzyme (Alphalase THP)",
    },
    {
      category: "SACCHARIFICATION",
      name: "Saczyme Pro 1.5X",
      dosePerMetricTon: 0.6,
      instructions: "at 152 degrees F on crash",
      itemNumber: "ENZ-UNI02-Enzyme (Saczyme Pro 1.5X)",
      itemDescription: "Enzyme (Saczyme Pro 1.5X)",
    },
    {
      category: "SACCHARIFICATION",
      name: "Saczyme Yield",
      dosePerMetricTon: 0.3,
      instructions: "at 152 degrees F on crash",
      itemNumber: "ENZ-UNI07-Enzyme (Saczyme Yield)",
      itemDescription: "Enzyme (Saczyme Yield)",
    },
    {
      category: "SACCHARIFICATION",
      name: "Diazyme SSF",
      dosePerMetricTon: 0.3,
      instructions: "at 152 degrees F on crash",
      itemNumber: "ENZ-UNI08-Enzyme (Diazyme SSF)",
      itemDescription: "Enzyme (Diazyme SSF)",
    },
    {
      category: "SACCHARIFICATION",
      name: "Diazyme SSF2",
      dosePerMetricTon: 0.8,
      instructions: "at 152 degrees F on crash",
      itemNumber: "ENZ-GUS02-Enzyme (Diazyme SSF2)",
      itemDescription: "Enzyme (Diazyme SSF2)",
    },
    {
      category: "VISCOSITY",
      name: "Viscoferm",
      dosePerMetricTon: 0.1,
      instructions: "at 152 degrees F on crash",
      itemNumber: "ENZ-UNI03-Enzyme (Viscoferm)",
      itemDescription: "Enzyme (Viscoferm)",
    },
    {
      category: "VISCOSITY",
      name: "Laminex C2K",
      dosePerMetricTon: 0.1,
      instructions: "at 152 degrees F on crash",
      itemNumber: "ENZ-GUS01-Enzyme (Laminex C2K)",
      itemDescription: "Enzyme (Laminex C2K)",
    },
  ];

  const migrationUser = "enzyme-migration-script";
  const now = new Date();
  let processedCount = 0;
  let skippedCount = 0;
  const missingItems: string[] = [];

  for (const enzyme of enzymeData) {
    console.log(`Processing enzyme: ${enzyme.name}`);

    // Check if Item already exists by itemNumber
    const existingItem = await prisma.item.findFirst({
      where: {
        itemNumber: enzyme.itemNumber,
      },
    });

    if (!existingItem) {
      console.error(
        `  ❌ ERROR: Item not found with itemNumber: ${enzyme.itemNumber}`
      );
      console.error(
        `     This item must be created in the ERP system first before running this migration.`
      );
      missingItems.push(enzyme.itemNumber);
      skippedCount++;
      continue;
    }

    console.log(`  ✅ Item found: ${existingItem.id}`);
    console.log(`     Current itemName: ${existingItem.itemName}`);
    console.log(
      `     Current itemDescription: ${existingItem.itemDescription}`
    );
    console.log(`     Current itemGroup: ${existingItem.itemGroup}`);
    console.log(
      `     🔒 CONSTRAINT: Cannot modify itemName, description, number, erpId, itemType, or itemClass`
    );

    const itemId = existingItem.id;

    // REMOVED: Item name and description updates - these are now prohibited
    // We can only set itemGroup to RM-ENZ if it's not already set
    if (existingItem.itemGroup !== "RM-ENZ") {
      await prisma.item.update({
        where: { id: existingItem.id },
        data: {
          itemGroup: "RM-ENZ",
          updatedAt: now,
          updatedBy: migrationUser,
        },
      });
      console.log(`  📝 Updated itemGroup to: RM-ENZ`);
    } else {
      console.log(`  ✅ itemGroup already set to: RM-ENZ`);
    }

    // Check if EnzymeConfiguration already exists for this item
    const existingConfig = await prisma.enzymeConfiguration.findFirst({
      where: {
        itemId: itemId,
      },
    });

    if (existingConfig) {
      console.log(
        `  🔄 EnzymeConfiguration already exists: ${existingConfig.id}`
      );

      // Update existing configuration to match our data
      await prisma.enzymeConfiguration.update({
        where: { id: existingConfig.id },
        data: {
          category: enzyme.category as any,
          dosePerMetricTon: enzyme.dosePerMetricTon,
          instructions: enzyme.instructions,
          active: true,
          updatedAt: now,
          updatedBy: migrationUser,
        },
      });
      console.log(`  📝 Updated existing EnzymeConfiguration`);
    } else {
      // Create new EnzymeConfiguration record
      const newConfig = await prisma.enzymeConfiguration.create({
        data: {
          itemId: itemId,
          category: enzyme.category as any,
          dosePerMetricTon: enzyme.dosePerMetricTon,
          instructions: enzyme.instructions,
          active: true,
          createdAt: now,
          createdBy: migrationUser,
          updatedAt: now,
          schemaVersion: "0001-a",
        },
      });
      console.log(`  ✅ Created new EnzymeConfiguration: ${newConfig.id}`);
    }

    processedCount++;
  }

  console.log("\n=== MIGRATION SUMMARY ===");
  console.log(`✅ Successfully processed: ${processedCount} enzymes`);
  console.log(`❌ Skipped (missing items): ${skippedCount} enzymes`);
  console.log(
    "🔒 CONSTRAINTS RESPECTED: Only itemGroup modified, itemName/description left unchanged"
  );

  if (missingItems.length > 0) {
    console.log("\n🚨 MISSING ITEMS - These must be created in ERP first:");
    missingItems.forEach((itemNumber) => {
      console.log(`   - ${itemNumber}`);
    });
    console.log(
      "\nPlease create these items in your ERP system and then re-run this migration."
    );
  }

  if (processedCount === 0 && skippedCount > 0) {
    throw new Error(
      "Migration failed: No items were processed. All required items are missing from the database."
    );
  }

  console.log("Enzyme data migration completed!");
}

export async function down({ prisma }: MigrationParams): Promise<void> {
  console.log("Rolling back enzyme data migration...");

  // Define the item numbers that were created/updated by this migration
  const enzymeItemNumbers = [
    "ENZ-UNI01-Enzyme (Termamyl SC DS)",
    "ENZ-UNI04-Enzyme (Liquozyme PRO HP DI)",
    "ENZ-UNI05-Enzyme (Amylex 6T)",
    "ENZ-UNI06-Enzyme (Alphalase THP)",
    "ENZ-UNI02-Enzyme (Saczyme Pro 1.5X)",
    "ENZ-UNI07-Enzyme (Saczyme Yield)",
    "ENZ-UNI08-Enzyme (Diazyme SSF)",
    "ENZ-GUS02-Enzyme (Diazyme SSF2)",
    "ENZ-UNI03-Enzyme (Viscoferm)",
    "ENZ-GUS01-Enzyme (Laminex C2K)",
  ];

  // Find all items that match our enzyme item numbers
  const enzymeItems = await prisma.item.findMany({
    where: {
      itemNumber: {
        in: enzymeItemNumbers,
      },
    },
  });

  // Delete EnzymeConfiguration records for these items
  for (const item of enzymeItems) {
    const deletedConfigs = await prisma.enzymeConfiguration.deleteMany({
      where: {
        itemId: item.id,
      },
    });
    console.log(
      `Deleted ${deletedConfigs.count} EnzymeConfiguration(s) for item: ${item.itemName}`
    );
  }

  // Note: We don't delete the Item records in rollback as they might be referenced elsewhere
  // We also don't rollback itemGroup changes as we don't know the original values
  console.log(
    "⚠️  Note: itemGroup changes are not rolled back (original values unknown)"
  );

  console.log("Enzyme data migration rollback completed!");
}
