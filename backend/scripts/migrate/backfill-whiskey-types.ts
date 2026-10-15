/**
 * Backfill script for whiskeyType field
 *
 * Recalculates and updates the whiskeyType field for all recipes based on their
 * mash bill composition parsed from the recipe name.
 *
 * Whiskey type detection rules (following TTB regulations):
 * - Rye Whiskey: >=51% rye (includes malted rye)
 * - Wheat Whiskey: >=51% wheat
 * - Malt Whiskey: >=51% malted barley
 * - Wheated Bourbon: >=51% corn + wheat present + no rye
 * - Rye Bourbon: >=51% corn + rye present + no wheat
 * - Four Grain Bourbon: >=51% corn + both rye and wheat present
 * - Four Grain Whiskey: 4+ grains present but doesn't meet bourbon criteria
 *
 * Run with: npx ts-node scripts/migrate/backfill-whiskey-types.ts [--dry-run]
 */

import { PrismaClient, EnumRecipeWhiskeyType } from "@prisma/client";

const prisma = new PrismaClient();

// Grain abbreviation mappings
const GRAIN_ABBREVIATIONS: Record<string, string> = {
  C: "Corn",
  R: "Rye",
  Y: "Malted Rye",
  W: "Wheat",
  M: "Malt",
  S: "Specialty",
  B: "Buckwheat",
  O: "Oats",
  Z: "Zinfandel",
};

interface MashBillComponent {
  char: string;
  percentage: number;
  grainName?: string;
  variety?: string;
}

interface ParsedMashBill {
  customerCode: string;
  components: MashBillComponent[];
  revision: number;
  format: "new" | "legacy" | "unknown";
  totalPercentage: number;
  isValid: boolean;
}

/**
 * Detect format of recipe string
 */
function detectFormat(recipeString: string): "new" | "legacy" | "unknown" {
  if (!recipeString || typeof recipeString !== "string") {
    return "unknown";
  }

  const parts = recipeString.split("-");

  if (parts.length < 3) {
    return "unknown";
  }

  // Check for new format: parts after customer code have letter suffixes
  const newFormatPattern = /^\d+(?:\.\d+)?[A-Z]\d*$/;
  const hasLetterSuffixes = parts
    .slice(1)
    .some(
      (part, i) =>
        i < parts.length - 2 &&
        newFormatPattern.test(part) &&
        !/^[Rv]\d+$/.test(part)
    );

  if (hasLetterSuffixes) {
    return "new";
  }

  // Check for legacy format: exactly 4 numeric parts between customer code and revision
  const middleParts = parts.slice(1, -1);
  const allNumeric = middleParts.every((part) => /^\d+$/.test(part));

  if (allNumeric && middleParts.length === 4) {
    return "legacy";
  }

  return "unknown";
}

/**
 * Parse new format recipe string (e.g., "BHK-95R-5M-R04")
 */
function parseNewFormat(recipeString: string): ParsedMashBill {
  const parts = recipeString.split("-");

  if (parts.length < 3) {
    return {
      customerCode: "",
      components: [],
      revision: 0,
      format: "new",
      totalPercentage: 0,
      isValid: false,
    };
  }

  const customerCode = parts[0];
  const components: MashBillComponent[] = [];
  let revision = 1;

  const componentPattern = /^(\d+(?:\.\d+)?)([A-Z])(\d*)$/;

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];

    // Check for revision (R##)
    const revMatch = part.match(/^[Rv](\d+)$/);
    if (revMatch) {
      revision = parseInt(revMatch[1], 10);
      continue;
    }

    // Parse component
    const compMatch = part.match(componentPattern);
    if (compMatch) {
      const [, percentageStr, char, variety] = compMatch;
      const percentage = parseFloat(percentageStr);

      components.push({
        char,
        percentage,
        grainName: GRAIN_ABBREVIATIONS[char] || char,
        variety: variety || undefined,
      });
    }
  }

  const totalPercentage = components.reduce((sum, c) => sum + c.percentage, 0);

  return {
    customerCode,
    components,
    revision,
    format: "new",
    totalPercentage,
    isValid: Math.abs(totalPercentage - 100) < 0.01,
  };
}

/**
 * Parse legacy format recipe string (e.g., "WHK-75-21-00-04-R01")
 */
function parseLegacyFormat(recipeString: string): ParsedMashBill {
  const parts = recipeString.split("-");

  if (parts.length !== 6) {
    return {
      customerCode: "",
      components: [],
      revision: 0,
      format: "legacy",
      totalPercentage: 0,
      isValid: false,
    };
  }

  const customerCode = parts[0];
  const [cornStr, ryeStr, wheatStr, maltStr] = parts.slice(1, 5);
  const revisionPart = parts[5];

  const revisionMatch = revisionPart.match(/^[Rv](\d+)$/);
  const revision = revisionMatch ? parseInt(revisionMatch[1], 10) : 1;

  const corn = parseInt(cornStr, 10) || 0;
  const rye = parseInt(ryeStr, 10) || 0;
  const wheat = parseInt(wheatStr, 10) || 0;
  const malt = parseInt(maltStr, 10) || 0;

  const components: MashBillComponent[] = [];
  if (corn > 0)
    components.push({ char: "C", percentage: corn, grainName: "Corn" });
  if (rye > 0)
    components.push({ char: "R", percentage: rye, grainName: "Rye" });
  if (wheat > 0)
    components.push({ char: "W", percentage: wheat, grainName: "Wheat" });
  if (malt > 0)
    components.push({ char: "M", percentage: malt, grainName: "Malt" });

  const totalPercentage = corn + rye + wheat + malt;

  return {
    customerCode,
    components,
    revision,
    format: "legacy",
    totalPercentage,
    isValid: totalPercentage === 100,
  };
}

/**
 * Parse recipe string (auto-detects format)
 */
function parseRecipeString(recipeString: string): ParsedMashBill {
  const format = detectFormat(recipeString);

  if (format === "new") {
    return parseNewFormat(recipeString);
  } else if (format === "legacy") {
    return parseLegacyFormat(recipeString);
  }

  return {
    customerCode: "",
    components: [],
    revision: 0,
    format: "unknown",
    totalPercentage: 0,
    isValid: false,
  };
}

/**
 * Calculate grain percentages from parsed mash bill
 */
function calculateGrainPercentages(
  parsed: ParsedMashBill
): Record<string, number> {
  const percentages: Record<string, number> = {
    Corn: 0,
    Rye: 0,
    Wheat: 0,
    Malt: 0,
    "Malted Rye": 0,
  };

  for (const component of parsed.components) {
    const grainName =
      component.grainName ||
      GRAIN_ABBREVIATIONS[component.char] ||
      component.char;

    if (grainName === "Corn" || component.char === "C") {
      percentages.Corn += component.percentage;
    } else if (grainName === "Rye" || component.char === "R") {
      percentages.Rye += component.percentage;
    } else if (grainName === "Malted Rye" || component.char === "Y") {
      percentages["Malted Rye"] += component.percentage;
    } else if (grainName === "Wheat" || component.char === "W") {
      percentages.Wheat += component.percentage;
    } else if (grainName === "Malt" || component.char === "M") {
      percentages.Malt += component.percentage;
    }
  }

  return percentages;
}

/**
 * Detect whiskey type based on mash bill composition
 * Matches the backend logic in recipe.generation.ts
 */
function detectWhiskeyType(recipeName: string): EnumRecipeWhiskeyType | null {
  const parsed = parseRecipeString(recipeName);

  if (!parsed.isValid || parsed.components.length === 0) {
    return null;
  }

  const percentages = calculateGrainPercentages(parsed);

  const cornPercent = percentages.Corn;
  const ryePercent = percentages.Rye;
  const wheatPercent = percentages.Wheat;
  const maltPercent = percentages.Malt;
  const maltedRyePercent = percentages["Malted Rye"];

  // Combined rye percentage (regular rye + malted rye)
  const totalRyePercent = ryePercent + maltedRyePercent;

  // Check for primary grain types first (>=51%)
  if (totalRyePercent >= 51) {
    return EnumRecipeWhiskeyType.RyeWhiskey;
  }
  if (wheatPercent >= 51) {
    return EnumRecipeWhiskeyType.WheatWhiskey;
  }
  if (maltPercent >= 51) {
    return EnumRecipeWhiskeyType.MaltWhiskey;
  }

  // Check for bourbon variations (corn >= 51%)
  if (cornPercent >= 51) {
    // Wheated Bourbon: wheat present, no rye
    if (wheatPercent > 0 && totalRyePercent === 0) {
      return EnumRecipeWhiskeyType.WheatedBourbon;
    }
    // Rye Bourbon: rye present, no wheat
    if (totalRyePercent > 0 && wheatPercent === 0) {
      return EnumRecipeWhiskeyType.RyeBourbon;
    }
    // Four Grain Bourbon: both rye and wheat present
    if (totalRyePercent > 0 && wheatPercent > 0) {
      return EnumRecipeWhiskeyType.FourGrainBourbon;
    }
  }

  // Check for four grain whiskey (4+ grains present)
  const grainCount = parsed.components.filter((c) => c.percentage > 0).length;
  if (grainCount >= 4) {
    return EnumRecipeWhiskeyType.FourGrainWhiskey;
  }

  // Default case
  return EnumRecipeWhiskeyType.RyeBourbon;
}

async function backfillWhiskeyTypes(dryRun: boolean = false) {
  console.log("\n=== Backfilling Whiskey Types ===\n");
  console.log(
    `Mode: ${dryRun ? "DRY RUN (no changes will be made)" : "LIVE"}\n`
  );

  // Get all recipes
  const recipes = await prisma.recipe.findMany({
    select: {
      id: true,
      Recipe: true,
      whiskeyType: true,
    },
    orderBy: {
      Recipe: "asc",
    },
  });

  console.log(`Found ${recipes.length} recipes to process\n`);

  let updated = 0;
  let skipped = 0;
  let unchanged = 0;
  let errors = 0;

  const changes: Array<{
    recipe: string;
    oldType: string | null;
    newType: string;
    parsed: string;
  }> = [];

  for (const recipe of recipes) {
    const parsed = parseRecipeString(recipe.Recipe);
    const detectedType = detectWhiskeyType(recipe.Recipe);

    if (!detectedType) {
      console.log(`  ⚠ Skipped: ${recipe.Recipe} (unable to parse mash bill)`);
      skipped++;
      continue;
    }

    const currentType = recipe.whiskeyType;

    if (currentType === detectedType) {
      unchanged++;
      continue;
    }

    // Record the change
    const percentages = calculateGrainPercentages(parsed);
    const parsedInfo = Object.entries(percentages)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${v}% ${k}`)
      .join(", ");

    changes.push({
      recipe: recipe.Recipe,
      oldType: currentType,
      newType: detectedType,
      parsed: parsedInfo,
    });

    if (!dryRun) {
      try {
        await prisma.recipe.update({
          where: { id: recipe.id },
          data: { whiskeyType: detectedType },
        });
        updated++;
        console.log(`  ✓ Updated: ${recipe.Recipe}`);
        console.log(`      ${currentType || "null"} → ${detectedType}`);
        console.log(`      Mash bill: ${parsedInfo}`);
      } catch (error: any) {
        console.error(`  ✗ Error updating ${recipe.Recipe}:`, error.message);
        errors++;
      }
    } else {
      updated++;
      console.log(`  → Would update: ${recipe.Recipe}`);
      console.log(`      ${currentType || "null"} → ${detectedType}`);
      console.log(`      Mash bill: ${parsedInfo}`);
    }
  }

  console.log("\n=== Backfill Summary ===");
  console.log(`  Total recipes: ${recipes.length}`);
  console.log(`  ${dryRun ? "Would update" : "Updated"}: ${updated}`);
  console.log(`  Unchanged: ${unchanged}`);
  console.log(`  Skipped (unparseable): ${skipped}`);
  if (!dryRun) {
    console.log(`  Errors: ${errors}`);
  }

  if (changes.length > 0) {
    console.log("\n=== Changes Detail ===");
    for (const change of changes) {
      console.log(`\n  ${change.recipe}`);
      console.log(`    Old: ${change.oldType || "null"}`);
      console.log(`    New: ${change.newType}`);
      console.log(`    Mash bill: ${change.parsed}`);
    }
  }

  console.log("");
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  try {
    await backfillWhiskeyTypes(dryRun);
  } catch (error) {
    console.error("Error during backfill:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
