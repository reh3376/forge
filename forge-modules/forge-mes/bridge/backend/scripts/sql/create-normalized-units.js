/**
 * Create normalized units for Recipe BOM
 *
 * This script creates the base units and normalized units needed for Recipe BOM display.
 *
 * Creates:
 * 1. Base units: Pound, Gallon, Each, Gram
 * 2. Normalized units: Percent (%), Pounds per Fermenter, Grams per Metric Ton, Gallons per Cook
 *
 * Usage:
 *   DATABASE_URL="..." node scripts/sql/create-normalized-units.js [--execute]
 */

const { PrismaClient } = require("@prisma/client");

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required");
  console.error(
    'Usage: DATABASE_URL="your-database-url" node scripts/sql/create-normalized-units.js [--execute]'
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

async function createNormalizedUnits() {
  console.log("\n" + "=".repeat(80));
  console.log("  Create Normalized Units for Recipe BOM");
  console.log("=".repeat(80));
  console.log(
    `Mode: ${
      DRY_RUN ? "DRY RUN (preview only)" : "EXECUTE (will create units)"
    }`
  );
  console.log("=".repeat(80) + "\n");

  try {
    // Check existing units
    const existingUnits = await prisma.units.findMany({
      orderBy: { name: "asc" },
    });

    console.log(`Current state: ${existingUnits.length} units in database\n`);

    const unitsToCreate = [];

    // Step 1: Create base units if they don't exist
    const baseUnits = [
      {
        name: "Pound",
        abbreviation: "lb",
        pluralName: "Pounds",
        pluralAbbreviation: "lbs",
        isBaseUnit: true,
        createdBy: "system",
      },
      {
        name: "Gallon",
        abbreviation: "gal",
        pluralName: "Gallons",
        pluralAbbreviation: "gals",
        isBaseUnit: true,
        createdBy: "system",
      },
      {
        name: "Each",
        abbreviation: "ea",
        pluralName: "Each",
        pluralAbbreviation: "ea",
        isBaseUnit: true,
        createdBy: "system",
      },
      {
        name: "Gram",
        abbreviation: "g",
        pluralName: "Grams",
        pluralAbbreviation: "g",
        isBaseUnit: true,
        createdBy: "system",
      },
    ];

    for (const unit of baseUnits) {
      const existing = existingUnits.find(
        (u) => u.abbreviation === unit.abbreviation
      );
      if (!existing) {
        unitsToCreate.push({ ...unit, type: "base" });
      } else {
        console.log(
          `  ✓ Base unit ${unit.name} (${unit.abbreviation}) already exists`
        );
      }
    }

    // Step 2: Get or create base unit IDs for FK relationships
    let poundUnit = existingUnits.find((u) => u.abbreviation === "lb");
    let gallonUnit = existingUnits.find((u) => u.abbreviation === "gal");
    let gramUnit = existingUnits.find((u) => u.abbreviation === "g");

    // If executing and base units don't exist, we'll create them first
    if (!DRY_RUN && unitsToCreate.some((u) => u.type === "base")) {
      console.log("\nCreating base units...");
      for (const unit of unitsToCreate.filter((u) => u.type === "base")) {
        const created = await prisma.units.create({
          data: {
            name: unit.name,
            abbreviation: unit.abbreviation,
            pluralName: unit.pluralName,
            pluralAbbreviation: unit.pluralAbbreviation,
            isBaseUnit: unit.isBaseUnit,
            createdBy: unit.createdBy,
          },
        });
        console.log(`  ✓ Created ${unit.name} (${unit.abbreviation})`);

        // Update references
        if (unit.abbreviation === "lb") poundUnit = created;
        if (unit.abbreviation === "gal") gallonUnit = created;
        if (unit.abbreviation === "g") gramUnit = created;
      }
      console.log();
    }

    // Step 3: Create normalized units
    const normalizedUnits = [
      {
        name: "Percentage",
        abbreviation: "%",
        pluralName: "Percentage",
        pluralAbbreviation: "%",
        isBaseUnit: false,
        mesConfiguredUnit: true,
        createdBy: "system",
        baseUnitId: null, // Percentage is dimensionless
        type: "normalized",
        usage: "grain",
      },
      {
        name: "Pounds per Fermenter",
        abbreviation: "lbs/fermenter",
        pluralName: "Pounds per Fermenter",
        pluralAbbreviation: "lbs/fermenter",
        isBaseUnit: false,
        mesConfiguredUnit: true,
        perOperation: "PerFermenter",
        createdBy: "system",
        baseUnitId: poundUnit?.id || null,
        type: "normalized",
        usage: "yeast",
      },
      {
        name: "Gallons per Cook",
        abbreviation: "gal/cook",
        pluralName: "Gallons per Cook",
        pluralAbbreviation: "gal/cook",
        isBaseUnit: false,
        mesConfiguredUnit: true,
        perOperation: "PerCook",
        createdBy: "system",
        baseUnitId: gallonUnit?.id || null,
        type: "normalized",
        usage: "liquid",
      },
      {
        name: "Pounds per Cook (Enzyme)",
        abbreviation: "lbs/cook (enzyme)",
        pluralName: "Pounds per Cook (Enzyme)",
        pluralAbbreviation: "lbs/cook (enzyme)",
        isBaseUnit: false,
        mesConfiguredUnit: true,
        perOperation: "PerCook",
        createdBy: "system",
        baseUnitId: poundUnit?.id || null,
        type: "normalized",
        usage: "enzyme",
      },
    ];

    for (const unit of normalizedUnits) {
      const existing = existingUnits.find(
        (u) => u.name === unit.name || u.abbreviation === unit.abbreviation
      );
      if (!existing) {
        unitsToCreate.push(unit);
      } else {
        console.log(
          `  ✓ Normalized unit ${unit.name} (${unit.abbreviation}) already exists`
        );
      }
    }

    // Report what will be created
    const baseToCreate = unitsToCreate.filter((u) => u.type === "base");
    const normalizedToCreate = unitsToCreate.filter(
      (u) => u.type === "normalized"
    );

    console.log("\nUnits to create:");
    console.log(`  Base units: ${baseToCreate.length}`);
    baseToCreate.forEach((u) =>
      console.log(`    - ${u.name} (${u.abbreviation})`)
    );
    console.log(`  Normalized units: ${normalizedToCreate.length}`);
    normalizedToCreate.forEach((u) =>
      console.log(`    - ${u.name} (${u.abbreviation})`)
    );
    console.log();

    if (!DRY_RUN && normalizedToCreate.length > 0) {
      console.log("Creating normalized units...");
      for (const unit of normalizedToCreate) {
        const { type, usage, ...unitData } = unit;
        await prisma.units.create({ data: unitData });
        console.log(
          `  ✓ Created ${unit.name} (${unit.abbreviation}) - for ${usage}`
        );
      }
    }

    // Step 4: Query all units and output IDs for migration script
    const finalUnits = await prisma.units.findMany({
      where: {
        OR: [
          { abbreviation: "%" },
          { abbreviation: "lbs/fermenter" },
          { abbreviation: "lbs/cook (enzyme)" },
          { abbreviation: "gal/cook" },
        ],
      },
      orderBy: { name: "asc" },
    });

    if (finalUnits.length > 0) {
      console.log("\n" + "=".repeat(80));
      console.log("Unit IDs for migration script:");
      console.log("=".repeat(80) + "\n");

      console.log("const NORMALIZED_UNIT_IDS = {");
      const percentUnit = finalUnits.find((u) => u.abbreviation === "%");
      const fermenterUnit = finalUnits.find(
        (u) => u.abbreviation === "lbs/fermenter"
      );
      const enzymeUnit = finalUnits.find(
        (u) => u.abbreviation === "lbs/cook (enzyme)"
      );
      const liquidUnit = finalUnits.find((u) => u.abbreviation === "gal/cook");

      if (percentUnit)
        console.log(
          `  PERCENTAGE: '${percentUnit.id}',           // ${percentUnit.name} - for grains`
        );
      if (fermenterUnit)
        console.log(
          `  PER_FERMENTER: '${fermenterUnit.id}',      // ${fermenterUnit.name} - for yeast`
        );
      if (enzymeUnit)
        console.log(
          `  PER_COOK_ENZYME: '${enzymeUnit.id}',   // ${enzymeUnit.name} - for enzymes`
        );
      if (liquidUnit)
        console.log(
          `  PER_COOK_LIQUID: '${liquidUnit.id}',   // ${liquidUnit.name} - for water/backset`
        );
      console.log("};\n");
    }

    // Summary
    console.log("=".repeat(80));
    console.log("Summary:");
    console.log("=".repeat(80));
    console.log(`  Existing units: ${existingUnits.length}`);
    console.log(`  Units to create: ${unitsToCreate.length}`);
    if (DRY_RUN) {
      console.log("\n" + "=".repeat(80));
      console.log("  ℹ️  DRY RUN MODE - No changes were made");
      console.log("  ℹ️  Run with --execute flag to create the units");
      console.log("=".repeat(80) + "\n");
    } else {
      console.log(`  Units created: ${unitsToCreate.length}`);
      console.log("\n✅ Units created successfully!");
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

createNormalizedUnits();
