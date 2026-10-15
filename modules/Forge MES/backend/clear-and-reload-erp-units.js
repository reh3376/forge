const { PrismaClient } = require("@prisma/client");

async function clearERPUnits() {
  const prisma = new PrismaClient();

  try {
    console.log("🧹 Clearing existing ERP units...");

    // Find all ERP units (mesConfiguredUnit = false)
    const erpUnits = await prisma.units.findMany({
      where: { mesConfiguredUnit: false },
      select: { id: true, name: true, abbreviation: true },
    });

    console.log(`📊 Found ${erpUnits.length} existing ERP units to remove`);

    if (erpUnits.length > 0) {
      // Delete all ERP units
      const deleteResult = await prisma.units.deleteMany({
        where: { mesConfiguredUnit: false },
      });

      console.log(`✅ Deleted ${deleteResult.count} ERP units`);
    } else {
      console.log("ℹ️  No ERP units found to delete");
    }
  } catch (error) {
    console.error("❌ Error clearing ERP units:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Import the fixed loader functions
const { loadUnits, showPreview } = require("./load-erp-units-fixed.js");

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--preview") || args.includes("-p")) {
    showPreview();
    return;
  }

  if (args.includes("--help") || args.includes("-h")) {
    console.log("Clear and Reload ERP Units");
    console.log("=========================");
    console.log("");
    console.log("This script will:");
    console.log("1. Clear all existing ERP units (mesConfiguredUnit = false)");
    console.log("2. Load new ERP units with unique names to avoid conflicts");
    console.log("");
    console.log("Usage:");
    console.log("  node clear-and-reload-erp-units.js [options]");
    console.log("");
    console.log("Options:");
    console.log("  --preview, -p    Show preview of units to be loaded");
    console.log("  --help, -h       Show this help message");
    console.log("  --force          Skip confirmation prompt");
    console.log("");
    console.log("Examples:");
    console.log("  node clear-and-reload-erp-units.js --preview");
    console.log("  node clear-and-reload-erp-units.js --force");
    console.log("  node clear-and-reload-erp-units.js");
    return;
  }

  console.log("🚀 Clear and Reload ERP Units Process");
  console.log("=====================================");

  showPreview();

  if (!args.includes("--force")) {
    console.log("⚠️  This will:");
    console.log("   1. DELETE all existing ERP units from the database");
    console.log("   2. Load the above units with unique names");
    console.log("   Press Ctrl+C to cancel, or press Enter to continue...");

    await new Promise((resolve) => {
      process.stdin.once("data", resolve);
    });
  }

  try {
    // Step 1: Clear existing ERP units
    await clearERPUnits();

    console.log("\n" + "=".repeat(50));

    // Step 2: Load new units
    await loadUnits();
  } catch (error) {
    console.error("💥 Process failed:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("💥 Script failed:", error);
    process.exit(1);
  });
}
