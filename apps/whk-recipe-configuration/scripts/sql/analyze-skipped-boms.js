const { PrismaClient } = require("@prisma/client");

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required");
  console.error(
    'Usage: DATABASE_URL="your-database-url" node scripts/sql/analyze-skipped-boms.js'
  );
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_URL,
    },
  },
});

async function analyzeSkippedBoms() {
  console.log("\n" + "=".repeat(80));
  console.log("  Analysis of Skipped BOMs (No Recipe Match)");
  console.log("=".repeat(80) + "\n");

  // Get all BOMs
  const allBoms = await prisma.bom.findMany({
    include: {
      item: {
        select: {
          id: true,
          itemNumber: true,
          itemName: true,
          itemGroup: true,
        },
      },
      bomItem: {
        select: {
          id: true,
        },
      },
    },
  });

  // Get existing RecipeBOMs to identify which BOMs were migrated
  const existingRecipeBoms = await prisma.recipeBom.findMany({
    select: {
      revision: true,
    },
  });

  const migratedBomRevisions = new Set(
    existingRecipeBoms.map((rb) => rb.revision)
  );

  // Find skipped BOMs
  const skippedBoms = allBoms.filter(
    (bom) => !migratedBomRevisions.has(bom.bomRevision)
  );

  console.log(`Total BOMs: ${allBoms.length}`);
  console.log(`Migrated BOMs: ${allBoms.length - skippedBoms.length}`);
  console.log(`Skipped BOMs: ${skippedBoms.length}\n`);

  // Get all Recipes
  const recipes = await prisma.recipe.findMany({
    where: {
      isClassDefinition: true,
      active: true,
    },
    select: {
      id: true,
      Recipe: true,
    },
  });

  // Get all ProductionOrders for matching logic
  const productionOrders = await prisma.productionOrder.findMany({
    select: {
      id: true,
      recipeId: true,
      fgItemId: true,
      bomId: true,
    },
  });

  console.log("=".repeat(80));
  console.log("Detailed Analysis of Each Skipped BOM");
  console.log("=".repeat(80) + "\n");

  for (let i = 0; i < skippedBoms.length; i++) {
    const bom = skippedBoms[i];

    console.log(`\n${i + 1}. BOM: ${bom.bomRevision}`);
    console.log(`   ${"─".repeat(76)}`);
    console.log(`   Finished Good Item: ${bom.item.itemNumber}`);
    console.log(`   Item Name: ${bom.item.itemName || "N/A"}`);
    console.log(`   Item Group: ${bom.item.itemGroup || "N/A"}`);
    console.log(`   BOM Items Count: ${bom.bomItem.length}`);
    console.log(`   Created: ${bom.createdAt.toISOString().split("T")[0]}`);

    // Check if there are ProductionOrders using this BOM
    const posUsingThisBom = productionOrders.filter(
      (po) => po.bomId === bom.id
    );
    console.log(
      `   Production Orders using this BOM: ${posUsingThisBom.length}`
    );

    if (posUsingThisBom.length > 0) {
      const recipesFromPOs = posUsingThisBom
        .map((po) => recipes.find((r) => r.id === po.recipeId))
        .filter((r) => r);

      if (recipesFromPOs.length > 0) {
        console.log(`   ⚠️  Recipes used with this BOM in ProductionOrders:`);
        const uniqueRecipes = [
          ...new Map(recipesFromPOs.map((r) => [r.id, r])).values(),
        ];
        uniqueRecipes.forEach((recipe) => {
          console.log(`      - ${recipe.Recipe}`);
        });
      }
    }

    // Check if the finished good item matches any Recipe via ProductionOrders
    const posWithThisFgItem = productionOrders.filter(
      (po) => po.fgItemId === bom.itemId
    );
    console.log(
      `   Production Orders producing this item: ${posWithThisFgItem.length}`
    );

    if (posWithThisFgItem.length > 0) {
      const recipesProducingThisItem = posWithThisFgItem
        .map((po) => recipes.find((r) => r.id === po.recipeId))
        .filter((r) => r);

      if (recipesProducingThisItem.length > 0) {
        console.log(`   ❓ Potential Recipe matches (produce same item):`);
        const uniqueRecipes = [
          ...new Map(recipesProducingThisItem.map((r) => [r.id, r])).values(),
        ];
        uniqueRecipes.forEach((recipe) => {
          console.log(`      - ${recipe.Recipe}`);
        });
      } else {
        console.log(`   ❌ No Recipe found that produces this item`);
      }
    } else {
      console.log(`   ❌ This finished good item has never been produced`);
    }

    // Check for similar recipe names
    const bomName = bom.bomRevision.replace(/^BOM-/, "").replace(/^x-BOM-/, "");
    const similarRecipes = recipes.filter((r) => {
      const recipeName = r.Recipe;
      return (
        recipeName.includes(bomName.substring(0, 10)) ||
        bomName.includes(recipeName.substring(0, 10))
      );
    });

    if (similarRecipes.length > 0) {
      console.log(`   🔍 Recipes with similar names:`);
      similarRecipes.forEach((recipe) => {
        console.log(`      - ${recipe.Recipe}`);
      });
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("Summary & Recommendations");
  console.log("=".repeat(80) + "\n");

  // Categorize skipped BOMs
  const categorized = {
    usedInProduction: [],
    neverProduced: [],
    hasRecipeMatch: [],
    noRecipeMatch: [],
  };

  for (const bom of skippedBoms) {
    const posUsingThisBom = productionOrders.filter(
      (po) => po.bomId === bom.id
    );
    const posWithThisFgItem = productionOrders.filter(
      (po) => po.fgItemId === bom.itemId
    );

    if (posUsingThisBom.length > 0) {
      categorized.usedInProduction.push(bom);
    }

    if (posWithThisFgItem.length === 0) {
      categorized.neverProduced.push(bom);
    }

    if (posWithThisFgItem.length > 0) {
      const recipesProducingThisItem = posWithThisFgItem
        .map((po) => recipes.find((r) => r.id === po.recipeId))
        .filter((r) => r);

      if (recipesProducingThisItem.length > 0) {
        categorized.hasRecipeMatch.push({
          bom,
          recipes: recipesProducingThisItem,
        });
      } else {
        categorized.noRecipeMatch.push(bom);
      }
    }
  }

  console.log(`📊 Categorization:`);
  console.log(
    `   BOMs used in actual ProductionOrders: ${categorized.usedInProduction.length}`
  );
  console.log(
    `   BOMs where the item has never been produced: ${categorized.neverProduced.length}`
  );
  console.log(
    `   BOMs with potential Recipe matches: ${categorized.hasRecipeMatch.length}`
  );
  console.log(
    `   BOMs with no Recipe match: ${categorized.noRecipeMatch.length}`
  );

  console.log(`\n💡 Recommendations:`);
  console.log(
    `   1. BOMs never produced (${categorized.neverProduced.length}): Consider archiving if obsolete`
  );
  console.log(
    `   2. BOMs with potential matches (${categorized.hasRecipeMatch.length}): Review matching logic`
  );
  console.log(
    `   3. BOMs used in production (${categorized.usedInProduction.length}): Priority for investigation`
  );

  await prisma.$disconnect();
}

analyzeSkippedBoms().catch(console.error);
