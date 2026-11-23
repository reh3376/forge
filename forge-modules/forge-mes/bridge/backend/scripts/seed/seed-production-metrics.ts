/**
 * Seed Production Metrics — Yield parameters & constants
 *
 * Run with: npx ts-node scripts/seed/seed-production-metrics.ts
 */

import {
  PrismaClient,
  EnumRecipeWhiskeyType,
  EnumMetricSourceType,
} from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCTION_METRICS = [
  // Yield rates by whiskey type — Bourbon: 5.2 PG/GU, Others: 4.9 PG/GU
  {
    name: "yield_pg_per_gu",
    displayName: "Yield Rate (PG/GU)",
    description:
      "Proof gallons produced per grain unit (bushel). Bourbon types average 5.2, other whiskey types 4.9.",
    category: "Yield",
    tags: ["yield", "proof-gallons", "grain-unit"],
    valueNumeric: 5.2,
    unit: "PG/GU",
    sourceType: EnumMetricSourceType.Manual,
    whiskeyType: EnumRecipeWhiskeyType.RyeBourbon,
    isSystem: true,
  },
  {
    name: "yield_pg_per_gu",
    displayName: "Yield Rate (PG/GU)",
    description:
      "Proof gallons produced per grain unit (bushel). Bourbon types average 5.2.",
    category: "Yield",
    tags: ["yield", "proof-gallons", "grain-unit"],
    valueNumeric: 5.2,
    unit: "PG/GU",
    sourceType: EnumMetricSourceType.Manual,
    whiskeyType: EnumRecipeWhiskeyType.WheatedBourbon,
    isSystem: true,
  },
  {
    name: "yield_pg_per_gu",
    displayName: "Yield Rate (PG/GU)",
    description:
      "Proof gallons produced per grain unit (bushel). Bourbon types average 5.2.",
    category: "Yield",
    tags: ["yield", "proof-gallons", "grain-unit"],
    valueNumeric: 5.2,
    unit: "PG/GU",
    sourceType: EnumMetricSourceType.Manual,
    whiskeyType: EnumRecipeWhiskeyType.FourGrainBourbon,
    isSystem: true,
  },
  {
    name: "yield_pg_per_gu",
    displayName: "Yield Rate (PG/GU)",
    description:
      "Proof gallons produced per grain unit (bushel). Non-bourbon whiskey types average 4.9.",
    category: "Yield",
    tags: ["yield", "proof-gallons", "grain-unit"],
    valueNumeric: 4.9,
    unit: "PG/GU",
    sourceType: EnumMetricSourceType.Manual,
    whiskeyType: EnumRecipeWhiskeyType.RyeWhiskey,
    isSystem: true,
  },
  {
    name: "yield_pg_per_gu",
    displayName: "Yield Rate (PG/GU)",
    description:
      "Proof gallons produced per grain unit (bushel). Non-bourbon whiskey types average 4.9.",
    category: "Yield",
    tags: ["yield", "proof-gallons", "grain-unit"],
    valueNumeric: 4.9,
    unit: "PG/GU",
    sourceType: EnumMetricSourceType.Manual,
    whiskeyType: EnumRecipeWhiskeyType.WheatWhiskey,
    isSystem: true,
  },
  {
    name: "yield_pg_per_gu",
    displayName: "Yield Rate (PG/GU)",
    description:
      "Proof gallons produced per grain unit (bushel). Non-bourbon whiskey types average 4.9.",
    category: "Yield",
    tags: ["yield", "proof-gallons", "grain-unit"],
    valueNumeric: 4.9,
    unit: "PG/GU",
    sourceType: EnumMetricSourceType.Manual,
    whiskeyType: EnumRecipeWhiskeyType.MaltWhiskey,
    isSystem: true,
  },
  {
    name: "yield_pg_per_gu",
    displayName: "Yield Rate (PG/GU)",
    description:
      "Proof gallons produced per grain unit (bushel). Non-bourbon whiskey types average 4.9.",
    category: "Yield",
    tags: ["yield", "proof-gallons", "grain-unit"],
    valueNumeric: 4.9,
    unit: "PG/GU",
    sourceType: EnumMetricSourceType.Manual,
    whiskeyType: EnumRecipeWhiskeyType.FourGrainWhiskey,
    isSystem: true,
  },

  // Global constants (whiskeyType = null → applies to all)
  {
    name: "avg_barrel_fill_gallons",
    displayName: "Avg Barrel Fill (gallons)",
    description:
      "Average fill level for a standard 53-gallon barrel. Accounts for ullage.",
    category: "Constants",
    tags: ["barrel", "fill", "gallons"],
    valueNumeric: 53.07,
    unit: "gallons",
    sourceType: EnumMetricSourceType.Manual,
    whiskeyType: null,
    isSystem: true,
  },
  {
    name: "cooks_per_fermenter",
    displayName: "Cooks per Fermenter",
    description: "Number of cook batches that fill one fermenter.",
    category: "Equipment",
    tags: ["cooks", "fermenter"],
    valueNumeric: 3,
    unit: "cooks",
    sourceType: EnumMetricSourceType.Manual,
    whiskeyType: null,
    isSystem: true,
  },
  {
    name: "lbs_per_bushel",
    displayName: "Pounds per Bushel",
    description: "Standard weight of one bushel of grain.",
    category: "Constants",
    tags: ["conversion", "grain", "bushel"],
    valueNumeric: 56,
    unit: "lbs/bushel",
    sourceType: EnumMetricSourceType.Manual,
    whiskeyType: null,
    isSystem: true,
  },

  // Grain constraint metrics — equipment limits for solver
  {
    name: "min_grain_per_cook",
    displayName: "Min Grain per Cook (lbs)",
    description:
      "Minimum grain charge per cook batch. Equipment lower limit for all spirit types.",
    category: "Equipment",
    tags: ["grain", "equipment", "constraint"],
    valueNumeric: 17750,
    unit: "lbs",
    sourceType: EnumMetricSourceType.Manual,
    whiskeyType: null,
    isSystem: true,
  },
  {
    name: "max_grain_per_cook",
    displayName: "Max Grain per Cook — Bourbon (lbs)",
    description: "Maximum grain charge per cook batch for Bourbon production.",
    category: "Equipment",
    tags: ["grain", "equipment", "constraint", "bourbon"],
    valueNumeric: 24080,
    unit: "lbs",
    sourceType: EnumMetricSourceType.Manual,
    whiskeyType: EnumRecipeWhiskeyType.RyeBourbon,
    isSystem: true,
  },
  {
    name: "max_grain_per_cook",
    displayName: "Max Grain per Cook — Wheated Bourbon (lbs)",
    description:
      "Maximum grain charge per cook batch for Wheated Bourbon production.",
    category: "Equipment",
    tags: ["grain", "equipment", "constraint", "bourbon"],
    valueNumeric: 24080,
    unit: "lbs",
    sourceType: EnumMetricSourceType.Manual,
    whiskeyType: EnumRecipeWhiskeyType.WheatedBourbon,
    isSystem: true,
  },
  {
    name: "max_grain_per_cook",
    displayName: "Max Grain per Cook — Four Grain Bourbon (lbs)",
    description:
      "Maximum grain charge per cook batch for Four Grain Bourbon production.",
    category: "Equipment",
    tags: ["grain", "equipment", "constraint", "bourbon"],
    valueNumeric: 24080,
    unit: "lbs",
    sourceType: EnumMetricSourceType.Manual,
    whiskeyType: EnumRecipeWhiskeyType.FourGrainBourbon,
    isSystem: true,
  },
  {
    name: "max_grain_per_cook",
    displayName: "Max Grain per Cook — Rye Whiskey (lbs)",
    description:
      "Maximum grain charge per cook batch for Rye Whiskey production.",
    category: "Equipment",
    tags: ["grain", "equipment", "constraint", "rye"],
    valueNumeric: 20500,
    unit: "lbs",
    sourceType: EnumMetricSourceType.Manual,
    whiskeyType: EnumRecipeWhiskeyType.RyeWhiskey,
    isSystem: true,
  },
  {
    name: "max_grain_per_cook",
    displayName: "Max Grain per Cook — Default (lbs)",
    description:
      "Default maximum grain charge per cook batch (fallback for unspecified spirit types).",
    category: "Equipment",
    tags: ["grain", "equipment", "constraint"],
    valueNumeric: 24080,
    unit: "lbs",
    sourceType: EnumMetricSourceType.Manual,
    whiskeyType: null,
    isSystem: true,
  },
  {
    name: "overshoot_target",
    displayName: "Overshoot Target",
    description:
      "Target overshoot multiplier for production planning (1.01 = 101% of contracted PG).",
    category: "Planning",
    tags: ["planning", "target", "overshoot"],
    valueNumeric: 1.01,
    unit: "multiplier",
    sourceType: EnumMetricSourceType.Manual,
    whiskeyType: null,
    isSystem: true,
  },
];

async function seedProductionMetrics() {
  console.log("🌱 Seeding Production Metrics...\n");

  let created = 0;
  let skipped = 0;

  for (const metric of PRODUCTION_METRICS) {
    // Check if metric already exists (unique on [name, whiskeyType])
    const existing = await prisma.productionMetric.findFirst({
      where: {
        name: metric.name,
        whiskeyType: metric.whiskeyType as any,
      },
    });

    if (existing) {
      console.log(
        `  ⏭️  Skipping "${metric.name}" (${
          metric.whiskeyType || "all"
        }) — already exists`
      );
      skipped++;
      continue;
    }

    await prisma.productionMetric.create({
      data: {
        name: metric.name,
        displayName: metric.displayName,
        description: metric.description,
        category: metric.category,
        tags: metric.tags,
        valueNumeric: metric.valueNumeric,
        unit: metric.unit,
        sourceType: metric.sourceType,
        whiskeyType: metric.whiskeyType as any,
        isSystem: metric.isSystem,
        createdBy: "system",
      },
    });

    console.log(
      `  ✅ Created "${metric.name}" (${metric.whiskeyType || "all"}) = ${
        metric.valueNumeric
      } ${metric.unit}`
    );
    created++;
  }

  // Verification
  const total = await prisma.productionMetric.count();
  console.log(`\n✨ Production Metrics seeding complete!`);
  console.log(`   Created: ${created}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Total in DB: ${total}`);
}

seedProductionMetrics()
  .catch((error) => {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
