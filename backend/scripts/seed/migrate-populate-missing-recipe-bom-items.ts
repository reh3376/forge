#!/usr/bin/env ts-node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface MissingItemRecord {
  recipeId: string;
  recipeName: string;
  recipeBomId: string | null;
  missingItems: Array<{
    itemId: string;
    itemNumber: string;
    itemName: string;
    itemGroup: string | null;
    quantity: number;
  }>;
}

async function populateMissingRecipeBomItems(dryRun: boolean = false) {
  console.log(
    `🔄 ${dryRun ? "DRY RUN - " : ""}Populating Missing RecipeBOM Items...\n`
  );

  if (dryRun) {
    console.log("⚠️  DRY RUN MODE: No changes will be made to the database\n");
  }

  // Get all recipes (including class definitions)
  const recipes = await prisma.recipe.findMany({
    where: {
      Recipe: { not: { startsWith: "x-" } },
    },
    select: {
      id: true,
      Recipe: true,
      revision: true,
      isClassDefinition: true,
    },
  });

  const recordsToProcess: MissingItemRecord[] = [];
  let recipesWithMissingBom = 0;
  let recipesWithMissingItems = 0;

  for (const recipe of recipes) {
    // Find RecipeBom for this recipe
    const recipeBom = await prisma.recipeBom.findFirst({
      where: {
        recipe: { some: { id: recipe.id } },
      },
      select: { id: true },
    });

    // Get existing RecipeBOMItems
    const recipeBomItems = recipeBom
      ? await prisma.recipeBomItem.findMany({
          where: {
            recipeBomsId: recipeBom.id,
            operation: "Mashing01",
            itemId: { not: null },
          },
          select: { itemId: true },
        })
      : [];

    // Get the MOST RECENT unit procedure with Cook operations for this recipe
    // This ensures we only use current/active equipment phases, not historical ones
    const unitProcedures = await prisma.unitProcedure.findMany({
      where: {
        recipe: {
          some: { id: recipe.id },
        },
      },
      orderBy: [{ revision: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        operations: {
          where: {
            name: "Cook",
          },
          select: {
            id: true,
          },
          take: 1,
          orderBy: [{ createdAt: "desc" }],
        },
      },
    });

    // Find the first unit procedure that actually has Cook operations
    const unitProcedure = unitProcedures.find((up) => up.operations.length > 0);

    // Get equipment phase BOM items ONLY from the most recent unit procedure
    const equipmentPhaseBomItems = unitProcedure
      ? await prisma.bomItem.findMany({
          where: {
            equipmentPhases: {
              some: {
                operationId: {
                  in: unitProcedure.operations.map((op) => op.id),
                },
                name: {
                  in: [
                    "LiquidAdd",
                    "GrainAdd",
                    "AdditiveAdd",
                    "Hold",
                    "Prompt",
                  ],
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
        })
      : [];

    // Deduplicate by itemId
    const uniqueEquipmentItems = Array.from(
      new Map(equipmentPhaseBomItems.map((b) => [b.itemId, b])).values()
    );

    // Find missing items
    const recipeBomItemIds = new Set(
      recipeBomItems.map((b) => b.itemId).filter(Boolean)
    );
    const missingItems = uniqueEquipmentItems
      .filter((b) => !recipeBomItemIds.has(b.itemId))
      .map((b) => ({
        itemId: b.itemId,
        itemNumber: b.item?.itemNumber || "Unknown",
        itemName: b.item?.itemName || "Unknown",
        itemGroup: b.item?.itemGroup || null,
        quantity: b.quantity || 0,
      }));

    if (missingItems.length > 0) {
      if (!recipeBom) {
        recipesWithMissingBom++;
      } else {
        recipesWithMissingItems++;
      }

      recordsToProcess.push({
        recipeId: recipe.id,
        recipeName: recipe.Recipe || "Unnamed",
        recipeBomId: recipeBom?.id || null,
        missingItems,
      });
    }
  }

  // Print summary
  console.log("📊 ANALYSIS SUMMARY");
  console.log("=".repeat(80));
  console.log(`Total Recipes Analyzed: ${recipes.length}`);
  console.log(`Recipes Needing RecipeBOM Created: ${recipesWithMissingBom}`);
  console.log(`Recipes Needing Items Added: ${recipesWithMissingItems}`);
  console.log(`Total Recipes to Process: ${recordsToProcess.length}`);
  console.log("=".repeat(80));
  console.log();

  if (recordsToProcess.length === 0) {
    console.log("✅ All recipes have complete RecipeBOMs!");
    await prisma.$disconnect();
    return;
  }

  // Show examples
  console.log("📋 EXAMPLES OF MISSING ITEMS (First 5)");
  console.log("-".repeat(80));
  recordsToProcess.slice(0, 5).forEach((record) => {
    console.log(`\n${record.recipeName}`);
    console.log(
      `  ${record.recipeBomId ? "Has RecipeBOM" : "Missing RecipeBOM"}`
    );
    console.log(`  Missing ${record.missingItems.length} items:`);
    record.missingItems.forEach((item) => {
      console.log(
        `    - ${item.itemNumber}: ${item.itemName} (${
          item.itemGroup || "No Group"
        })`
      );
    });
  });
  console.log();

  if (dryRun) {
    console.log("⚠️  DRY RUN MODE: Exiting without making changes");
    await prisma.$disconnect();
    return;
  }

  // Confirm before proceeding
  console.log("⚠️  This will create:");
  console.log(`  - ${recipesWithMissingBom} new RecipeBOM records`);
  const totalItemsToCreate = recordsToProcess.reduce(
    (sum, r) => sum + r.missingItems.length,
    0
  );
  console.log(`  - ${totalItemsToCreate} new RecipeBOMItem records`);
  console.log();

  // Process records
  let createdRecipeBoms = 0;
  let createdRecipeBomItems = 0;
  let errors = 0;

  console.log("🚀 Starting Migration...\n");

  for (const record of recordsToProcess) {
    try {
      // Step 1: Ensure RecipeBom exists
      let recipeBomId = record.recipeBomId;

      if (!recipeBomId) {
        const recipe = await prisma.recipe.findUnique({
          where: { id: record.recipeId },
          select: { revision: true, isClassDefinition: true },
        });

        const newRecipeBom = await prisma.recipeBom.create({
          data: {
            revision: recipe?.revision?.toString() || "1",
            master: recipe?.isClassDefinition || false,
            running: !recipe?.isClassDefinition,
            recipe: {
              connect: { id: record.recipeId },
            },
          },
        });

        recipeBomId = newRecipeBom.id;
        createdRecipeBoms++;
        console.log(`✅ Created RecipeBOM for ${record.recipeName}`);
      }

      // Step 2: Normalize quantities to percentages for grain items
      // Calculate total quantity for grain items only
      const grainItemGroups = [
        "RM-GR-BRY",
        "RM-GR-CRN",
        "RM-GR-RYE",
        "RM-GR-WHT",
      ];
      const grainItems = record.missingItems.filter(
        (item) => item.itemGroup && grainItemGroups.includes(item.itemGroup)
      );
      const totalGrainQuantity = grainItems.reduce(
        (sum, item) => sum + (item.quantity || 0),
        0
      );

      // Step 3: Create missing RecipeBOMItems with normalized quantities
      for (const item of record.missingItems) {
        let normalizedQuantity = item.quantity;

        // Normalize grain quantities to percentages
        if (
          item.itemGroup &&
          grainItemGroups.includes(item.itemGroup) &&
          totalGrainQuantity > 0
        ) {
          normalizedQuantity = (item.quantity / totalGrainQuantity) * 100;
        }

        await prisma.recipeBomItem.create({
          data: {
            itemId: item.itemId,
            recipeBomsId: recipeBomId,
            operation: "Mashing01",
            quantity: normalizedQuantity,
            isClassDefinition: false,
            createdBy: "migration-populate-bom-items",
          },
        });

        createdRecipeBomItems++;
      }

      console.log(
        `✅ Added ${record.missingItems.length} items to ${record.recipeName}`
      );
    } catch (error) {
      console.error(`❌ Error processing ${record.recipeName}:`, error);
      errors++;
    }
  }

  console.log();
  console.log("📈 MIGRATION RESULTS");
  console.log("=".repeat(80));
  console.log(`RecipeBOMs Created: ${createdRecipeBoms}`);
  console.log(`RecipeBOMItems Created: ${createdRecipeBomItems}`);
  console.log(`Errors: ${errors}`);
  console.log("=".repeat(80));
  console.log();

  await prisma.$disconnect();

  if (errors === 0) {
    console.log("✅ Migration completed successfully!");
  } else {
    console.log("⚠️  Migration completed with errors");
    process.exit(1);
  }
}

// Check command line args for dry-run flag
const isDryRun =
  process.argv.includes("--dry-run") || process.argv.includes("-d");

populateMissingRecipeBomItems(isDryRun)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  });
