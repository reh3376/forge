#!/usr/bin/env ts-node

/**
 * Railway Data Restore - Idempotent Seed Script
 *
 * This script restores recipe-related data (BOMs, Mashing Protocols, Parameters)
 * from existing EquipmentPhase data. It's designed to be run multiple times
 * without causing duplication.
 *
 * Usage:
 *   DATABASE_URL=<railway-connection-string> npx ts-node scripts/seed/railway-data-restore.ts
 *
 * Options:
 *   --dry-run    Show what would be done without making changes
 *   --force      Re-run all steps even if data exists (creates new records)
 *   --overwrite  Update existing records with fresh data (no duplicates)
 *   --verbose    Show detailed progress
 *
 * Modes:
 *   Default:     Skip existing records, only create missing ones
 *   --overwrite: Update existing records in place, create missing ones
 *   --force:     Delete and recreate (use with caution)
 */

import {
  PrismaClient,
  EnumMashingProtocolStepHoldType,
  EnumMashingProtocolStepStepType,
  EnumEquipmentPhaseName,
} from "@prisma/client";

const prisma = new PrismaClient();

// Configuration: Use consolidated GrainAdd step type (recommended) vs legacy individual grain types
// Set to true to use the new GrainAdd step type, false for legacy Corn/Wheat/Rye/Malt types
const USE_CONSOLIDATED_GRAIN_ADD = true;

interface RestoreStats {
  recipeBoms: {
    created: number;
    updated: number;
    skipped: number;
    errors: number;
  };
  recipeBomItems: {
    created: number;
    updated: number;
    skipped: number;
    errors: number;
  };
  mashingProtocols: {
    created: number;
    updated: number;
    skipped: number;
    errors: number;
  };
  mashingProtocolSteps: {
    created: number;
    updated: number;
    skipped: number;
    errors: number;
  };
  bomItemLinks: {
    created: number;
    updated: number;
    skipped: number;
    errors: number;
  };
  duplicatesRemoved: { parameters: number; bomItems: number };
}

const stats: RestoreStats = {
  recipeBoms: { created: 0, updated: 0, skipped: 0, errors: 0 },
  recipeBomItems: { created: 0, updated: 0, skipped: 0, errors: 0 },
  mashingProtocols: { created: 0, updated: 0, skipped: 0, errors: 0 },
  mashingProtocolSteps: { created: 0, updated: 0, skipped: 0, errors: 0 },
  bomItemLinks: { created: 0, updated: 0, skipped: 0, errors: 0 },
  duplicatesRemoved: { parameters: 0, bomItems: 0 },
};

const isDryRun = process.argv.includes("--dry-run");
const isForce = process.argv.includes("--force");
const isOverwrite = process.argv.includes("--overwrite");
const isVerbose = process.argv.includes("--verbose");

function log(
  message: string,
  level: "info" | "verbose" | "warn" | "error" = "info"
) {
  if (level === "verbose" && !isVerbose) return;
  if (level === "warn") console.warn(`⚠️  ${message}`);
  else if (level === "error") console.error(`❌ ${message}`);
  else console.log(message);
}

// ============================================
// Step 1: Clean up duplicate RecipeParameter links
// ============================================
async function cleanupDuplicateParameters(): Promise<void> {
  log("\n📋 Step 1: Checking for duplicate RecipeParameter links...");

  const duplicateGroups = await prisma.$queryRaw<
    Array<{
      recipe_id: string;
      recipeParamName: string | null;
      param_ids: string[];
    }>
  >`
    SELECT r.id as recipe_id, rp."recipeParamName",
           ARRAY_AGG(rp.id ORDER BY rp."createdAt" DESC) as param_ids
    FROM "RecipeParameter" rp
    JOIN "_RecipeToRecipeParameter" rtrp ON rp.id = rtrp."B"
    JOIN "Recipe" r ON rtrp."A" = r.id
    WHERE rp."scheduleOrderRecipeInstanceId" IS NULL
    GROUP BY r.id, rp."recipeParamName"
    HAVING COUNT(*) > 1
  `;

  if (duplicateGroups.length === 0) {
    log("   ✅ No duplicate parameters found");
    return;
  }

  log(`   Found ${duplicateGroups.length} duplicate parameter groups`);

  if (isDryRun) {
    log("   [DRY RUN] Would remove duplicate links", "verbose");
    return;
  }

  for (const group of duplicateGroups) {
    const paramIds = group.param_ids;
    const removeIds = paramIds.slice(1); // Keep first (most recent), remove rest

    const result = await prisma.$executeRaw`
      DELETE FROM "_RecipeToRecipeParameter"
      WHERE "A" = ${group.recipe_id}::text
        AND "B" = ANY(${removeIds}::text[])
    `;

    stats.duplicatesRemoved.parameters += result;
  }

  log(
    `   ✅ Removed ${stats.duplicatesRemoved.parameters} duplicate parameter links`
  );
}

// ============================================
// Step 2: Link Recipes to RecipeGroups
// ============================================
async function linkRecipeGroups(): Promise<void> {
  log("\n📋 Step 2: Linking Recipes to RecipeGroups...");

  // Get recipes without a recipe group
  const recipesWithoutGroup = await prisma.recipe.findMany({
    where: {
      active: true,
      recipeGroupId: null,
    },
    select: { id: true, Recipe: true, revision: true },
  });

  if (recipesWithoutGroup.length === 0) {
    const totalWithGroups = await prisma.recipe.count({
      where: { active: true, recipeGroupId: { not: null } },
    });
    log(`   All ${totalWithGroups} active recipes already have recipe groups`);
    return;
  }

  log(`   Found ${recipesWithoutGroup.length} recipes without recipe groups`);

  let linked = 0;
  let created = 0;

  for (const recipe of recipesWithoutGroup) {
    // Extract base recipe name (without revision suffix like -v01, -v02 or legacy -R01, -R02)
    const baseRecipeName = recipe.Recipe.replace(/-[Rv]\d+$/, "");

    if (isDryRun) {
      log(
        `   [DRY RUN] Would link ${recipe.Recipe} to group ${baseRecipeName}`,
        "verbose"
      );
      continue;
    }

    // Find or create the recipe group
    let recipeGroup = await prisma.recipeGroup.findFirst({
      where: { recipe: baseRecipeName },
    });

    if (!recipeGroup) {
      // Create new recipe group
      recipeGroup = await prisma.recipeGroup.create({
        data: {
          recipe: baseRecipeName,
          revision: 0,
          createdBy: "railway-data-restore",
        },
      });
      created++;
      log(`   Created new RecipeGroup: ${baseRecipeName}`, "verbose");
    }

    // Link recipe to group
    await prisma.recipe.update({
      where: { id: recipe.id },
      data: {
        recipeGroupId: recipeGroup.id,
        updatedBy: "railway-data-restore",
      },
    });
    linked++;
  }

  log(`   ✅ RecipeGroups: ${created} created, ${linked} recipes linked`);
}

// ============================================
// Step 3: Populate RecipeBom and RecipeBomItem
// ============================================
async function populateRecipeBoms(): Promise<void> {
  log("\n📋 Step 3: Populating RecipeBom and RecipeBomItem...");

  // Check existing
  const existingBomCount = await prisma.recipeBom.count({
    where: { scheduleOrderRecipeInstanceId: null },
  });

  if (existingBomCount > 0 && !isForce) {
    log(
      `   Found ${existingBomCount} existing master RecipeBoms, checking for missing...`
    );
  }

  // Get recipes that need BOMs
  const recipes = await prisma.recipe.findMany({
    where: {
      active: true,
      Recipe: { not: { startsWith: "x-" } },
    },
    select: { id: true, Recipe: true, revision: true, isClassDefinition: true },
  });

  let recipesNeedingBom = 0;

  for (const recipe of recipes) {
    // Check if recipe already has a BOM
    const existingBom = await prisma.recipeBom.findFirst({
      where: {
        recipe: { some: { id: recipe.id } },
        scheduleOrderRecipeInstanceId: null,
      },
    });

    if (existingBom && !isForce && !isOverwrite) {
      stats.recipeBoms.skipped++;
      continue;
    }

    recipesNeedingBom++;

    // Get equipment phase BOM items for this recipe
    const unitProcedures = await prisma.unitProcedure.findMany({
      where: { recipe: { some: { id: recipe.id } } },
      orderBy: [{ revision: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        operations: {
          where: { name: "Cook" },
          select: { id: true },
          take: 1,
        },
      },
    });

    const unitProcedure = unitProcedures.find((up) => up.operations.length > 0);
    if (!unitProcedure) {
      log(`   Recipe ${recipe.Recipe}: No Cook operations found`, "verbose");
      continue;
    }

    const operationIds = unitProcedure.operations.map((op) => op.id);

    // Get BOM items from equipment phases
    const equipmentPhaseBomItems = await prisma.bomItem.findMany({
      where: {
        equipmentPhases: {
          some: {
            operationId: { in: operationIds },
            name: {
              in: [
                "LiquidAdd",
                "GrainAdd",
                "AdditiveAdd",
                "Hold",
                "Prompt",
              ] as EnumEquipmentPhaseName[],
            },
            active: true,
          },
        },
      },
      include: {
        item: {
          select: {
            id: true,
            itemNumber: true,
            itemName: true,
            itemGroup: true,
          },
        },
      },
    });

    // Deduplicate by itemId
    const uniqueItems = Array.from(
      new Map(equipmentPhaseBomItems.map((b) => [b.itemId, b])).values()
    );

    if (uniqueItems.length === 0) {
      log(
        `   Recipe ${recipe.Recipe}: No BOM items found in equipment phases`,
        "verbose"
      );
      continue;
    }

    if (isDryRun) {
      const action = existingBom ? (isOverwrite ? "update" : "skip") : "create";
      log(
        `   [DRY RUN] Would ${action} RecipeBom for ${recipe.Recipe} with ${uniqueItems.length} items`,
        "verbose"
      );
      continue;
    }

    // Create or update RecipeBom
    let recipeBomId: string;

    if (existingBom && isOverwrite) {
      // Update existing BOM
      await prisma.recipeBom.update({
        where: { id: existingBom.id },
        data: {
          revision: recipe.revision?.toString() || "1",
          master: recipe.isClassDefinition || false,
          running: !recipe.isClassDefinition,
        },
      });
      recipeBomId = existingBom.id;
      stats.recipeBoms.updated++;
    } else if (existingBom) {
      recipeBomId = existingBom.id;
      stats.recipeBoms.skipped++;
    } else {
      const newBom = await prisma.recipeBom.create({
        data: {
          revision: recipe.revision?.toString() || "1",
          master: recipe.isClassDefinition || false,
          running: !recipe.isClassDefinition,
          recipe: { connect: { id: recipe.id } },
        },
      });
      recipeBomId = newBom.id;
      stats.recipeBoms.created++;
    }

    // Get existing BOM items for this BOM
    const existingBomItems = await prisma.recipeBomItem.findMany({
      where: { recipeBomsId: recipeBomId },
      select: { id: true, itemId: true },
    });

    // Normalize grain quantities
    const grainGroups = ["RM-GR-BRY", "RM-GR-CRN", "RM-GR-RYE", "RM-GR-WHT"];
    const grainItems = uniqueItems.filter(
      (item) =>
        item.item?.itemGroup && grainGroups.includes(item.item.itemGroup)
    );
    const totalGrainQuantity = grainItems.reduce(
      (sum, item) => sum + (item.quantity || 0),
      0
    );

    // Create or update BOM items
    for (const bomItem of uniqueItems) {
      let normalizedQuantity = bomItem.quantity || 0;
      if (
        bomItem.item?.itemGroup &&
        grainGroups.includes(bomItem.item.itemGroup) &&
        totalGrainQuantity > 0
      ) {
        normalizedQuantity =
          ((bomItem.quantity || 0) / totalGrainQuantity) * 100;
      }

      const existingItem = existingBomItems.find(
        (b) => b.itemId === bomItem.itemId
      );

      if (existingItem && isOverwrite) {
        // Update existing BOM item
        await prisma.recipeBomItem.update({
          where: { id: existingItem.id },
          data: {
            quantity: normalizedQuantity,
            operation: "Mashing01",
          },
        });
        stats.recipeBomItems.updated++;
      } else if (existingItem) {
        stats.recipeBomItems.skipped++;
      } else {
        await prisma.recipeBomItem.create({
          data: {
            itemId: bomItem.itemId,
            recipeBomsId: recipeBomId,
            operation: "Mashing01",
            quantity: normalizedQuantity,
            isClassDefinition: false,
            createdBy: "railway-data-restore",
          },
        });
        stats.recipeBomItems.created++;
      }
    }
  }

  log(
    `   ✅ RecipeBoms: ${stats.recipeBoms.created} created, ${stats.recipeBoms.updated} updated, ${stats.recipeBoms.skipped} skipped`
  );
  log(
    `   ✅ RecipeBomItems: ${stats.recipeBomItems.created} created, ${stats.recipeBomItems.updated} updated, ${stats.recipeBomItems.skipped} skipped`
  );
}

// ============================================
// Step 4: Populate MashingProtocol and Steps
// ============================================
async function populateMashingProtocols(): Promise<void> {
  log("\n📋 Step 4: Populating MashingProtocol and Steps with BOM links...");

  // In overwrite mode, get ALL active recipes; otherwise only those without protocols
  const recipes = await prisma.recipe.findMany({
    where: {
      active: true,
      ...(isOverwrite ? {} : { mashingProtocolId: null }),
    },
    select: { id: true, Recipe: true, revision: true, mashingProtocolId: true },
  });

  if (recipes.length === 0 && !isForce && !isOverwrite) {
    const totalProtocols = await prisma.mashingProtocol.count();
    log(`   All ${totalProtocols} recipes already have mashing protocols`);
    return;
  }

  const recipesWithProtocol = recipes.filter(
    (r) => r.mashingProtocolId !== null
  ).length;
  const recipesWithoutProtocol = recipes.filter(
    (r) => r.mashingProtocolId === null
  ).length;

  if (isOverwrite) {
    log(
      `   Found ${recipesWithProtocol} recipes with existing protocols (will update), ${recipesWithoutProtocol} without`
    );
  } else {
    log(`   Found ${recipesWithoutProtocol} recipes without mashing protocols`);
  }

  for (const recipe of recipes) {
    // Get unit procedure with Cook operations
    const unitProcedures = await prisma.unitProcedure.findMany({
      where: { recipe: { some: { id: recipe.id } } },
      orderBy: [{ revision: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        revision: true,
        operations: {
          where: { name: "Cook" },
          select: { id: true },
          take: 1,
          orderBy: [{ createdAt: "desc" }],
        },
      },
    });

    const unitProcedure = unitProcedures.find((up) => up.operations.length > 0);
    if (!unitProcedure) {
      log(`   Recipe ${recipe.Recipe}: No Cook operations found`, "verbose");
      stats.mashingProtocols.skipped++;
      continue;
    }

    const operationIds = unitProcedure.operations.map((op) => op.id);

    // Get mashing-related equipment phases
    const mashingPhases = await prisma.equipmentPhase.findMany({
      where: {
        operationId: { in: operationIds },
        name: {
          in: [
            "LiquidAdd",
            "GrainAdd",
            "AdditiveAdd",
            "Hold",
            "Prompt",
          ] as EnumEquipmentPhaseName[],
        },
        active: true,
      },
      include: {
        phaseParameters: {
          select: {
            name: true,
            staticName: true,
            setpointNumericalValue: true,
            setpointBooleanValue: true,
          },
        },
        bomItem: {
          select: {
            id: true,
            itemId: true,
            quantity: true,
            item: {
              select: { itemNumber: true, itemName: true, itemGroup: true },
            },
          },
        },
      },
      orderBy: { operationSequenceIndex: "asc" },
    });

    if (mashingPhases.length === 0) {
      log(`   Recipe ${recipe.Recipe}: No mashing phases found`, "verbose");
      stats.mashingProtocols.skipped++;
      continue;
    }

    // Get recipe's BOM items for linking
    const recipeBom = await prisma.recipeBom.findFirst({
      where: {
        recipe: { some: { id: recipe.id } },
        scheduleOrderRecipeInstanceId: null,
      },
      select: { id: true },
    });

    const mashingBomItems = recipeBom
      ? await prisma.recipeBomItem.findMany({
          where: {
            recipeBomsId: recipeBom.id,
            itemId: { not: null },
            OR: [
              { operation: "Mashing01" },
              {
                item: {
                  OR: [
                    { itemName: { contains: "Water", mode: "insensitive" } },
                    { itemGroup: { contains: "Water", mode: "insensitive" } },
                  ],
                },
              },
            ],
          },
          include: {
            item: {
              select: {
                id: true,
                itemNumber: true,
                itemName: true,
                itemGroup: true,
              },
            },
          },
        })
      : [];

    if (isDryRun) {
      const action = recipe.mashingProtocolId
        ? isOverwrite
          ? "update"
          : "skip"
        : "create";
      log(
        `   [DRY RUN] Would ${action} MashingProtocol for ${recipe.Recipe} with ${mashingPhases.length} steps`,
        "verbose"
      );
      continue;
    }

    // Create or update mashing protocol
    const protocolName = `${recipe.Recipe}-Mashing-Protocol`;
    let mashingProtocol: { id: string };

    if (recipe.mashingProtocolId && isOverwrite) {
      // Delete existing steps first (they will be recreated)
      await prisma.mashingProtocolStep.deleteMany({
        where: { mashingProtocolId: recipe.mashingProtocolId },
      });

      // Update existing protocol
      mashingProtocol = await prisma.mashingProtocol.update({
        where: { id: recipe.mashingProtocolId },
        data: {
          name: protocolName,
          revision: recipe.revision?.toString() || "1",
          updatedBy: "railway-data-restore",
        },
      });
      stats.mashingProtocols.updated++;
    } else if (recipe.mashingProtocolId) {
      // Skip - recipe already has protocol
      stats.mashingProtocols.skipped++;
      continue;
    } else {
      // Check if a protocol with this name already exists (orphaned)
      const existingByName = await prisma.mashingProtocol.findFirst({
        where: { name: protocolName },
      });

      if (existingByName) {
        // Delete existing steps and update the orphaned protocol
        await prisma.mashingProtocolStep.deleteMany({
          where: { mashingProtocolId: existingByName.id },
        });

        mashingProtocol = await prisma.mashingProtocol.update({
          where: { id: existingByName.id },
          data: {
            revision: recipe.revision?.toString() || "1",
            updatedBy: "railway-data-restore",
          },
        });

        // Link recipe to this protocol
        await prisma.recipe.update({
          where: { id: recipe.id },
          data: {
            mashingProtocolId: mashingProtocol.id,
            updatedBy: "railway-data-restore",
          },
        });

        stats.mashingProtocols.updated++;
        log(
          `   Found orphaned protocol for ${recipe.Recipe}, reusing and updating`,
          "verbose"
        );
      } else {
        // Create new protocol
        mashingProtocol = await prisma.mashingProtocol.create({
          data: {
            name: protocolName,
            revision: recipe.revision?.toString() || "1",
            master: false,
            isTemplate: false,
            running: false,
            createdBy: "railway-data-restore",
            updatedBy: "railway-data-restore",
          },
        });

        // Link recipe to new mashing protocol
        await prisma.recipe.update({
          where: { id: recipe.id },
          data: {
            mashingProtocolId: mashingProtocol.id,
            updatedBy: "railway-data-restore",
          },
        });

        stats.mashingProtocols.created++;
      }
    }

    // Create mashing protocol steps with BOM item links
    let stepIndex = 1;
    for (const phase of mashingPhases) {
      // Extract parameters
      let temperatureSetpoint: number | undefined;
      let stepTime: number | undefined;
      let agitatorEnabled = false;
      let agitatorSpdSp: number | undefined;

      for (const param of phase.phaseParameters) {
        const staticName = param.staticName;
        const value = param.setpointNumericalValue;
        const paramNameLower = param.name.toLowerCase();

        if (staticName === "Temperature" && temperatureSetpoint === undefined) {
          temperatureSetpoint = value ?? undefined;
        } else if (staticName === "Time" && stepTime === undefined) {
          stepTime = value != null ? Math.round(value) : undefined;
        } else if (
          staticName === "Speed" &&
          paramNameLower.includes("agitator")
        ) {
          agitatorSpdSp = value ?? undefined;
          agitatorEnabled = true;
        }
      }

      // Determine step type
      let stepType: EnumMashingProtocolStepStepType =
        EnumMashingProtocolStepStepType.Hold;
      const stepBomItems: typeof mashingBomItems = [];

      // Find matching RecipeBomItems
      if (phase.bomItem && phase.bomItem.length > 0) {
        for (const phaseBomItem of phase.bomItem) {
          if (!phaseBomItem.itemId) continue;

          const matchingItem = mashingBomItems.find(
            (rbi) => rbi.item?.id === phaseBomItem.itemId
          );
          if (
            matchingItem &&
            !stepBomItems.some((item) => item.id === matchingItem.id)
          ) {
            stepBomItems.push(matchingItem);
          }
        }
      }

      // Determine grain type for GrainAdd phases
      if (phase.name === "GrainAdd") {
        if (USE_CONSOLIDATED_GRAIN_ADD) {
          // Use consolidated GrainAdd step type - grain type will be derived from linked BOM item at runtime
          stepType = EnumMashingProtocolStepStepType.GrainAdd;
        } else if (stepBomItems.length > 0) {
          // Legacy behavior: determine specific grain type from linked BOM items
          for (const bomItem of stepBomItems) {
            const itemGroup = bomItem.item?.itemGroup?.toLowerCase() || "";
            const itemName = bomItem.item?.itemName?.toLowerCase() || "";

            if (
              itemGroup.includes("corn") ||
              itemName.includes("corn") ||
              itemGroup.includes("crn")
            ) {
              stepType = EnumMashingProtocolStepStepType.Corn;
              break;
            } else if (itemGroup.includes("rye") || itemName.includes("rye")) {
              stepType = EnumMashingProtocolStepStepType.Rye;
              break;
            } else if (
              itemGroup.includes("wheat") ||
              itemName.includes("wheat") ||
              itemGroup.includes("wht")
            ) {
              stepType = EnumMashingProtocolStepStepType.Wheat;
              break;
            } else if (
              itemGroup.includes("malt") ||
              itemGroup.includes("barley") ||
              itemGroup.includes("bry")
            ) {
              stepType = EnumMashingProtocolStepStepType.Malt;
              break;
            }
          }
        }
      } else if (phase.name === "LiquidAdd") {
        stepType = EnumMashingProtocolStepStepType.LiquidAdd;
      } else if (phase.name === "AdditiveAdd") {
        stepType = EnumMashingProtocolStepStepType.AdditiveAdd;
      } else if (phase.name === "Prompt") {
        stepType = EnumMashingProtocolStepStepType.Prompt;
      }

      // Determine hold type
      const holdType =
        phase.stepType === "Heat"
          ? EnumMashingProtocolStepHoldType.Heat
          : phase.stepType === "Cool"
          ? EnumMashingProtocolStepHoldType.Cool
          : EnumMashingProtocolStepHoldType.Hold;

      const isHoldStep = stepType === EnumMashingProtocolStepStepType.Hold;

      await prisma.mashingProtocolStep.create({
        data: {
          index: stepIndex,
          stepType,
          holdType: isHoldStep ? holdType : undefined,
          temperatureSetpoint: isHoldStep ? temperatureSetpoint : undefined,
          stepTime: isHoldStep ? stepTime : undefined,
          heatEnabled:
            isHoldStep && holdType === EnumMashingProtocolStepHoldType.Heat,
          coolEnabled:
            isHoldStep && holdType === EnumMashingProtocolStepHoldType.Cool,
          heatTempSp:
            isHoldStep && holdType === EnumMashingProtocolStepHoldType.Heat
              ? temperatureSetpoint
              : undefined,
          coolTempSp:
            isHoldStep && holdType === EnumMashingProtocolStepHoldType.Cool
              ? temperatureSetpoint
              : undefined,
          agitatorEnabled: isHoldStep ? agitatorEnabled : false,
          agitatorSpdSp: isHoldStep ? agitatorSpdSp : undefined,
          promptMessage:
            phase.message || phase.description || `${phase.name} step`,
          mashingProtocolId: mashingProtocol.id,
          recipeBomItem:
            stepBomItems.length > 0
              ? {
                  connect: stepBomItems.map((item) => ({ id: item.id })),
                }
              : undefined,
          createdBy: "railway-data-restore",
          updatedBy: "railway-data-restore",
        },
      });

      stats.mashingProtocolSteps.created++;
      if (stepBomItems.length > 0) {
        stats.bomItemLinks.created += stepBomItems.length;
      }
      stepIndex++;
    }

    const action =
      recipe.mashingProtocolId && isOverwrite ? "Updated" : "Created";
    log(
      `   ✅ ${action} protocol for ${recipe.Recipe} with ${
        stepIndex - 1
      } steps`,
      "verbose"
    );
  }

  log(
    `   ✅ MashingProtocols: ${stats.mashingProtocols.created} created, ${stats.mashingProtocols.updated} updated, ${stats.mashingProtocols.skipped} skipped`
  );
  log(
    `   ✅ MashingProtocolSteps: ${stats.mashingProtocolSteps.created} created`
  );
  log(`   ✅ BOM Item Links: ${stats.bomItemLinks.created} created`);
}

// ============================================
// Step 5: Verify and report final state
// ============================================
async function verifyAndReport(): Promise<void> {
  log("\n📊 Final Database State:");
  log("=".repeat(50));

  const [
    protocols,
    steps,
    boms,
    items,
    params,
    recipeGroups,
    recipesWithGroups,
    activeRecipes,
  ] = await Promise.all([
    prisma.mashingProtocol.count({
      where: { scheduleOrderRecipeInstanceId: null },
    }),
    prisma.mashingProtocolStep.count(),
    prisma.recipeBom.count({ where: { scheduleOrderRecipeInstanceId: null } }),
    prisma.recipeBomItem.count(),
    prisma.recipeParameter.count({
      where: { scheduleOrderRecipeInstanceId: null },
    }),
    prisma.recipeGroup.count(),
    prisma.recipe.count({
      where: { active: true, recipeGroupId: { not: null } },
    }),
    prisma.recipe.count({ where: { active: true } }),
  ]);

  const bomLinks = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM "_MashingProtocolStepToRecipeBomItem"
  `;

  const stepsWithBom = await prisma.mashingProtocolStep.count({
    where: { recipeBomItem: { some: {} } },
  });

  // Check for duplicates
  const duplicateParams = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count FROM (
      SELECT r.id, rp."recipeParamName"
      FROM "RecipeParameter" rp
      JOIN "_RecipeToRecipeParameter" rtrp ON rp.id = rtrp."B"
      JOIN "Recipe" r ON rtrp."A" = r.id
      WHERE rp."scheduleOrderRecipeInstanceId" IS NULL
      GROUP BY r.id, rp."recipeParamName"
      HAVING COUNT(*) > 1
    ) as dups
  `;

  log(`  RecipeGroups: ${recipeGroups}`);
  log(
    `  Recipes with groups: ${recipesWithGroups}/${activeRecipes} ${
      recipesWithGroups === activeRecipes ? "✅" : "⚠️"
    }`
  );
  log(`  MashingProtocol: ${protocols}`);
  log(`  MashingProtocolStep: ${steps}`);
  log(`  RecipeBom: ${boms}`);
  log(`  RecipeBomItem: ${items}`);
  log(`  RecipeParameter: ${params}`);
  log(`  Step-to-BomItem links: ${Number(bomLinks[0].count)}`);
  log(`  Steps with BOM items: ${stepsWithBom}`);
  log("");
  log(
    `  Duplicate parameter groups: ${Number(duplicateParams[0].count)} ${
      Number(duplicateParams[0].count) === 0 ? "✅" : "❌"
    }`
  );
  log("=".repeat(50));
}

// ============================================
// Main execution
// ============================================
async function main(): Promise<void> {
  console.log("🔄 Railway Data Restore - Idempotent Seed Script");
  console.log("=".repeat(50));

  if (isDryRun) {
    console.log("🏃 DRY RUN MODE - No changes will be made");
  }
  if (isOverwrite) {
    console.log("🔄 OVERWRITE MODE - Will update existing records");
  }
  if (isForce) {
    console.log("⚠️  FORCE MODE - Will re-run all steps");
  }

  try {
    // Step 1: Clean up duplicates
    await cleanupDuplicateParameters();

    // Step 2: Link recipes to recipe groups
    await linkRecipeGroups();

    // Step 3: Populate RecipeBom and RecipeBomItem
    await populateRecipeBoms();

    // Step 4: Populate MashingProtocol and Steps with BOM links
    await populateMashingProtocols();

    // Step 5: Verify and report
    await verifyAndReport();

    console.log("\n✅ Railway data restore completed successfully!");
  } catch (error) {
    console.error("\n❌ Error during restore:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
