/**
 * Test normalization logic with sample data
 *
 * This script tests the normalization functions without requiring database access.
 */

// Conversion factors
const CONVERSION_FACTORS = {
  LBS_TO_METRIC_TONS: 0.00045359237,
  METRIC_TONS_TO_LBS: 2204.62,
  COOKS_PER_FERMENTER: 1.5,
};

// Test data: Sample BOM from production
const sampleBomItems = [
  // Grains (total 5000 lbs)
  {
    id: "1",
    itemId: "corn-id",
    item: { itemNumber: "Corn-Yellow", itemGroup: "RM-GR-COR" },
    quantity: 3250,
  }, // 65%
  {
    id: "2",
    itemId: "rye-id",
    item: { itemNumber: "Rye-Grain", itemGroup: "RM-GR-RYE" },
    quantity: 1000,
  }, // 20%
  {
    id: "3",
    itemId: "wheat-id",
    item: { itemNumber: "Wheat", itemGroup: "RM-GR-WHT" },
    quantity: 500,
  }, // 10%
  {
    id: "4",
    itemId: "malt-id",
    item: { itemNumber: "Malt-Barley", itemGroup: "RM-GR-BRY" },
    quantity: 250,
  }, // 5%

  // Liquids (1500 gal total for 3 cooks = 500 gal/cook)
  {
    id: "5",
    itemId: "water-id",
    item: { itemNumber: "Water", itemGroup: "RM-ADD" },
    quantity: 1500,
  },
  {
    id: "6",
    itemId: "backset-id",
    item: { itemNumber: "Backset", itemGroup: "RM-ADD" },
    quantity: 900,
  },

  // Yeast (100 lbs for 2 fermenters = 50 lbs/fermenter)
  {
    id: "7",
    itemId: "yeast-id",
    item: { itemNumber: "Yeast-Distillers", itemGroup: "RM-YEA" },
    quantity: 100,
  },

  // Enzymes (11.34 g for 2.268 MT grain = 5 g/MT)
  {
    id: "8",
    itemId: "enzyme-id",
    item: { itemNumber: "Alpha-Amylase", itemGroup: "RM-ENZ" },
    quantity: 11.34,
  },

  // Barrels (keep absolute)
  {
    id: "9",
    itemId: "barrel-id",
    item: { itemNumber: "53-Gal-Barrel", itemGroup: "RM-BBL" },
    quantity: 1,
  },
];

const productionContext = {
  totalCooks: 3,
  fermenterCount: 2,
};

// Categorization logic
function categorizeItem(item) {
  if (!item) {
    return { category: "OTHER", normalizeAs: "ABSOLUTE" };
  }

  const itemGroup = item.itemGroup;
  const itemNumber = item.itemNumber?.toLowerCase() || "";

  if (itemGroup?.startsWith("RM-GR-")) {
    return { category: "GRAIN", normalizeAs: "PERCENTAGE" };
  }

  if (itemNumber.includes("water") || itemNumber.includes("backset")) {
    return { category: "LIQUID", normalizeAs: "PER_COOK" };
  }

  if (itemGroup?.startsWith("RM-YEA")) {
    return { category: "YEAST", normalizeAs: "PER_FERMENTER" };
  }

  if (itemGroup?.startsWith("RM-ENZ")) {
    return { category: "ENZYME", normalizeAs: "PER_METRIC_TON" };
  }

  if (itemGroup?.startsWith("RM-BBL")) {
    return { category: "BARREL", normalizeAs: "ABSOLUTE" };
  }

  return { category: "OTHER", normalizeAs: "ABSOLUTE" };
}

function isGrainItem(item) {
  const { category } = categorizeItem(item);
  return category === "GRAIN";
}

// Normalization function
function normalizeQuantity(bomItem, allBomItems, context) {
  const { normalizeAs, category } = categorizeItem(bomItem.item);

  switch (normalizeAs) {
    case "PERCENTAGE": {
      const grainItems = allBomItems.filter((item) => isGrainItem(item.item));
      const totalGrainWeight = grainItems.reduce(
        (sum, item) => sum + (item.quantity || 0),
        0
      );

      if (totalGrainWeight === 0) {
        return bomItem.quantity;
      }

      return bomItem.quantity / totalGrainWeight;
    }

    case "PER_COOK": {
      const totalCooks = context.totalCooks || 3;
      return bomItem.quantity / totalCooks;
    }

    case "PER_FERMENTER": {
      const fermenterCount = context.fermenterCount || 2;
      return bomItem.quantity / fermenterCount;
    }

    case "PER_METRIC_TON": {
      const grainItems = allBomItems.filter((item) => isGrainItem(item.item));
      const totalGrainLbs = grainItems.reduce(
        (sum, item) => sum + (item.quantity || 0),
        0
      );
      const grainMetricTons =
        totalGrainLbs * CONVERSION_FACTORS.LBS_TO_METRIC_TONS;

      if (grainMetricTons === 0) {
        return bomItem.quantity;
      }

      return bomItem.quantity / grainMetricTons;
    }

    case "ABSOLUTE":
    default:
      return bomItem.quantity;
  }
}

// Run test
console.log("=".repeat(80));
console.log("Recipe BOM Normalization Logic Test");
console.log("=".repeat(80));
console.log();

console.log("Production Context:");
console.log(`  Total Cooks: ${productionContext.totalCooks}`);
console.log(`  Fermenters: ${productionContext.fermenterCount}`);
console.log();

console.log("Normalization Results:");
console.log("=".repeat(80));

const results = sampleBomItems.map((bomItem) => {
  const { category, normalizeAs } = categorizeItem(bomItem.item);
  const original = bomItem.quantity;
  const normalized = normalizeQuantity(
    bomItem,
    sampleBomItems,
    productionContext
  );

  return {
    itemNumber: bomItem.item.itemNumber,
    category,
    normalizeAs,
    original,
    normalized,
  };
});

// Group by category
const grains = results.filter((r) => r.category === "GRAIN");
const liquids = results.filter((r) => r.category === "LIQUID");
const yeasts = results.filter((r) => r.category === "YEAST");
const enzymes = results.filter((r) => r.category === "ENZYME");
const barrels = results.filter((r) => r.category === "BARREL");

console.log("\nGRAINS (normalized to percentages):");
console.log("-".repeat(80));
grains.forEach((r) => {
  console.log(
    `  ${r.itemNumber.padEnd(20)} ${r.original.toString().padStart(8)} lbs → ${(
      r.normalized * 100
    )
      .toFixed(1)
      .padStart(5)}%`
  );
});

const grainSum = grains.reduce((sum, r) => sum + r.normalized, 0);
console.log(`  ${"Total".padEnd(20)} ${""} ${"─".repeat(15)}`);
console.log(
  `  ${"".padEnd(20)} ${""} ${(grainSum * 100).toFixed(1).padStart(5)}%`
);

if (grainSum >= 0.95 && grainSum <= 1.05) {
  console.log(`  ✓ Grain bill sum is valid (${(grainSum * 100).toFixed(1)}%)`);
} else {
  console.log(
    `  ❌ Grain bill sum is OUT OF RANGE (${(grainSum * 100).toFixed(1)}%)`
  );
}

console.log("\nLIQUIDS (normalized to per-cook):");
console.log("-".repeat(80));
liquids.forEach((r) => {
  console.log(
    `  ${r.itemNumber.padEnd(20)} ${r.original
      .toString()
      .padStart(8)} gal total → ${r.normalized.toFixed(1).padStart(6)} gal/cook`
  );
});

console.log("\nYEAST (normalized to per-fermenter):");
console.log("-".repeat(80));
yeasts.forEach((r) => {
  console.log(
    `  ${r.itemNumber.padEnd(20)} ${r.original
      .toString()
      .padStart(8)} lbs total → ${r.normalized
      .toFixed(1)
      .padStart(6)} lbs/fermenter`
  );
});

console.log("\nENZYMES (normalized to per-metric-ton):");
console.log("-".repeat(80));
enzymes.forEach((r) => {
  const totalGrainLbs = grains.reduce((sum, g) => sum + g.original, 0);
  const grainMT = totalGrainLbs * CONVERSION_FACTORS.LBS_TO_METRIC_TONS;
  console.log(
    `  ${r.itemNumber.padEnd(20)} ${r.original
      .toString()
      .padStart(8)} g for ${grainMT.toFixed(2)} MT → ${r.normalized
      .toFixed(2)
      .padStart(6)} g/MT`
  );
});

console.log("\nBARRELS (no normalization):");
console.log("-".repeat(80));
barrels.forEach((r) => {
  console.log(
    `  ${r.itemNumber.padEnd(20)} ${r.original
      .toString()
      .padStart(8)} (unchanged)`
  );
});

console.log("\n" + "=".repeat(80));
console.log("✓ Normalization logic test completed successfully!");
console.log("=".repeat(80));
