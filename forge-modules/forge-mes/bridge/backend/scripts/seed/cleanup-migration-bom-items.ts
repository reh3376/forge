#!/usr/bin/env ts-node

/**
 * Cleanup Script for Migration-Created RecipeBOMItems
 *
 * This script deletes RecipeBOMItems that were created by the migration script
 * with incorrect quantities (raw values instead of percentages).
 *
 * Usage:
 *   npm run migrate:cleanup-bom-items
 *   or
 *   DB_URL=<connection-string> npx ts-node scripts/seed/cleanup-migration-bom-items.ts
 *
 * Options:
 *   --dry-run or -d    Show what would be deleted without making changes
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function cleanupMigrationBomItems(dryRun: boolean = false) {
  console.log(
    `🧹 ${
      dryRun ? "DRY RUN - " : ""
    }Cleaning Up Migration-Created RecipeBOMItems...\n`
  );

  if (dryRun) {
    console.log("⚠️  DRY RUN MODE: No changes will be made to the database\n");
  }

  // Find all RecipeBOMItems created by the migration script
  const migrationItems = await prisma.recipeBomItem.findMany({
    where: {
      createdBy: "migration-populate-bom-items",
    },
    include: {
      item: {
        select: {
          itemNumber: true,
          itemName: true,
          itemGroup: true,
        },
      },
      recipeBoms: {
        select: {
          id: true,
          recipe: {
            select: {
              Recipe: true,
            },
          },
        },
      },
    },
  });

  console.log("📊 CLEANUP SUMMARY");
  console.log("=".repeat(80));
  console.log(`Total RecipeBOMItems to Delete: ${migrationItems.length}`);
  console.log("=".repeat(80));
  console.log();

  if (migrationItems.length === 0) {
    console.log(
      "✅ No migration-created RecipeBOMItems found. Nothing to clean up."
    );
    await prisma.$disconnect();
    return;
  }

  // Group by recipe for reporting
  const itemsByRecipe = new Map<string, typeof migrationItems>();
  migrationItems.forEach((item) => {
    const recipeName = item.recipeBoms?.recipe[0]?.Recipe || "Unknown Recipe";
    if (!itemsByRecipe.has(recipeName)) {
      itemsByRecipe.set(recipeName, []);
    }
    itemsByRecipe.get(recipeName)!.push(item);
  });

  console.log("📋 ITEMS TO DELETE BY RECIPE (First 10)");
  console.log("-".repeat(80));
  Array.from(itemsByRecipe.entries())
    .slice(0, 10)
    .forEach(([recipeName, items]) => {
      console.log(`\n${recipeName}`);
      console.log(`  Items to delete: ${items.length}`);
      items.forEach((item) => {
        console.log(
          `    - ${item.item?.itemNumber || "Unknown"}: ${
            item.item?.itemName || "Unknown"
          } (qty: ${item.quantity})`
        );
      });
    });

  if (itemsByRecipe.size > 10) {
    console.log(`\n... and ${itemsByRecipe.size - 10} more recipes`);
  }
  console.log();

  if (dryRun) {
    console.log("⚠️  DRY RUN MODE: Exiting without making changes");
    await prisma.$disconnect();
    return;
  }

  // Confirm before proceeding
  console.log("⚠️  This will permanently delete these RecipeBOMItems");
  console.log();

  // Delete the items
  console.log("🚀 Starting Cleanup...\n");

  try {
    const deleteResult = await prisma.recipeBomItem.deleteMany({
      where: {
        createdBy: "migration-populate-bom-items",
      },
    });

    console.log();
    console.log("📈 CLEANUP RESULTS");
    console.log("=".repeat(80));
    console.log(`RecipeBOMItems Deleted: ${deleteResult.count}`);
    console.log("=".repeat(80));
    console.log();

    await prisma.$disconnect();

    if (deleteResult.count === migrationItems.length) {
      console.log("✅ Cleanup completed successfully!");
      console.log(
        "\n📝 Next Step: Run the migration script with normalized quantities:"
      );
      console.log(
        "   DB_URL=<your-database-url> npm run migrate:populate-bom-items"
      );
    } else {
      console.log("⚠️  Cleanup completed with unexpected count");
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Error during cleanup:", error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

// Check command line args for dry-run flag
const isDryRun =
  process.argv.includes("--dry-run") || process.argv.includes("-d");

cleanupMigrationBomItems(isDryRun)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Cleanup failed:", error);
    process.exit(1);
  });
