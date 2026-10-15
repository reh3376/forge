/**
 * Seed Formula Configuration - Variables and Functions
 *
 * Run with: npx ts-node scripts/seed/seed-formula-config.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Default formula variables
const DEFAULT_VARIABLES = [
  {
    name: "grainLoad",
    displayName: "Grain Load",
    description: "Total grain weight in pounds (lbs)",
    type: "number",
    defaultValue: "3000",
    category: "General",
    sortOrder: 1,
    isSystem: true,
  },
  {
    name: "waterLoad",
    displayName: "Water Load",
    description: "Total water volume in gallons (gal)",
    type: "number",
    defaultValue: "240",
    category: "General",
    sortOrder: 2,
    isSystem: true,
  },
  {
    name: "gallonsPerBushel",
    displayName: "Gallons per Bushel",
    description: "Water-to-grain ratio (default: 4.5 gal/bushel)",
    type: "number",
    defaultValue: "4.5",
    category: "Constants",
    sortOrder: 1,
    isSystem: true,
  },
  {
    name: "lbsPerBushel",
    displayName: "Pounds per Bushel",
    description: "Weight per bushel (56 lbs/bushel)",
    type: "number",
    defaultValue: "56",
    category: "Constants",
    sortOrder: 2,
    isSystem: true,
  },
  {
    name: "metricTonDivisor",
    displayName: "Metric Ton Divisor",
    description: "Pounds per metric ton (2205 lbs)",
    type: "number",
    defaultValue: "2205",
    category: "Constants",
    sortOrder: 3,
    isSystem: true,
  },

  // Yield estimation variables
  {
    name: "grainPerCook",
    displayName: "Grain per Cook",
    description: "Grain weight per cook batch (lbs)",
    type: "number",
    defaultValue: "23000",
    category: "Yield",
    sortOrder: 1,
    isSystem: true,
  },
  {
    name: "cooksPerFerm",
    displayName: "Cooks per Fermenter",
    description: "Number of cook batches per fermenter",
    type: "number",
    defaultValue: "3",
    category: "Yield",
    sortOrder: 2,
    isSystem: true,
  },
  {
    name: "yieldRate",
    displayName: "Yield Rate",
    description: "Proof gallons per grain unit (PG/GU)",
    type: "number",
    defaultValue: "5.2",
    category: "Yield",
    sortOrder: 3,
    isSystem: true,
  },
  {
    name: "entryProof",
    displayName: "Entry Proof",
    description: "Barrel entry proof",
    type: "number",
    defaultValue: "125",
    category: "Yield",
    sortOrder: 4,
    isSystem: true,
  },
  {
    name: "avgBarrelFill",
    displayName: "Avg Barrel Fill",
    description: "Average barrel fill volume (gallons)",
    type: "number",
    defaultValue: "53.07",
    category: "Yield",
    sortOrder: 5,
    isSystem: true,
  },
  {
    name: "grainUnitsPerFerm",
    displayName: "Grain Units per Fermenter",
    description: "Bushels of grain per fermenter (computed)",
    type: "number",
    defaultValue: "1232.14",
    category: "Yield",
    sortOrder: 6,
    isSystem: true,
  },
  {
    name: "pgPerFerm",
    displayName: "PG per Fermenter",
    description: "Proof gallons per fermenter (computed)",
    type: "number",
    defaultValue: "6407.14",
    category: "Yield",
    sortOrder: 7,
    isSystem: true,
  },
  {
    name: "pgPerBarrel",
    displayName: "PG per Barrel",
    description: "Proof gallons per barrel (computed)",
    type: "number",
    defaultValue: "66.34",
    category: "Yield",
    sortOrder: 8,
    isSystem: true,
  },
  {
    name: "bblPerFerm",
    displayName: "Barrels per Fermenter",
    description: "Barrels per fermenter (computed)",
    type: "number",
    defaultValue: "96.58",
    category: "Yield",
    sortOrder: 9,
    isSystem: true,
  },
  {
    name: "totalBarrels",
    displayName: "Total Barrels",
    description: "Total barrels ordered",
    type: "number",
    defaultValue: "500",
    category: "Yield",
    sortOrder: 10,
    isSystem: true,
  },
  {
    name: "totalCooks",
    displayName: "Total Cooks",
    description: "Total cook batches required (computed)",
    type: "number",
    defaultValue: "18",
    category: "Yield",
    sortOrder: 11,
    isSystem: true,
  },
  {
    name: "totalFermenters",
    displayName: "Total Fermenters",
    description: "Total fermenters required (computed)",
    type: "number",
    defaultValue: "6",
    category: "Yield",
    sortOrder: 12,
    isSystem: true,
  },
];

// Default formula functions (all system functions have implementationType: 'SYSTEM')
const DEFAULT_FUNCTIONS = [
  // Math functions
  {
    name: "ROUND",
    syntax: "ROUND(value, decimals)",
    description: "Rounds a number to the specified number of decimal places",
    category: "Math",
    exampleUsage: "ROUND(grainLoad * 0.7, 2) → 2100.00",
    sortOrder: 1,
    isSystem: true,
    implementationType: "SYSTEM",
  },
  {
    name: "FLOOR",
    syntax: "FLOOR(value)",
    description: "Rounds a number down to the nearest integer",
    category: "Math",
    exampleUsage: "FLOOR(53.7) → 53",
    sortOrder: 2,
    isSystem: true,
    implementationType: "SYSTEM",
  },
  {
    name: "CEIL",
    syntax: "CEIL(value)",
    description: "Rounds a number up to the nearest integer",
    category: "Math",
    exampleUsage: "CEIL(53.2) → 54",
    sortOrder: 3,
    isSystem: true,
    implementationType: "SYSTEM",
  },
  {
    name: "ABS",
    syntax: "ABS(value)",
    description: "Returns the absolute (positive) value of a number",
    category: "Math",
    exampleUsage: "ABS(-100) → 100",
    sortOrder: 4,
    isSystem: true,
    implementationType: "SYSTEM",
  },
  {
    name: "MIN",
    syntax: "MIN(value1, value2, ...)",
    description: "Returns the minimum value from a list of numbers",
    category: "Math",
    exampleUsage: "MIN(grainLoad, 5000) → 3000",
    sortOrder: 5,
    isSystem: true,
    implementationType: "SYSTEM",
  },
  {
    name: "MAX",
    syntax: "MAX(value1, value2, ...)",
    description: "Returns the maximum value from a list of numbers",
    category: "Math",
    exampleUsage: "MAX(grainLoad, 1000) → 3000",
    sortOrder: 6,
    isSystem: true,
    implementationType: "SYSTEM",
  },
  {
    name: "POW",
    syntax: "POW(base, exponent)",
    description: "Returns base raised to the power of exponent",
    category: "Math",
    exampleUsage: "POW(2, 3) → 8",
    sortOrder: 7,
    isSystem: true,
    implementationType: "SYSTEM",
  },
  {
    name: "SQRT",
    syntax: "SQRT(value)",
    description: "Returns the square root of a number",
    category: "Math",
    exampleUsage: "SQRT(16) → 4",
    sortOrder: 8,
    isSystem: true,
    implementationType: "SYSTEM",
  },
  {
    name: "LOG",
    syntax: "LOG(value)",
    description: "Returns the natural logarithm (base e) of a number",
    category: "Math",
    exampleUsage: "LOG(2.718) → 1",
    sortOrder: 9,
    isSystem: true,
    implementationType: "SYSTEM",
  },
  {
    name: "LOG10",
    syntax: "LOG10(value)",
    description: "Returns the base-10 logarithm of a number",
    category: "Math",
    exampleUsage: "LOG10(100) → 2",
    sortOrder: 10,
    isSystem: true,
    implementationType: "SYSTEM",
  },
  {
    name: "EXP",
    syntax: "EXP(value)",
    description: "Returns e raised to the power of value",
    category: "Math",
    exampleUsage: "EXP(1) → 2.718",
    sortOrder: 11,
    isSystem: true,
    implementationType: "SYSTEM",
  },

  // Conditional functions
  {
    name: "IF",
    syntax: "IF(condition, trueValue, falseValue)",
    description: "Returns trueValue if condition is true, otherwise falseValue",
    category: "Conditional",
    exampleUsage: "IF(grainLoad > 2000, grainLoad * 0.8, grainLoad * 0.9)",
    sortOrder: 1,
    isSystem: true,
    implementationType: "SYSTEM",
  },
  {
    name: "AND",
    syntax: "AND(value1, value2, ...)",
    description: "Returns true if all arguments are true",
    category: "Conditional",
    exampleUsage: "AND(grainLoad > 1000, waterLoad > 100)",
    sortOrder: 2,
    isSystem: true,
    implementationType: "SYSTEM",
  },
  {
    name: "OR",
    syntax: "OR(value1, value2, ...)",
    description: "Returns true if any argument is true",
    category: "Conditional",
    exampleUsage: "OR(grainLoad < 1000, waterLoad < 100)",
    sortOrder: 3,
    isSystem: true,
    implementationType: "SYSTEM",
  },
  {
    name: "NOT",
    syntax: "NOT(value)",
    description: "Returns the logical negation of value",
    category: "Conditional",
    exampleUsage: "NOT(grainLoad == 0)",
    sortOrder: 4,
    isSystem: true,
    implementationType: "SYSTEM",
  },

  // Conversion functions
  {
    name: "BUSHELS",
    syntax: "BUSHELS(lbs)",
    description: "Converts pounds to bushels (1 bushel = 56 lbs)",
    category: "Conversion",
    exampleUsage: "BUSHELS(3000) → 53.57",
    sortOrder: 1,
    isSystem: true,
    implementationType: "SYSTEM",
  },
  {
    name: "METRIC_TONS",
    syntax: "METRIC_TONS(lbs)",
    description: "Converts pounds to metric tons (1 MT = 2205 lbs)",
    category: "Conversion",
    exampleUsage: "METRIC_TONS(3000) → 1.36",
    sortOrder: 2,
    isSystem: true,
    implementationType: "SYSTEM",
  },
  {
    name: "GALLONS_TO_LITERS",
    syntax: "GALLONS_TO_LITERS(gallons)",
    description: "Converts gallons to liters (1 gal = 3.785 L)",
    category: "Conversion",
    exampleUsage: "GALLONS_TO_LITERS(100) → 378.54",
    sortOrder: 3,
    isSystem: true,
    implementationType: "SYSTEM",
  },
  {
    name: "LITERS_TO_GALLONS",
    syntax: "LITERS_TO_GALLONS(liters)",
    description: "Converts liters to gallons",
    category: "Conversion",
    exampleUsage: "LITERS_TO_GALLONS(100) → 26.42",
    sortOrder: 4,
    isSystem: true,
    implementationType: "SYSTEM",
  },
  {
    name: "KG_TO_LBS",
    syntax: "KG_TO_LBS(kg)",
    description: "Converts kilograms to pounds (1 kg = 2.205 lbs)",
    category: "Conversion",
    exampleUsage: "KG_TO_LBS(100) → 220.46",
    sortOrder: 5,
    isSystem: true,
    implementationType: "SYSTEM",
  },
  {
    name: "LBS_TO_KG",
    syntax: "LBS_TO_KG(lbs)",
    description: "Converts pounds to kilograms",
    category: "Conversion",
    exampleUsage: "LBS_TO_KG(100) → 45.36",
    sortOrder: 6,
    isSystem: true,
    implementationType: "SYSTEM",
  },
];

async function seedFormulaConfig() {
  console.log("🌱 Seeding Formula Configuration...\n");

  // Seed Variables
  console.log("📊 Seeding Formula Variables...");
  let varsCreated = 0;
  let varsSkipped = 0;

  for (const variable of DEFAULT_VARIABLES) {
    const existing = await prisma.formulaVariable.findUnique({
      where: { name: variable.name },
    });

    if (existing) {
      console.log(`  ⏭️  Skipping "${variable.name}" (already exists)`);
      varsSkipped++;
      continue;
    }

    await prisma.formulaVariable.create({
      data: variable,
    });

    console.log(`  ✅ Created "${variable.name}"`);
    varsCreated++;
  }

  console.log(
    `\n  Variables: ${varsCreated} created, ${varsSkipped} skipped\n`
  );

  // Seed Functions
  console.log("⚙️  Seeding Formula Functions...");
  let funcsCreated = 0;
  let funcsUpdated = 0;

  for (const func of DEFAULT_FUNCTIONS) {
    const existing = await prisma.formulaFunction.findUnique({
      where: { name: func.name },
    });

    if (existing) {
      // Update existing record to ensure implementationType is set
      await prisma.formulaFunction.update({
        where: { name: func.name },
        data: {
          implementationType: func.implementationType,
          // Also update other fields in case they changed
          syntax: func.syntax,
          description: func.description,
          category: func.category,
          exampleUsage: func.exampleUsage,
          sortOrder: func.sortOrder,
        },
      });
      console.log(
        `  🔄 Updated "${func.name}" (implementationType: ${func.implementationType})`
      );
      funcsUpdated++;
      continue;
    }

    await prisma.formulaFunction.create({
      data: func,
    });

    console.log(`  ✅ Created "${func.name}"`);
    funcsCreated++;
  }

  console.log(
    `\n  Functions: ${funcsCreated} created, ${funcsUpdated} updated\n`
  );

  console.log("✨ Formula Configuration seeding complete!");
  console.log(
    `   Total Variables: ${varsCreated + varsSkipped} (${varsCreated} new)`
  );
  console.log(
    `   Total Functions: ${
      funcsCreated + funcsUpdated
    } (${funcsCreated} new, ${funcsUpdated} updated)`
  );
}

seedFormulaConfig()
  .catch((error) => {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
