/**
 * Migration: Set Formula Configuration Defaults for Existing RecipeBomItems
 *
 * This migration updates existing RecipeBomItems to have appropriate formula
 * configuration based on their item category (determined by itemGroup).
 *
 * Run with: npx ts-node scripts/migrations/005-bom-formula-defaults-migration.ts
 */

import {
  PrismaClient,
  EnumBomCalculationMode,
  EnumBomFormulaType,
} from "@prisma/client";

const prisma = new PrismaClient();

// Category determination based on itemGroup (matching frontend logic)
function categorizeByItemGroup(
  itemGroup: string | null | undefined
): "grains" | "water" | "enzymes" | "yeast" | "other" {
  if (!itemGroup) return "other";

  const group = itemGroup.toUpperCase();

  // Grains
  if (group.startsWith("RM-GR-") || group === "RM-MLT") {
    return "grains";
  }

  // Water
  if (
    group === "RM-WATER" ||
    group === "RM-LIQ" ||
    group.includes("WATER") ||
    group.includes("LIQUID")
  ) {
    return "water";
  }

  // Enzymes
  if (group === "RM-ENZ") {
    return "enzymes";
  }

  // Yeast
  if (group === "RM-YEA") {
    return "yeast";
  }

  // Additives and other
  if (group === "RM-ADD") {
    return "other";
  }

  return "other";
}

// Determine formula configuration based on category
function getFormulaConfigForCategory(category: string): {
  calculationMode: EnumBomCalculationMode;
  formulaType: EnumBomFormulaType | null;
} {
  switch (category) {
    case "grains":
      return {
        calculationMode: EnumBomCalculationMode.FORMULA_GRAIN,
        formulaType: EnumBomFormulaType.SIMPLE_RATIO,
      };
    case "water":
      return {
        calculationMode: EnumBomCalculationMode.FORMULA_WATER,
        formulaType: EnumBomFormulaType.BACKSET_PERCENTAGE,
      };
    case "enzymes":
      return {
        calculationMode: EnumBomCalculationMode.ENZYME_NORMALIZED,
        formulaType: null,
      };
    case "yeast":
    case "other":
    default:
      return {
        calculationMode: EnumBomCalculationMode.STATIC,
        formulaType: null,
      };
  }
}

interface MigrationStats {
  total: number;
  updated: number;
  skipped: number;
  errors: number;
  byCategory: Record<string, number>;
}

async function migrateRecipeBomItems(
  dryRun: boolean = false
): Promise<MigrationStats> {
  console.log(
    `\n🔧 Starting RecipeBomItem Formula Configuration Migration ${
      dryRun ? "(DRY RUN)" : ""
    }\n`
  );

  const stats: MigrationStats = {
    total: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    byCategory: {
      grains: 0,
      water: 0,
      enzymes: 0,
      yeast: 0,
      other: 0,
    },
  };

  // Fetch all RecipeBomItems with their associated item
  const bomItems = await prisma.recipeBomItem.findMany({
    include: {
      item: {
        select: {
          id: true,
          itemName: true,
          itemNumber: true,
          itemGroup: true,
        },
      },
      recipeBoms: {
        select: {
          id: true,
          recipe: {
            select: {
              id: true,
              Recipe: true,
            },
          },
        },
      },
    },
  });

  stats.total = bomItems.length;
  console.log(`📊 Found ${stats.total} RecipeBomItems to process\n`);

  for (const bomItem of bomItems) {
    try {
      // Skip if already has a calculation mode set (not null/STATIC)
      if (
        bomItem.calculationMode &&
        bomItem.calculationMode !== EnumBomCalculationMode.STATIC
      ) {
        console.log(
          `  ⏭️  Skipping ${
            bomItem.item?.itemNumber || bomItem.id
          } - already has calculationMode: ${bomItem.calculationMode}`
        );
        stats.skipped++;
        continue;
      }

      // Determine category from item's itemGroup
      const category = categorizeByItemGroup(bomItem.item?.itemGroup);
      const formulaConfig = getFormulaConfigForCategory(category);

      // For grains with percentage quantities, calculate the multiplier
      let formulaMultiplier: number | null = null;
      if (category === "grains" && bomItem.quantity !== null) {
        // If quantity is already a decimal (0.0-1.0), use it directly
        // If it's a percentage (1-100), convert to decimal
        const qty = bomItem.quantity;
        if (qty > 0 && qty <= 1) {
          formulaMultiplier = qty; // Already a ratio
        } else if (qty > 1 && qty <= 100) {
          formulaMultiplier = qty / 100; // Convert percentage to ratio
        }
      }

      // For water with percentage, similar logic
      if (category === "water" && bomItem.quantity !== null) {
        const qty = bomItem.quantity;
        if (qty > 0 && qty <= 1) {
          formulaMultiplier = qty;
        } else if (qty > 1 && qty <= 100) {
          formulaMultiplier = qty / 100;
        }
      }

      const recipeName = bomItem.recipeBoms?.recipe?.[0]?.Recipe || "Unknown";
      const itemInfo = `${bomItem.item?.itemNumber || "No Item"} (${
        bomItem.item?.itemName || "Unknown"
      })`;

      console.log(`  📝 ${recipeName} > ${itemInfo}`);
      console.log(`      Category: ${category}`);
      console.log(
        `      Mode: ${formulaConfig.calculationMode}, Type: ${
          formulaConfig.formulaType || "N/A"
        }`
      );
      if (formulaMultiplier !== null) {
        console.log(
          `      Multiplier: ${formulaMultiplier} (from qty: ${bomItem.quantity})`
        );
      }

      if (!dryRun) {
        await prisma.recipeBomItem.update({
          where: { id: bomItem.id },
          data: {
            calculationMode: formulaConfig.calculationMode,
            formulaType: formulaConfig.formulaType,
            formulaMultiplier: formulaMultiplier,
          },
        });
      }

      stats.updated++;
      stats.byCategory[category]++;
    } catch (error) {
      console.error(`  ❌ Error processing ${bomItem.id}:`, error);
      stats.errors++;
    }
  }

  return stats;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run") || args.includes("-d");
  const force = args.includes("--force") || args.includes("-f");

  console.log(
    "═══════════════════════════════════════════════════════════════"
  );
  console.log("  RecipeBomItem Formula Configuration Migration");
  console.log(
    "═══════════════════════════════════════════════════════════════"
  );
  console.log(
    `  Mode: ${dryRun ? "DRY RUN (no changes will be made)" : "LIVE"}`
  );
  console.log(
    "═══════════════════════════════════════════════════════════════\n"
  );

  if (!dryRun && !force) {
    console.log(
      "⚠️  This will modify existing RecipeBomItems in the database."
    );
    console.log("   Run with --dry-run to preview changes first.");
    console.log("   Run with --force to execute without this warning.\n");
    console.log("   Aborting. Use --dry-run or --force to proceed.\n");
    process.exit(0);
  }

  try {
    const stats = await migrateRecipeBomItems(dryRun);

    console.log(
      "\n═══════════════════════════════════════════════════════════════"
    );
    console.log("  Migration Summary");
    console.log(
      "═══════════════════════════════════════════════════════════════"
    );
    console.log(`  Total Items:     ${stats.total}`);
    console.log(`  Updated:         ${stats.updated}`);
    console.log(`  Skipped:         ${stats.skipped}`);
    console.log(`  Errors:          ${stats.errors}`);
    console.log("");
    console.log("  By Category:");
    console.log(
      `    Grains:        ${stats.byCategory.grains} → FORMULA_GRAIN / SIMPLE_RATIO`
    );
    console.log(
      `    Water:         ${stats.byCategory.water} → FORMULA_WATER / BACKSET_PERCENTAGE`
    );
    console.log(
      `    Enzymes:       ${stats.byCategory.enzymes} → ENZYME_NORMALIZED`
    );
    console.log(`    Yeast:         ${stats.byCategory.yeast} → STATIC`);
    console.log(`    Other:         ${stats.byCategory.other} → STATIC`);
    console.log(
      "═══════════════════════════════════════════════════════════════\n"
    );

    if (dryRun) {
      console.log("✅ Dry run complete. Run with --force to apply changes.\n");
    } else {
      console.log("✅ Migration complete!\n");
    }
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
