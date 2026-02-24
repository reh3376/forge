/**
 * Bom → RecipeBom Migration Script
 *
 * Converts existing Bom/BomItem records into RecipeBom/RecipeBomItem structure.
 *
 * Usage:
 *   node apps/whk-recipe-configuration/scripts/sql/migrate-bom-to-recipe-bom.js [options]
 *
 * Options:
 *   --execute    Execute the migration (default is dry-run)
 *   --verbose    Enable verbose logging
 *   --help       Show this help message
 */

const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");

// Simple CUID generator (compatible with Prisma's default)
function createId() {
  // Generate a random ID similar to cuid format
  const timestamp = Date.now().toString(36);
  const randomPart = crypto
    .randomBytes(12)
    .toString("base64")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase()
    .substring(0, 12);
  return `c${timestamp}${randomPart}`;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

// Normalized unit IDs for Recipe BOM display
const NORMALIZED_UNIT_IDS = {
  PERCENTAGE: "cmi3hcrj90003obdo89sx9m90", // Percentage - for grains
  PER_FERMENTER: "cmi3hcrs70007obdolqukpdrp", // Pounds per Fermenter - for yeast
  PER_COOK_ENZYME: "cmi3hj91l0003shwf8szda3yb", // Pounds per Cook (Enzyme) - for enzymes
  PER_COOK_LIQUID: "cmi3hgzhu0003avdsqcpw07pt", // Gallons per Cook - for water/backset
};

const ITEM_GROUP_TO_OPERATION_MAP = {
  "RM-GR-COR": "Mashing01", // Corn
  "RM-GR-CRN": "Mashing01", // Corn (alternative spelling)
  "RM-GR-RYE": "Mashing01", // Rye
  "RM-GR-WHT": "Mashing01", // Wheat
  "RM-GR-BRY": "Mashing01", // Malted Barley
  "RM-ENZ": "Mashing01", // Enzymes (prefix match)
  "RM-ADD": "Mashing01", // Additives (backset, water, etc.)
  "RM-YEA": "Fermentation01", // Yeast
  "RM-BBL": "Processing01", // Barrel
};

// Special item number patterns for items without ItemGroups
const ITEM_NUMBER_PATTERNS = {
  Mashing01: ["Water", "Backset", "water", "backset"],
  Fermentation01: ["yeast", "YEAST", "Yeast"],
  Processing01: ["BBL", "bbl", "barrel", "BARREL"],
};

const DEFAULT_OPERATION = "Mashing01";

// Grain bill tolerance (percentage points)
const GRAIN_BILL_TOLERANCE = 5; // ±5%

// Conversion factors
const CONVERSION_FACTORS = {
  LBS_TO_METRIC_TONS: 0.00045359237,
  METRIC_TONS_TO_LBS: 2204.62,
  COOKS_PER_FERMENTER: 1.5, // Default facility ratio
};

// Default production context values (fallback)
const DEFAULT_PRODUCTION_CONTEXT = {
  totalCooks: 3,
  fermenterCount: 2,
};

// ============================================================================
// COMMAND LINE ARGUMENTS
// ============================================================================

const args = process.argv.slice(2);
const DRY_RUN = !args.includes("--execute");
const VERBOSE = args.includes("--verbose");
const SHOW_HELP = args.includes("--help");

if (SHOW_HELP) {
  console.log(`
Bom → RecipeBom Migration Script

Usage:
  node apps/whk-recipe-configuration/scripts/sql/migrate-bom-to-recipe-bom.js [options]

Options:
  --execute    Execute the migration (default is dry-run mode)
  --verbose    Enable verbose logging
  --help       Show this help message

Examples:
  # Preview changes without committing
  node apps/whk-recipe-configuration/scripts/sql/migrate-bom-to-recipe-bom.js

  # Execute migration
  node apps/whk-recipe-configuration/scripts/sql/migrate-bom-to-recipe-bom.js --execute

  # Execute with verbose logging
  node apps/whk-recipe-configuration/scripts/sql/migrate-bom-to-recipe-bom.js --execute --verbose
`);
  process.exit(0);
}

// ============================================================================
// INITIALIZE PRISMA CLIENT
// ============================================================================

const prismaConfig = process.env.DATABASE_URL
  ? {
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    }
  : {};

const prisma = new PrismaClient(prismaConfig);

// ============================================================================
// LOGGING UTILITIES
// ============================================================================

function log(message, level = "info") {
  const timestamp = new Date().toISOString();
  const prefix =
    {
      info: "📋",
      success: "✅",
      warning: "⚠️",
      error: "❌",
      debug: "🔍",
    }[level] || "ℹ️";

  console.log(`${prefix} [${timestamp}] ${message}`);
}

function verbose(message) {
  if (VERBOSE) {
    log(message, "debug");
  }
}

// ============================================================================
// STATISTICS TRACKING
// ============================================================================

const stats = {
  bomsProcessed: 0,
  bomsMatched: 0,
  bomsSkipped: 0,
  recipeBomsCreated: 0,
  recipeBomItemsCreated: 0,
  recipeBomItemsClassDefinitions: 0,
  recipeBomItemsInstances: 0,
  operationCounts: {
    Mashing01: 0,
    Fermentation01: 0,
    Distillation01: 0,
    Processing01: 0,
  },
  warnings: [],
  skippedBoms: [],
  errors: [],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Determine operation from ItemGroup (scalar string field) or item number patterns
 */
function determineOperation(item) {
  if (!item) {
    return DEFAULT_OPERATION;
  }

  // First, try ItemGroup if available
  if (item.itemGroup) {
    const groupName = item.itemGroup; // itemGroup is a string, not an object

    // Check for exact match
    if (ITEM_GROUP_TO_OPERATION_MAP[groupName]) {
      return ITEM_GROUP_TO_OPERATION_MAP[groupName];
    }

    // Check for prefix match (e.g., RM-ENZ-* matches RM-ENZ)
    for (const [prefix, operation] of Object.entries(
      ITEM_GROUP_TO_OPERATION_MAP
    )) {
      if (groupName.startsWith(prefix)) {
        return operation;
      }
    }

    // ItemGroup exists but not recognized
    verbose(
      `ItemGroup ${groupName} not recognized for item ${item.itemNumber}, checking item number patterns`
    );
  }

  // Fallback: Check item number/name patterns
  const itemIdentifier = item.itemNumber || item.name || "";
  for (const [operation, patterns] of Object.entries(ITEM_NUMBER_PATTERNS)) {
    for (const pattern of patterns) {
      if (itemIdentifier.includes(pattern)) {
        verbose(
          `Matched item ${itemIdentifier} to ${operation} by pattern "${pattern}"`
        );
        return operation;
      }
    }
  }

  // Final fallback
  if (!item.itemGroup) {
    verbose(
      `Item ${
        item.itemNumber || "unknown"
      } has no ItemGroup and no pattern match, defaulting to ${DEFAULT_OPERATION}`
    );
  }
  return DEFAULT_OPERATION;
}

/**
 * Categorize item to determine normalization strategy
 */
function categorizeItem(item) {
  if (!item) {
    return { category: "OTHER", normalizeAs: "ABSOLUTE" };
  }

  const itemGroup = item.itemGroup;
  const itemNumber = item.itemNumber?.toLowerCase() || "";

  // Grains
  if (itemGroup?.startsWith("RM-GR-")) {
    return {
      category: "GRAIN",
      normalizeAs: "PERCENTAGE",
    };
  }

  // Water/Backset
  if (itemNumber.includes("water") || itemNumber.includes("backset")) {
    return {
      category: "LIQUID",
      normalizeAs: "PER_COOK",
    };
  }

  // Yeast
  if (itemGroup?.startsWith("RM-YEA")) {
    return {
      category: "YEAST",
      normalizeAs: "PER_FERMENTER",
    };
  }

  // Enzymes
  if (itemGroup?.startsWith("RM-ENZ")) {
    return {
      category: "ENZYME",
      normalizeAs: "PER_METRIC_TON",
    };
  }

  // Barrels
  if (itemGroup?.startsWith("RM-BBL")) {
    return {
      category: "BARREL",
      normalizeAs: "ABSOLUTE",
    };
  }

  // Additives - keep absolute for now
  if (itemGroup?.startsWith("RM-ADD")) {
    return {
      category: "ADDITIVE",
      normalizeAs: "ABSOLUTE",
    };
  }

  // Default
  return {
    category: "OTHER",
    normalizeAs: "ABSOLUTE",
  };
}

/**
 * Check if an item is a grain item
 */
function isGrainItem(item) {
  const { category } = categorizeItem(item);
  return category === "GRAIN";
}

/**
 * Normalize quantity based on item category
 */
function normalizeQuantity(bomItem, allBomItems, context) {
  const { normalizeAs } = categorizeItem(bomItem.item);

  try {
    switch (normalizeAs) {
      case "PERCENTAGE": {
        // Calculate total grain weight
        const grainItems = allBomItems.filter((item) => isGrainItem(item.item));
        const totalGrainWeight = grainItems.reduce(
          (sum, item) => sum + (item.quantity || 0),
          0
        );

        if (totalGrainWeight === 0) {
          stats.warnings.push(
            `Cannot normalize grain ${bomItem.item?.itemNumber}: total grain weight is zero`
          );
          return bomItem.quantity;
        }

        // Return as decimal (0.65 for 65%)
        const percentage = bomItem.quantity / totalGrainWeight;
        verbose(
          `  [GRAIN] ${bomItem.item?.itemNumber}: ${bomItem.quantity} lbs → ${(
            percentage * 100
          ).toFixed(1)}% of grain bill`
        );
        return percentage;
      }

      case "PER_COOK": {
        const totalCooks =
          context.totalCooks || DEFAULT_PRODUCTION_CONTEXT.totalCooks;
        if (!context.totalCooks) {
          verbose(
            `  [LIQUID] ${bomItem.item?.itemNumber}: Using default ${totalCooks} cooks (no production history)`
          );
        }

        const perCook = bomItem.quantity / totalCooks;
        verbose(
          `  [LIQUID] ${bomItem.item?.itemNumber}: ${
            bomItem.quantity
          } total → ${perCook.toFixed(1)} per cook (${totalCooks} cooks)`
        );
        return perCook;
      }

      case "PER_FERMENTER": {
        const fermenterCount =
          context.fermenterCount || DEFAULT_PRODUCTION_CONTEXT.fermenterCount;
        if (!context.fermenterCount) {
          verbose(
            `  [YEAST] ${bomItem.item?.itemNumber}: Using default ${fermenterCount} fermenters (no production history)`
          );
        }

        const perFermenter = bomItem.quantity / fermenterCount;
        verbose(
          `  [YEAST] ${bomItem.item?.itemNumber}: ${
            bomItem.quantity
          } total → ${perFermenter.toFixed(
            1
          )} per fermenter (${fermenterCount} fermenters)`
        );
        return perFermenter;
      }

      case "PER_METRIC_TON": {
        // Calculate total grain weight in metric tons
        const grainItems = allBomItems.filter((item) => isGrainItem(item.item));
        const totalGrainLbs = grainItems.reduce(
          (sum, item) => sum + (item.quantity || 0),
          0
        );
        const grainMetricTons =
          totalGrainLbs * CONVERSION_FACTORS.LBS_TO_METRIC_TONS;

        if (grainMetricTons === 0) {
          stats.warnings.push(
            `Cannot normalize enzyme ${bomItem.item?.itemNumber}: total grain weight is zero`
          );
          return bomItem.quantity;
        }

        const perMetricTon = bomItem.quantity / grainMetricTons;
        verbose(
          `  [ENZYME] ${bomItem.item?.itemNumber}: ${
            bomItem.quantity
          } g for ${grainMetricTons.toFixed(2)} MT → ${perMetricTon.toFixed(
            2
          )} g/MT`
        );
        return perMetricTon;
      }

      case "ABSOLUTE":
      default:
        verbose(
          `  [${categorizeItem(bomItem.item).category}] ${
            bomItem.item?.itemNumber
          }: ${bomItem.quantity} (no normalization)`
        );
        return bomItem.quantity;
    }
  } catch (error) {
    stats.warnings.push(
      `Error normalizing ${bomItem.item?.itemNumber}: ${error.message}`
    );
    return bomItem.quantity; // Fallback to original quantity
  }
}

/**
 * Extract production context from ScheduleOrders (which have totalCooks)
 */
async function getProductionContext(bom) {
  // First, find ProductionOrders that used this BOM
  const productionOrders = await prisma.productionOrder.findMany({
    where: { bomId: bom.id },
    select: {
      id: true,
      scheduleOrderId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (productionOrders.length === 0) {
    verbose(
      `No production history for BOM ${bom.bomRevision}, will use defaults`
    );
    return {
      totalCooks: null,
      fermenterCount: null,
      useDefaults: true,
      source: "default",
    };
  }

  // Get ScheduleOrders that have totalCooks information
  const scheduleOrderIds = productionOrders
    .map((po) => po.scheduleOrderId)
    .filter((id) => id != null);

  if (scheduleOrderIds.length === 0) {
    verbose(
      `No ScheduleOrders found for BOM ${bom.bomRevision}, will use defaults`
    );
    return {
      totalCooks: null,
      fermenterCount: null,
      useDefaults: true,
      source: "default",
    };
  }

  const scheduleOrders = await prisma.scheduleOrder.findMany({
    where: {
      id: { in: scheduleOrderIds },
    },
    select: {
      totalCooks: true,
      plannedCooks: true,
      executedCooks: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (scheduleOrders.length === 0) {
    verbose(
      `No ScheduleOrders data for BOM ${bom.bomRevision}, will use defaults`
    );
    return {
      totalCooks: null,
      fermenterCount: null,
      useDefaults: true,
      source: "default",
    };
  }

  // Use most recent schedule order, prefer totalCooks, then executedCooks, then plannedCooks
  const mostRecent = scheduleOrders[0];
  const totalCooks =
    mostRecent.totalCooks ||
    mostRecent.executedCooks ||
    mostRecent.plannedCooks;

  if (!totalCooks) {
    verbose(
      `ScheduleOrder found but no cook count data for BOM ${bom.bomRevision}, will use defaults`
    );
    return {
      totalCooks: null,
      fermenterCount: null,
      useDefaults: true,
      source: "default",
    };
  }

  // Calculate fermenter count from cook count
  const fermenterCount = Math.ceil(
    totalCooks / CONVERSION_FACTORS.COOKS_PER_FERMENTER
  );

  // Check for conflicting production history
  if (scheduleOrders.length > 1) {
    const cookCounts = scheduleOrders
      .map((so) => so.totalCooks || so.executedCooks || so.plannedCooks)
      .filter((c) => c != null);
    const uniqueCounts = [...new Set(cookCounts)];

    if (uniqueCounts.length > 1) {
      verbose(
        `BOM ${
          bom.bomRevision
        } used with varying cook counts: ${uniqueCounts.join(
          ", "
        )}, using most recent: ${totalCooks}`
      );
    }
  }

  return {
    totalCooks,
    fermenterCount,
    useDefaults: false,
    source: "schedule_order",
    scheduleOrderCount: scheduleOrders.length,
  };
}

/**
 * Validate normalized quantities
 */
function validateNormalizedItems(recipeBomItems, recipe, bomRevision) {
  const errors = [];
  const warnings = [];

  // Check 1: Grain bill sum (should be close to 100% = 1.0)
  const grainItems = recipeBomItems.filter(
    (item) =>
      item.operation === "Mashing01" &&
      isGrainItem({ itemGroup: item._itemGroup })
  );

  if (grainItems.length > 0) {
    const grainSum = grainItems.reduce(
      (sum, item) => sum + (item.quantity || 0),
      0
    );

    // Allow 95-105% tolerance
    if (grainSum < 0.95 || grainSum > 1.05) {
      errors.push({
        type: "GRAIN_SUM_OUT_OF_RANGE",
        message: `Grain percentages sum to ${(grainSum * 100).toFixed(
          1
        )}%, expected 95-105%`,
        value: grainSum,
      });
    } else {
      verbose(`  ✓ Grain bill validation: ${(grainSum * 100).toFixed(1)}%`);
    }

    // Check 2: Compare against recipe mashBill if available
    if (recipe.mashBill) {
      const expectedPercentages = recipe.mashBill
        .split("-")
        .map((p) => parseFloat(p) / 100)
        .sort((a, b) => b - a); // Sort descending

      const actualPercentages = grainItems
        .map((item) => item.quantity)
        .sort((a, b) => b - a);

      let totalDiff = 0;
      expectedPercentages.forEach((expected, idx) => {
        const actual = actualPercentages[idx] || 0;
        const diff = Math.abs(expected - actual);
        totalDiff += diff;

        if (diff > 0.02) {
          // 2% tolerance per grain
          warnings.push({
            type: "MASHBILL_MISMATCH",
            message: `Grain #${idx + 1}: Expected ${(expected * 100).toFixed(
              0
            )}%, got ${(actual * 100).toFixed(0)}%`,
            expected,
            actual,
            difference: diff,
          });
        }
      });

      if (totalDiff < 0.05) {
        verbose(`  ✓ Mashbill comparison: matches recipe ${recipe.mashBill}`);
      }
    }

    // Check 3: Individual grain percentages should be reasonable
    grainItems.forEach((item) => {
      if (item.quantity < 0.01 || item.quantity > 1.0) {
        errors.push({
          type: "GRAIN_PERCENTAGE_OUT_OF_RANGE",
          message: `${item._itemNumber} has invalid percentage: ${(
            item.quantity * 100
          ).toFixed(1)}%`,
          itemNumber: item._itemNumber,
          value: item.quantity,
        });
      }
    });
  }

  // Check 4: Water per cook range (300-800 gallons typical)
  const waterItems = recipeBomItems.filter(
    (item) =>
      item.operation === "Mashing01" &&
      (item._itemNumber?.toLowerCase().includes("water") ||
        item._itemNumber?.toLowerCase().includes("backset"))
  );

  waterItems.forEach((item) => {
    if (item.quantity < 300 || item.quantity > 800) {
      warnings.push({
        type: "WATER_QUANTITY_UNUSUAL",
        message: `${item._itemNumber} quantity ${item.quantity.toFixed(
          0
        )} gal/cook is outside typical range (300-800)`,
        itemNumber: item._itemNumber,
        value: item.quantity,
      });
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Report validation results
 */
function reportValidationResults(bomRevision, validation) {
  if (!validation.isValid || validation.warnings.length > 0) {
    verbose(`\n  Validation for ${bomRevision}:`);

    if (validation.errors.length > 0) {
      validation.errors.forEach((error) => {
        log(`    ❌ ${error.message}`, "error");
        stats.errors.push(`${bomRevision}: ${error.message}`);
      });
    }

    if (validation.warnings.length > 0) {
      validation.warnings.forEach((warning) => {
        verbose(`    ⚠️  ${warning.message}`);
        stats.warnings.push(`${bomRevision}: ${warning.message}`);
      });
    }
  }
}

/**
 * Find the most recent Recipe that produces the given finished good Item
 */
function findRecipeForBom(bom, recipes, productionOrders) {
  // Strategy: Find all Recipes via ProductionOrders that have this Bom's itemId as fgItemId
  const matchingRecipes = recipes.filter((recipe) => {
    // Find ProductionOrders that use this recipe and have matching fgItemId
    const hasMatchingPO = productionOrders.some(
      (po) => po.recipeId === recipe.id && po.fgItemId === bom.itemId
    );
    return hasMatchingPO;
  });

  if (matchingRecipes.length === 0) {
    return null;
  }

  // Sort by updatedAt descending and take the most recent
  matchingRecipes.sort((a, b) => b.updatedAt - a.updatedAt);

  verbose(
    `Found ${matchingRecipes.length} matching Recipe(s) for Bom ${bom.bomRevision}, selected most recent: ${matchingRecipes[0].Recipe}`
  );

  return matchingRecipes[0];
}

/**
 * Check if RecipeBom already exists for this Bom
 */
function recipeBomExists(bom, existingRecipeBoms) {
  return existingRecipeBoms.some((rb) => rb.revision === bom.bomRevision);
}

/**
 * Create metadata JSON for RecipeBomItem
 */
function createMetadata(bomItem) {
  return {
    originalBomItemId: bomItem.id,
    quantityActual: bomItem.quantityActual,
    lotId: bomItem.lotId,
    consumedAt: bomItem.consumedAt,
    classId: bomItem.classId,
    isClassDefinition: bomItem.isClassDefinition,
  };
}

/**
 * Validate grain bill total (should sum to ~100% for mashing items)
 */
function validateGrainBill(recipeBomItems) {
  const mashingItems = recipeBomItems.filter(
    (item) => item.operation === "Mashing01"
  );
  const total = mashingItems.reduce(
    (sum, item) => sum + (item.quantity || 0),
    0
  );

  const lowerBound = 100 - GRAIN_BILL_TOLERANCE;
  const upperBound = 100 + GRAIN_BILL_TOLERANCE;

  if (total < lowerBound || total > upperBound) {
    return {
      valid: false,
      total,
      message: `Grain bill total ${total.toFixed(
        2
      )}% outside acceptable range (${lowerBound}-${upperBound}%)`,
    };
  }

  return {
    valid: true,
    total,
  };
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchData() {
  log("Fetching data from database...");

  verbose("Fetching Boms with BomItems...");
  const boms = await prisma.bom.findMany({
    include: {
      bomItem: {
        include: {
          item: true, // Item includes itemGroup as a scalar string field
          instances: true, // Include sub-BomItem instances
        },
      },
      item: true, // Finished good item
    },
  });
  verbose(`Fetched ${boms.length} Boms`);

  verbose("Fetching Recipes...");
  const recipes = await prisma.recipe.findMany({
    where: {
      isClassDefinition: true, // Only master recipes
      active: true,
    },
  });
  verbose(`Fetched ${recipes.length} Recipes`);

  verbose("Fetching ProductionOrders for Recipe matching...");
  const productionOrders = await prisma.productionOrder.findMany({
    select: {
      id: true,
      recipeId: true,
      fgItemId: true,
      bomId: true,
    },
  });
  verbose(`Fetched ${productionOrders.length} ProductionOrders`);

  verbose("Fetching existing RecipeBoms...");
  const existingRecipeBoms = await prisma.recipeBom.findMany({
    select: {
      id: true,
      revision: true,
    },
  });
  verbose(`Fetched ${existingRecipeBoms.length} existing RecipeBoms`);

  return {
    boms,
    recipes,
    productionOrders,
    existingRecipeBoms,
  };
}

// ============================================================================
// MIGRATION LOGIC
// ============================================================================

async function migrateBom(bom, recipe, existingRecipeBoms) {
  verbose(`\nProcessing Bom ${bom.bomRevision} → Recipe ${recipe.Recipe}`);

  // Check if already migrated
  if (recipeBomExists(bom, existingRecipeBoms)) {
    verbose(`RecipeBom for ${bom.bomRevision} already exists, skipping`);
    return null;
  }

  // Get production context for normalization
  const context = await getProductionContext(bom);
  if (context.source === "schedule_order") {
    verbose(
      `Production context: ${context.totalCooks} cooks, ${context.fermenterCount} fermenters (from ${context.scheduleOrderCount} schedule orders)`
    );
  } else {
    verbose(
      `Production context: Using defaults (${DEFAULT_PRODUCTION_CONTEXT.totalCooks} cooks, ${DEFAULT_PRODUCTION_CONTEXT.fermenterCount} fermenters)`
    );
  }

  // Create RecipeBom
  const recipeBomId = createId();
  const recipeBom = {
    id: recipeBomId,
    revision: bom.bomRevision,
    master: true,
    running: false,
    createdAt: bom.createdAt,
    updatedAt: bom.editedAt || bom.updatedAt,
    schemaVersion: "1.0",
  };

  // Create RecipeBomItems
  // First pass: Create RecipeBomItems and track ID mappings for class/instance relationships
  const bomItemIdMap = new Map(); // Maps old BomItem ID → new RecipeBomItem ID
  const recipeBomItems = [];

  for (const bomItem of bom.bomItem) {
    const operation = determineOperation(bomItem.item);
    const metadata = createMetadata(bomItem);
    const newRecipeBomItemId = createId();

    // Normalize quantity based on item category
    const normalizedQuantity = normalizeQuantity(bomItem, bom.bomItem, context);

    // Determine displayUnitsId based on normalization type
    const { normalizeAs } = categorizeItem(bomItem.item);
    let displayUnitsId;
    switch (normalizeAs) {
      case "PERCENTAGE":
        displayUnitsId = NORMALIZED_UNIT_IDS.PERCENTAGE;
        break;
      case "PER_FERMENTER":
        displayUnitsId = NORMALIZED_UNIT_IDS.PER_FERMENTER;
        break;
      case "PER_METRIC_TON":
        // Enzymes use lbs/cook as final result
        displayUnitsId = NORMALIZED_UNIT_IDS.PER_COOK_ENZYME;
        break;
      case "PER_COOK":
        displayUnitsId = NORMALIZED_UNIT_IDS.PER_COOK_LIQUID;
        break;
      case "ABSOLUTE":
      default:
        // For non-normalized items, use original units
        displayUnitsId = bomItem.item?.unitsId || null;
        break;
    }

    // Store mapping for later reference
    bomItemIdMap.set(bomItem.id, newRecipeBomItemId);

    recipeBomItems.push({
      id: newRecipeBomItemId,
      recipeBomsId: recipeBomId,
      itemId: bomItem.itemId,
      operation,
      quantity: normalizedQuantity, // Use normalized quantity
      displayUnitsId,
      isClassDefinition: bomItem.isClassDefinition, // Preserve original class/instance status
      createdBy: bomItem.createdBy,
      // Note: updatedBy is DateTime in RecipeBomItem schema, not string
      updatedBy: bomItem.updatedAt, // Use updatedAt timestamp instead
      createdAt: bomItem.createdAt,
      updatedAt: bomItem.updatedAt,
      globalId: createId(),
      // Store original BomItem classId for second pass
      _originalClassId: bomItem.classId,
      _originalBomItemId: bomItem.id,
      // Store itemGroup and itemNumber for validation (temporary fields)
      _itemGroup: bomItem.item?.itemGroup,
      _itemNumber: bomItem.item?.itemNumber,
    });

    stats.operationCounts[operation]++;

    // Track class vs instance stats
    if (bomItem.isClassDefinition) {
      stats.recipeBomItemsClassDefinitions++;
    } else {
      stats.recipeBomItemsInstances++;
    }
  }

  // Second pass: Set activeInstanceId for items that reference a class
  for (const recipeBomItem of recipeBomItems) {
    if (recipeBomItem._originalClassId) {
      const classRecipeBomItemId = bomItemIdMap.get(
        recipeBomItem._originalClassId
      );
      if (classRecipeBomItemId) {
        recipeBomItem.activeInstanceId = classRecipeBomItemId;
        verbose(
          `Linking RecipeBomItem ${recipeBomItem.id} to class ${classRecipeBomItemId}`
        );
      } else {
        stats.warnings.push(
          `BomItem ${recipeBomItem._originalBomItemId} references classId ${recipeBomItem._originalClassId} which wasn't found in this Bom`
        );
      }
    }
  }

  // Validate normalized quantities
  const validation = validateNormalizedItems(
    recipeBomItems,
    recipe,
    bom.bomRevision
  );
  reportValidationResults(bom.bomRevision, validation);

  // Clean up temporary fields before returning
  for (const recipeBomItem of recipeBomItems) {
    delete recipeBomItem._originalClassId;
    delete recipeBomItem._originalBomItemId;
    delete recipeBomItem._itemGroup;
    delete recipeBomItem._itemNumber;
  }

  return {
    recipeBom,
    recipeBomItems,
    recipeId: recipe.id,
    metadata: {
      bomId: bom.id,
      bomRevision: bom.bomRevision,
      recipeName: recipe.Recipe,
      itemCount: recipeBomItems.length,
    },
  };
}

async function executeMigration(migrationData) {
  log("Executing migration in database transaction...");

  let created = 0;
  const BATCH_SIZE = 10; // Process 10 RecipeBOMs at a time

  try {
    // Process in batches to avoid transaction timeout
    for (let i = 0; i < migrationData.length; i += BATCH_SIZE) {
      const batch = migrationData.slice(i, i + BATCH_SIZE);

      log(
        `Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
          migrationData.length / BATCH_SIZE
        )} (${batch.length} RecipeBOMs)...`
      );

      await prisma.$transaction(
        async (tx) => {
          for (const data of batch) {
            // Create RecipeBom
            await tx.recipeBom.create({
              data: data.recipeBom,
            });

            // Bulk create RecipeBomItems using createMany for better performance
            if (data.recipeBomItems.length > 0) {
              await tx.recipeBomItem.createMany({
                data: data.recipeBomItems,
              });
            }

            // Link RecipeBom to Recipe via join table
            await tx.$executeRaw`
            INSERT INTO "_RecipeToRecipeBom" ("A", "B")
            VALUES (${data.recipeId}, ${data.recipeBom.id})
          `;

            created++;
            verbose(
              `Created RecipeBom ${data.recipeBom.revision} with ${data.recipeBomItems.length} items`
            );
          }
        },
        {
          maxWait: 10000, // 10 seconds max wait to start transaction
          timeout: 60000, // 60 seconds timeout for transaction
        }
      );

      log(`Batch completed. Total created: ${created}/${migrationData.length}`);
    }

    log(`Successfully created ${created} RecipeBoms`, "success");
  } catch (error) {
    log(`Migration failed: ${error.message}`, "error");
    stats.errors.push(error.message);
    throw error;
  }
}

// ============================================================================
// MAIN MIGRATION FUNCTION
// ============================================================================

async function main() {
  console.log("\n" + "=".repeat(80));
  console.log("  Recipe BOM Migration Script");
  console.log("=".repeat(80));
  console.log(
    `Mode: ${
      DRY_RUN ? "DRY RUN (preview only)" : "EXECUTE (will commit changes)"
    }`
  );
  console.log(`Verbose: ${VERBOSE ? "enabled" : "disabled"}`);
  console.log("=".repeat(80) + "\n");

  try {
    // Fetch all data
    const { boms, recipes, productionOrders, existingRecipeBoms } =
      await fetchData();

    log(`Processing ${boms.length} Boms...`);

    const migrationData = [];

    // Process each Bom
    for (const bom of boms) {
      stats.bomsProcessed++;

      // Find matching Recipe
      const recipe = findRecipeForBom(bom, recipes, productionOrders);

      if (!recipe) {
        verbose(
          `No Recipe found for Bom ${bom.bomRevision} (itemId: ${bom.itemId})`
        );
        stats.bomsSkipped++;
        stats.skippedBoms.push({
          bomRevision: bom.bomRevision,
          itemId: bom.itemId,
          itemNumber: bom.item?.itemNumber || "unknown",
        });
        continue;
      }

      stats.bomsMatched++;

      // Migrate this Bom
      const data = await migrateBom(bom, recipe, existingRecipeBoms);

      if (data) {
        migrationData.push(data);
        stats.recipeBomsCreated++;
        stats.recipeBomItemsCreated += data.recipeBomItems.length;
      }
    }

    // Execute migration if not dry-run
    if (!DRY_RUN && migrationData.length > 0) {
      await executeMigration(migrationData);
    }

    // Print report
    printReport();
  } catch (error) {
    log(`Fatal error: ${error.message}`, "error");
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// ============================================================================
// REPORTING
// ============================================================================

function printReport() {
  console.log("\n" + "=".repeat(80));
  console.log("  MIGRATION REPORT");
  console.log("=".repeat(80));

  console.log(`\n📊 Summary:`);
  console.log(`  Boms Processed:        ${stats.bomsProcessed}`);
  console.log(`  ├─ Matched to Recipes: ${stats.bomsMatched}`);
  console.log(`  └─ Skipped (no match): ${stats.bomsSkipped}`);

  console.log(
    `\n📦 RecipeBoms ${DRY_RUN ? "to Create" : "Created"}:  ${
      stats.recipeBomsCreated
    }`
  );
  console.log(
    `📝 RecipeBomItems ${DRY_RUN ? "to Create" : "Created"}: ${
      stats.recipeBomItemsCreated
    }`
  );
  console.log(
    `  ├─ Class Definitions: ${stats.recipeBomItemsClassDefinitions}`
  );
  console.log(`  └─ Instances: ${stats.recipeBomItemsInstances}`);

  console.log(`\n🔧 Operation Distribution:`);
  console.log(`  ├─ Mashing01:       ${stats.operationCounts.Mashing01}`);
  console.log(`  ├─ Fermentation01:  ${stats.operationCounts.Fermentation01}`);
  console.log(`  ├─ Distillation01:  ${stats.operationCounts.Distillation01}`);
  console.log(`  └─ Processing01:    ${stats.operationCounts.Processing01}`);

  if (stats.skippedBoms.length > 0) {
    console.log(`\n⏭️  Skipped Boms (${stats.skippedBoms.length}):`);
    stats.skippedBoms.slice(0, 10).forEach((bom) => {
      console.log(`  └─ ${bom.bomRevision} (item: ${bom.itemNumber})`);
    });
    if (stats.skippedBoms.length > 10) {
      console.log(`  ... and ${stats.skippedBoms.length - 10} more`);
    }
  }

  if (stats.warnings.length > 0) {
    console.log(`\n⚠️  Warnings (${stats.warnings.length}):`);
    const uniqueWarnings = [...new Set(stats.warnings)];
    uniqueWarnings.slice(0, 10).forEach((warning) => {
      console.log(`  └─ ${warning}`);
    });
    if (uniqueWarnings.length > 10) {
      console.log(`  ... and ${uniqueWarnings.length - 10} more`);
    }
  }

  if (stats.errors.length > 0) {
    console.log(`\n❌ Errors (${stats.errors.length}):`);
    stats.errors.forEach((error) => {
      console.log(`  └─ ${error}`);
    });
  }

  if (DRY_RUN) {
    console.log("\n" + "=".repeat(80));
    console.log("  ℹ️  DRY RUN MODE - No changes were committed");
    console.log("  ℹ️  Run with --execute flag to perform the migration");
    console.log("=".repeat(80) + "\n");
  } else {
    console.log("\n" + "=".repeat(80));
    console.log("  ✅ Migration completed successfully!");
    console.log("=".repeat(80) + "\n");
  }
}

// ============================================================================
// RUN MIGRATION
// ============================================================================

main()
  .catch(console.error)
  .finally(() => process.exit(0));
