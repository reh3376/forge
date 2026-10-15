#!/usr/bin/env ts-node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface RecipeDiagnosis {
  recipeId: string;
  recipeName: string;
  hasRecipeBom: boolean;
  recipeBomItemCount: number;
  equipmentPhaseBomItemCount: number;
  missingItems: Array<{
    itemId: string;
    itemNumber: string;
    itemName: string;
    itemGroup: string | null;
  }>;
}

async function diagnoseRecipeBomCompleteness() {
  console.log("🔍 Diagnosing RecipeBOM Completeness...\n");

  // Get all recipes (including class definitions)
  const recipes = await prisma.recipe.findMany({
    where: {
      Recipe: { not: { startsWith: "x-" } },
    },
    select: {
      id: true,
      Recipe: true,
    },
    orderBy: {
      Recipe: "asc",
    },
  });

  console.log(`Found ${recipes.length} active recipes\n`);

  const diagnoses: RecipeDiagnosis[] = [];
  let completeCount = 0;
  let incompleteCount = 0;
  let noRecipeBomCount = 0;

  for (const recipe of recipes) {
    // Find RecipeBom for this recipe
    const recipeBom = await prisma.recipeBom.findFirst({
      where: {
        recipe: {
          some: {
            id: recipe.id,
          },
        },
      },
      select: {
        id: true,
      },
    });

    // Get RecipeBOMItems
    const recipeBomItems = recipeBom
      ? await prisma.recipeBomItem.findMany({
          where: {
            recipeBomsId: recipeBom.id,
            operation: "Mashing01",
            itemId: { not: null },
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

    // Get equipment phase BOM items
    const equipmentPhaseBomItems = await prisma.bomItem.findMany({
      where: {
        equipmentPhases: {
          some: {
            operation: {
              unitProcedure: {
                recipe: {
                  some: {
                    id: recipe.id,
                  },
                },
              },
              name: "Cook",
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

    // Deduplicate equipment phase BOM items by itemId
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
      }));

    const diagnosis: RecipeDiagnosis = {
      recipeId: recipe.id,
      recipeName: recipe.Recipe || "Unnamed",
      hasRecipeBom: !!recipeBom,
      recipeBomItemCount: recipeBomItems.length,
      equipmentPhaseBomItemCount: uniqueEquipmentItems.length,
      missingItems,
    };

    diagnoses.push(diagnosis);

    // Count categories
    if (!recipeBom) {
      noRecipeBomCount++;
    } else if (missingItems.length === 0 && uniqueEquipmentItems.length > 0) {
      completeCount++;
    } else if (missingItems.length > 0) {
      incompleteCount++;
    }
  }

  // Print summary
  console.log("📊 SUMMARY");
  console.log("=".repeat(80));
  console.log(`Total Recipes Analyzed: ${recipes.length}`);
  console.log(`Recipes with Complete BOMs: ${completeCount}`);
  console.log(`Recipes with Incomplete BOMs: ${incompleteCount}`);
  console.log(`Recipes without RecipeBOM: ${noRecipeBomCount}`);
  console.log(
    `Recipes with No Equipment Phases: ${
      recipes.length - completeCount - incompleteCount - noRecipeBomCount
    }`
  );
  console.log("=".repeat(80));
  console.log();

  // Print recipes without RecipeBOM
  if (noRecipeBomCount > 0) {
    console.log("❌ RECIPES WITHOUT RECIPEBOM");
    console.log("-".repeat(80));
    diagnoses
      .filter((d) => !d.hasRecipeBom && d.equipmentPhaseBomItemCount > 0)
      .forEach((d) => {
        console.log(`\n${d.recipeName}`);
        console.log(`  Equipment Phase Items: ${d.equipmentPhaseBomItemCount}`);
        console.log(`  ⚠️  Missing RecipeBOM entirely`);
      });
    console.log();
  }

  // Print recipes with incomplete BOMs
  if (incompleteCount > 0) {
    console.log("⚠️  RECIPES WITH INCOMPLETE BOMS");
    console.log("-".repeat(80));
    diagnoses
      .filter((d) => d.hasRecipeBom && d.missingItems.length > 0)
      .forEach((d) => {
        console.log(`\n${d.recipeName}`);
        console.log(`  RecipeBOM Items: ${d.recipeBomItemCount}`);
        console.log(`  Equipment Phase Items: ${d.equipmentPhaseBomItemCount}`);
        console.log(`  Missing Items: ${d.missingItems.length}`);
        d.missingItems.forEach((item) => {
          console.log(
            `    - ${item.itemNumber}: ${item.itemName} (${
              item.itemGroup || "No Group"
            })`
          );
        });
      });
    console.log();
  }

  // Print recipes with complete BOMs
  if (completeCount > 0) {
    console.log("✅ RECIPES WITH COMPLETE BOMS");
    console.log("-".repeat(80));
    diagnoses
      .filter(
        (d) =>
          d.hasRecipeBom &&
          d.missingItems.length === 0 &&
          d.equipmentPhaseBomItemCount > 0
      )
      .slice(0, 10) // Show first 10
      .forEach((d) => {
        console.log(`${d.recipeName} (${d.recipeBomItemCount} items)`);
      });
    if (completeCount > 10) {
      console.log(`... and ${completeCount - 10} more`);
    }
    console.log();
  }

  // Detailed breakdown of missing item types
  console.log("📋 MISSING ITEM BREAKDOWN BY TYPE");
  console.log("-".repeat(80));
  const missingItemTypes = new Map<string, number>();
  diagnoses.forEach((d) => {
    d.missingItems.forEach((item) => {
      const group = item.itemGroup || "Unknown";
      missingItemTypes.set(group, (missingItemTypes.get(group) || 0) + 1);
    });
  });

  Array.from(missingItemTypes.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([group, count]) => {
      console.log(`  ${group}: ${count} missing items`);
    });
  console.log();

  await prisma.$disconnect();

  // Return summary for programmatic use
  return {
    total: recipes.length,
    complete: completeCount,
    incomplete: incompleteCount,
    noRecipeBom: noRecipeBomCount,
    diagnoses: diagnoses.filter(
      (d) => d.missingItems.length > 0 || !d.hasRecipeBom
    ),
  };
}

diagnoseRecipeBomCompleteness()
  .then(() => {
    console.log("✅ Diagnosis complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Error during diagnosis:", error);
    process.exit(1);
  });
