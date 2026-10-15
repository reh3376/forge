/**
 * Backfill missing displayUnits for Recipe BOM Items
 *
 * This script identifies RecipeBomItem records without displayUnitsId
 * and assigns appropriate units based on item group and operation.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Mapping of item groups/operations to default units
const UNIT_MAPPINGS = {
  // Barrels - use "Each" unit
  "RM-BBL": { unitName: "Each", abbreviation: "ea" },

  // Additives (Mashing01) - use Pounds per Cook
  "RM-ADD": { unitName: "Pounds per Cook", abbreviation: "Lbs/Cook" },

  // Default fallback
  default: { unitName: "Each", abbreviation: "ea" },
};

async function backfillDisplayUnits() {
  console.log("🔧 Starting RecipeBomItem displayUnits backfill...\n");

  try {
    // Get unit IDs for mapping
    const eachUnit = await prisma.units.findFirst({
      where: { abbreviation: "ea" },
    });

    const poundsPerCookUnit = await prisma.units.findFirst({
      where: { name: { in: ["Pounds per Cook", "Pounds per Cook (Enzyme)"] } },
    });

    if (!eachUnit) {
      throw new Error("Each unit not found - run units seed first");
    }

    console.log("📊 Found units:");
    console.log(`  - Each: ${eachUnit.id} (${eachUnit.abbreviation})`);
    console.log(
      `  - Pounds per Cook: ${poundsPerCookUnit?.id || "NOT FOUND"} (${
        poundsPerCookUnit?.abbreviation || "N/A"
      })\n`
    );

    // Get all BOM items without displayUnits
    const bomItemsWithoutUnits = await prisma.recipeBomItem.findMany({
      where: { displayUnitsId: null },
      include: {
        item: {
          select: {
            id: true,
            itemNumber: true,
            itemName: true,
            itemGroup: true,
          },
        },
      },
    });

    console.log(
      `📝 Found ${bomItemsWithoutUnits.length} BOM items without displayUnits\n`
    );

    if (bomItemsWithoutUnits.length === 0) {
      console.log(
        "✅ No BOM items need updating. All items have displayUnits set."
      );
      return;
    }

    // Group items by their assigned unit
    const updatesByUnit: Record<
      string,
      { unitId: string; unitName: string; items: string[] }
    > = {};

    for (const bomItem of bomItemsWithoutUnits) {
      if (!bomItem.item) {
        console.warn(
          `  ⚠️  Skipping BOM item ${bomItem.id} - no associated item`
        );
        continue;
      }

      const itemGroup = bomItem.item.itemGroup;
      let targetUnitId: string;
      let targetUnitName: string;

      if (itemGroup === "RM-BBL") {
        // Barrels use "Each"
        targetUnitId = eachUnit.id;
        targetUnitName = "Each";
      } else if (itemGroup === "RM-ADD" && poundsPerCookUnit) {
        // Additives use "Pounds per Cook"
        targetUnitId = poundsPerCookUnit.id;
        targetUnitName = "Pounds per Cook";
      } else {
        // Default to "Each"
        targetUnitId = eachUnit.id;
        targetUnitName = "Each";
      }

      if (!updatesByUnit[targetUnitId]) {
        updatesByUnit[targetUnitId] = {
          unitId: targetUnitId,
          unitName: targetUnitName,
          items: [],
        };
      }

      updatesByUnit[targetUnitId].items.push(bomItem.id);
    }

    // Perform batch updates
    let totalUpdated = 0;
    console.log("🔄 Applying updates:\n");

    for (const [unitId, update] of Object.entries(updatesByUnit)) {
      console.log(
        `  Updating ${update.items.length} items to use "${update.unitName}" (${unitId})`
      );

      const result = await prisma.recipeBomItem.updateMany({
        where: {
          id: { in: update.items },
        },
        data: {
          displayUnitsId: unitId,
        },
      });

      totalUpdated += result.count;
      console.log(`    ✓ Updated ${result.count} records`);
    }

    console.log(
      `\n✅ Backfill complete! Updated ${totalUpdated} RecipeBomItem records`
    );

    // Verify the fix
    const remainingWithoutUnits = await prisma.recipeBomItem.count({
      where: { displayUnitsId: null },
    });

    console.log(`\n📊 Verification:`);
    console.log(`  - BOM items without displayUnits: ${remainingWithoutUnits}`);

    if (remainingWithoutUnits > 0) {
      console.log(
        `  ⚠️  Warning: ${remainingWithoutUnits} items still without displayUnits`
      );

      // Show sample of remaining items
      const sample = await prisma.recipeBomItem.findMany({
        where: { displayUnitsId: null },
        take: 5,
        include: {
          item: {
            select: { itemNumber: true, itemGroup: true },
          },
        },
      });

      console.log(`\n  Sample of remaining items:`);
      sample.forEach((item) => {
        if (item.item) {
          console.log(
            `    - ${item.item.itemNumber} (group: ${
              item.item.itemGroup || "null"
            })`
          );
        }
      });
    } else {
      console.log(`  ✅ All BOM items now have displayUnits assigned`);
    }
  } catch (error) {
    console.error("❌ Error during backfill:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
backfillDisplayUnits()
  .then(() => {
    console.log("\n🎉 Migration completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Migration failed:", error);
    process.exit(1);
  });
