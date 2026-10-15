/**
 * Clear existing RecipeBOMs
 *
 * This script deletes all RecipeBOMs and RecipeBOMItems to allow re-running
 * the migration with updated normalization logic.
 *
 * Usage:
 *   DATABASE_URL="..." node scripts/sql/clear-recipe-boms.js [--execute]
 */

const { PrismaClient } = require("@prisma/client");

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required");
  console.error(
    'Usage: DATABASE_URL="your-database-url" node scripts/sql/clear-recipe-boms.js [--execute]'
  );
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_URL,
    },
  },
});

const DRY_RUN = !process.argv.includes("--execute");

async function clearRecipeBoms() {
  console.log("\n" + "=".repeat(80));
  console.log("  Clear Recipe BOMs Script");
  console.log("=".repeat(80));
  console.log(
    `Mode: ${DRY_RUN ? "DRY RUN (preview only)" : "EXECUTE (will delete data)"}`
  );
  console.log("=".repeat(80) + "\n");

  try {
    // Count existing records
    const recipeBomCount = await prisma.recipeBom.count();
    const recipeBomItemCount = await prisma.recipeBomItem.count();
    const recipeToRecipeBomCount = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM "_RecipeToRecipeBom"
    `;

    console.log("Current state:");
    console.log(`  RecipeBOMs: ${recipeBomCount}`);
    console.log(`  RecipeBOMItems: ${recipeBomItemCount}`);
    console.log(`  Recipe↔RecipeBOM links: ${recipeToRecipeBomCount[0].count}`);
    console.log();

    if (recipeBomCount === 0 && recipeBomItemCount === 0) {
      console.log("✓ No RecipeBOMs to delete. Database is already clean.");
      return;
    }

    if (!DRY_RUN) {
      console.log("Deleting records...");

      await prisma.$transaction(async (tx) => {
        // Delete in correct order due to foreign key constraints
        console.log("  1. Deleting RecipeBOMItems...");
        await tx.recipeBomItem.deleteMany({});

        console.log("  2. Deleting Recipe↔RecipeBOM links...");
        await tx.$executeRaw`DELETE FROM "_RecipeToRecipeBom"`;

        console.log("  3. Deleting RecipeBOMs...");
        await tx.recipeBom.deleteMany({});
      });

      console.log("\n✅ Successfully deleted:");
      console.log(`  ${recipeBomItemCount} RecipeBOMItems`);
      console.log(
        `  ${recipeToRecipeBomCount[0].count} Recipe↔RecipeBOM links`
      );
      console.log(`  ${recipeBomCount} RecipeBOMs`);
    } else {
      console.log("Would delete:");
      console.log(`  ${recipeBomItemCount} RecipeBOMItems`);
      console.log(
        `  ${recipeToRecipeBomCount[0].count} Recipe↔RecipeBOM links`
      );
      console.log(`  ${recipeBomCount} RecipeBOMs`);

      console.log("\n" + "=".repeat(80));
      console.log("  ℹ️  DRY RUN MODE - No changes were made");
      console.log("  ℹ️  Run with --execute flag to delete the records");
      console.log("=".repeat(80) + "\n");
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

clearRecipeBoms();
