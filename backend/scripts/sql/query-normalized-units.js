/**
 * Query and create normalized units for Recipe BOM
 *
 * This script checks what Units exist in the database and creates
 * normalized units needed for Recipe BOM display.
 *
 * Required normalized units:
 * - Percentage (for grains)
 * - Pounds per Fermenter (for yeast)
 * - Grams per Metric Ton (for enzymes)
 * - Gallons per Cook (for water/backset)
 *
 * Usage:
 *   DATABASE_URL="..." node scripts/sql/query-normalized-units.js [--create]
 */

const { PrismaClient } = require("@prisma/client");

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required");
  console.error(
    'Usage: DATABASE_URL="your-database-url" node scripts/sql/query-normalized-units.js [--create]'
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

const CREATE_MODE = process.argv.includes("--create");

// Normalized units we need
const REQUIRED_UNITS = [
  {
    name: "Percentage",
    symbol: "%",
    description: "Percentage of grain bill (normalized)",
    unitType: "PERCENTAGE",
  },
  {
    name: "Pounds per Fermenter",
    symbol: "lbs/fermenter",
    description: "Pounds per fermenter (normalized)",
    unitType: "MASS_PER_FERMENTER",
  },
  {
    name: "Grams per Metric Ton",
    symbol: "g/MT",
    description: "Grams per metric ton of grain (normalized)",
    unitType: "MASS_PER_MASS",
  },
  {
    name: "Gallons per Cook",
    symbol: "gal/cook",
    description: "Gallons per cook (normalized)",
    unitType: "VOLUME_PER_COOK",
  },
];

async function queryNormalizedUnits() {
  console.log("\n" + "=".repeat(80));
  console.log("  Query Normalized Units for Recipe BOM");
  console.log("=".repeat(80));
  console.log(
    `Mode: ${
      CREATE_MODE ? "CREATE (will create missing units)" : "QUERY (read-only)"
    }`
  );
  console.log("=".repeat(80) + "\n");

  try {
    // 1. Query all existing units
    console.log("Querying existing units...\n");
    const allUnits = await prisma.units.findMany({
      orderBy: { name: "asc" },
    });

    console.log(`Found ${allUnits.length} existing units in database:\n`);
    allUnits.forEach((unit) => {
      console.log(
        `  ${unit.name.padEnd(30)} | ${(unit.symbol || "").padEnd(15)} | ${
          unit.unitType || "N/A"
        }`
      );
    });
    console.log();

    // 2. Check which normalized units exist
    console.log("Checking for required normalized units...\n");
    const foundUnits = {};
    const missingUnits = [];

    for (const required of REQUIRED_UNITS) {
      const existing = allUnits.find(
        (u) => u.name === required.name || u.symbol === required.symbol
      );

      if (existing) {
        foundUnits[required.name] = existing;
        console.log(
          `  ✓ ${required.name.padEnd(30)} → Found (ID: ${existing.id})`
        );
      } else {
        missingUnits.push(required);
        console.log(`  ✗ ${required.name.padEnd(30)} → Missing`);
      }
    }
    console.log();

    // 3. Create missing units if in CREATE mode
    if (CREATE_MODE && missingUnits.length > 0) {
      console.log(`Creating ${missingUnits.length} missing units...\n`);

      for (const unit of missingUnits) {
        const created = await prisma.units.create({
          data: {
            name: unit.name,
            symbol: unit.symbol,
            description: unit.description,
            unitType: unit.unitType,
          },
        });

        foundUnits[unit.name] = created;
        console.log(`  ✓ Created ${unit.name} (ID: ${created.id})`);
      }
      console.log();
    } else if (missingUnits.length > 0) {
      console.log(
        "⚠️  Missing units detected. Run with --create flag to create them.\n"
      );
    }

    // 4. Output unit IDs for migration script
    console.log("=".repeat(80));
    console.log("Unit IDs for migration script:");
    console.log("=".repeat(80) + "\n");

    console.log("const NORMALIZED_UNIT_IDS = {");
    for (const required of REQUIRED_UNITS) {
      const unit = foundUnits[required.name];
      if (unit) {
        console.log(
          `  PERCENTAGE: '${unit.id}',           // ${unit.name} (${unit.symbol})`
        );
        break;
      }
    }
    for (const required of REQUIRED_UNITS) {
      const unit = foundUnits[required.name];
      if (unit && required.name === "Pounds per Fermenter") {
        console.log(
          `  PER_FERMENTER: '${unit.id}',       // ${unit.name} (${unit.symbol})`
        );
      }
    }
    for (const required of REQUIRED_UNITS) {
      const unit = foundUnits[required.name];
      if (unit && required.name === "Grams per Metric Ton") {
        console.log(
          `  PER_METRIC_TON: '${unit.id}',      // ${unit.name} (${unit.symbol})`
        );
      }
    }
    for (const required of REQUIRED_UNITS) {
      const unit = foundUnits[required.name];
      if (unit && required.name === "Gallons per Cook") {
        console.log(
          `  PER_COOK: '${unit.id}',            // ${unit.name} (${unit.symbol})`
        );
      }
    }
    console.log("};\n");

    // 5. Summary
    console.log("=".repeat(80));
    console.log("Summary:");
    console.log("=".repeat(80));
    console.log(`  Total units in database: ${allUnits.length}`);
    console.log(`  Required normalized units: ${REQUIRED_UNITS.length}`);
    console.log(`  Found: ${Object.keys(foundUnits).length}`);
    console.log(`  Missing: ${missingUnits.length}`);
    if (CREATE_MODE && missingUnits.length > 0) {
      console.log(`  Created: ${missingUnits.length}`);
    }
    console.log("=".repeat(80) + "\n");

    if (!CREATE_MODE && missingUnits.length > 0) {
      console.log("Next steps:");
      console.log("  1. Run with --create flag to create missing units");
      console.log(
        "  2. Update migrate-bom-to-recipe-bom.js with unit IDs above"
      );
      console.log("  3. Re-run migration to populate displayUnitsId\n");
    } else if (CREATE_MODE) {
      console.log("✅ All normalized units are ready!");
      console.log("\nNext steps:");
      console.log(
        "  1. Copy the NORMALIZED_UNIT_IDS above into migrate-bom-to-recipe-bom.js"
      );
      console.log(
        "  2. Update migration to set displayUnitsId based on normalization type"
      );
      console.log(
        "  3. Clear existing RecipeBOMs: node scripts/sql/clear-recipe-boms.js --execute"
      );
      console.log(
        "  4. Re-run migration: node scripts/sql/migrate-bom-to-recipe-bom.js --execute\n"
      );
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

queryNormalizedUnits();
