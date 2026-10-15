const { PrismaClient } = require("@prisma/client");

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required");
  console.error(
    'Usage: DATABASE_URL="your-database-url" node scripts/sql/check-recipe-bom-status.js'
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

async function checkRecipeBoms() {
  console.log("\n=== Current Recipe BOM Status ===\n");

  // Count existing RecipeBOMs
  const recipeBomCount = await prisma.recipeBom.count();
  console.log(`Total RecipeBOMs: ${recipeBomCount}`);

  // Count RecipeBOMItems
  const recipeBomItemCount = await prisma.recipeBomItem.count();
  console.log(`Total RecipeBOMItems: ${recipeBomItemCount}`);

  // Count Recipes
  const recipeCount = await prisma.recipe.count({
    where: {
      isClassDefinition: true,
      active: true,
    },
  });
  console.log(`Total Active Master Recipes: ${recipeCount}`);

  // Find Recipes WITH RecipeBOMs
  const recipesWithBoms = await prisma.recipe.findMany({
    where: {
      isClassDefinition: true,
      active: true,
      recipeBoms: {
        some: {},
      },
    },
    select: {
      id: true,
      Recipe: true,
    },
  });

  console.log(
    `\nRecipes with RecipeBOMs: ${recipesWithBoms.length} / ${recipeCount}`
  );

  // Find Recipes WITHOUT RecipeBOMs
  const recipesWithoutBoms = await prisma.recipe.findMany({
    where: {
      isClassDefinition: true,
      active: true,
      recipeBoms: {
        none: {},
      },
    },
    select: {
      id: true,
      Recipe: true,
    },
  });

  console.log(
    `Recipes WITHOUT RecipeBOMs: ${recipesWithoutBoms.length} / ${recipeCount}`
  );

  if (recipesWithoutBoms.length > 0) {
    console.log("\nSample Recipes without RecipeBOMs:");
    for (let i = 0; i < Math.min(10, recipesWithoutBoms.length); i++) {
      console.log(`  ${i + 1}. ${recipesWithoutBoms[i].Recipe}`);
    }
    if (recipesWithoutBoms.length > 10) {
      console.log(`  ... and ${recipesWithoutBoms.length - 10} more`);
    }
  }

  await prisma.$disconnect();
}

checkRecipeBoms().catch(console.error);
