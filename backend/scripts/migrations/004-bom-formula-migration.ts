/**
 * Data Migration Script: Set BOM Formula Configuration
 *
 * This script migrates existing RecipeBomItems to use the new formula-based
 * calculation system by setting calculationMode, formulaType, and formulaMultiplier
 * based on the item type.
 *
 * Formula Types:
 * - Grains (corn, rye, wheat, malt): FORMULA_GRAIN + SIMPLE_RATIO (multiplier = percentage/100)
 * - Water: FORMULA_GRAIN + WATER_PER_BUSHEL (multiplier = 4.5 gal/bushel)
 * - Backset: FORMULA_WATER + BACKSET_PERCENTAGE (multiplier = 0.25)
 * - Enzymes: ENZYME_NORMALIZED (uses existing enzyme dosing service)
 * - Others: STATIC (keeps current fixed quantity)
 */

import {
  PrismaClient,
  EnumBomCalculationMode,
  EnumBomFormulaType,
} from "@prisma/client";

const prisma = new PrismaClient();

// Configuration for known item types
const GRAIN_KEYWORDS = ["corn", "rye", "wheat", "malt", "barley", "grain"];
const WATER_KEYWORDS = ["water", "h2o"];
const BACKSET_KEYWORDS = ["backset", "stillage"];
const ENZYME_KEYWORDS = [
  "enzyme",
  "termamyl",
  "saczyme",
  "viscoferm",
  "liquozyme",
  "amylex",
  "alphalase",
  "glucoamylase",
  "alpha-amylase",
  "amylase",
];

const DEFAULT_WATER_GALLONS_PER_BUSHEL = 4.5;
const DEFAULT_BACKSET_PERCENTAGE = 0.25;
const DEFAULT_GRAIN_LOAD_LBS = 1000; // Reference load for calculating multipliers

interface MigrationResult {
  totalItems: number;
  grainItems: number;
  waterItems: number;
  backsetItems: number;
  enzymeItems: number;
  staticItems: number;
  errors: Array<{ itemId: string; error: string }>;
}

/**
 * Determine if an item matches a set of keywords
 */
function matchesKeywords(itemName: string, keywords: string[]): boolean {
  const lowerName = itemName.toLowerCase();
  return keywords.some((keyword) => lowerName.includes(keyword));
}

/**
 * Calculate multiplier for grain items based on existing quantity
 * Quantities are stored as decimal percentages (0.70 = 70%, 0.21 = 21%, etc.)
 * OR as whole numbers without units that need to be divided by 100
 */
function calculateGrainMultiplier(quantity: number | null): number {
  if (!quantity) return 0;

  // If quantity is already a decimal percentage (< 1.0), use it directly
  // Examples: 0.70 = 70%, 0.21 = 21%, 0.09 = 9%
  if (quantity < 1.0) {
    return quantity;
  }

  // If quantity is a whole number percentage (e.g., 70, 21, 9), divide by 100
  // Examples: 70 → 0.70, 21 → 0.21, 9 → 0.09
  if (quantity <= 100) {
    return quantity / 100;
  }

  // For large values (> 100), assume they're in a different format
  // and should be kept as-is for manual review
  return quantity;
}

/**
 * Main migration function
 */
async function migrateBomFormulas(): Promise<MigrationResult> {
  const result: MigrationResult = {
    totalItems: 0,
    grainItems: 0,
    waterItems: 0,
    backsetItems: 0,
    enzymeItems: 0,
    staticItems: 0,
    errors: [],
  };

  console.log("Starting BOM formula migration...\n");

  try {
    // Fetch all RecipeBomItems with their associated items
    const bomItems = await prisma.recipeBomItem.findMany({
      include: {
        item: {
          select: {
            id: true,
            itemName: true,
            itemGroup: true,
          },
        },
      },
    });

    result.totalItems = bomItems.length;
    console.log(`Found ${result.totalItems} RecipeBomItems to process\n`);

    // Process each BOM item
    for (const bomItem of bomItems) {
      const itemName = bomItem.item?.itemName || "";
      const itemId = bomItem.id;

      try {
        let calculationMode: EnumBomCalculationMode;
        let formulaType: EnumBomFormulaType | null = null;
        let formulaMultiplier: number | null = null;

        // Determine configuration based on item type
        if (matchesKeywords(itemName, GRAIN_KEYWORDS)) {
          // Grain items: use SIMPLE_RATIO formula
          calculationMode = EnumBomCalculationMode.FORMULA_GRAIN;
          formulaType = EnumBomFormulaType.SIMPLE_RATIO;
          formulaMultiplier = calculateGrainMultiplier(bomItem.quantity);
          result.grainItems++;
          console.log(
            `  ✓ Grain: ${itemName} (multiplier: ${formulaMultiplier?.toFixed(
              4
            )})`
          );
        } else if (matchesKeywords(itemName, WATER_KEYWORDS)) {
          // Water items: use WATER_PER_BUSHEL formula
          calculationMode = EnumBomCalculationMode.FORMULA_GRAIN;
          formulaType = EnumBomFormulaType.WATER_PER_BUSHEL;
          formulaMultiplier = DEFAULT_WATER_GALLONS_PER_BUSHEL;
          result.waterItems++;
          console.log(
            `  ✓ Water: ${itemName} (${formulaMultiplier} gal/bushel)`
          );
        } else if (matchesKeywords(itemName, BACKSET_KEYWORDS)) {
          // Backset items: use BACKSET_PERCENTAGE formula
          calculationMode = EnumBomCalculationMode.FORMULA_WATER;
          formulaType = EnumBomFormulaType.BACKSET_PERCENTAGE;
          formulaMultiplier = DEFAULT_BACKSET_PERCENTAGE;
          result.backsetItems++;
          console.log(
            `  ✓ Backset: ${itemName} (${formulaMultiplier * 100}% of water)`
          );
        } else if (matchesKeywords(itemName, ENZYME_KEYWORDS)) {
          // Enzyme items: use ENZYME_NORMALIZED (leverage existing enzyme dosing service)
          calculationMode = EnumBomCalculationMode.ENZYME_NORMALIZED;
          formulaType = null;
          formulaMultiplier = null;
          result.enzymeItems++;
          console.log(`  ✓ Enzyme: ${itemName} (normalized dosing)`);
        } else {
          // Default: STATIC (preserve current behavior)
          calculationMode = EnumBomCalculationMode.STATIC;
          formulaType = null;
          formulaMultiplier = null;
          result.staticItems++;
          console.log(`  - Static: ${itemName} (no formula)`);
        }

        // Update the RecipeBomItem
        await prisma.recipeBomItem.update({
          where: { id: itemId },
          data: {
            calculationMode,
            formulaType,
            formulaMultiplier,
          },
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        result.errors.push({ itemId, error: errorMessage });
        console.error(`  ✗ Error processing ${itemName}: ${errorMessage}`);
      }
    }

    console.log("\n=== Migration Summary ===");
    console.log(`Total Items:   ${result.totalItems}`);
    console.log(`Grain Items:   ${result.grainItems}`);
    console.log(`Water Items:   ${result.waterItems}`);
    console.log(`Backset Items: ${result.backsetItems}`);
    console.log(`Enzyme Items:  ${result.enzymeItems}`);
    console.log(`Static Items:  ${result.staticItems}`);
    console.log(`Errors:        ${result.errors.length}`);

    if (result.errors.length > 0) {
      console.log("\n=== Errors ===");
      result.errors.forEach(({ itemId, error }) => {
        console.log(`  ${itemId}: ${error}`);
      });
    }

    return result;
  } catch (error) {
    console.error("Fatal error during migration:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Execute migration if run directly
 */
if (require.main === module) {
  migrateBomFormulas()
    .then((result) => {
      if (result.errors.length === 0) {
        console.log("\n✅ Migration completed successfully!");
        process.exit(0);
      } else {
        console.log("\n⚠️  Migration completed with errors.");
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error("\n❌ Migration failed:", error);
      process.exit(1);
    });
}

export { migrateBomFormulas };
