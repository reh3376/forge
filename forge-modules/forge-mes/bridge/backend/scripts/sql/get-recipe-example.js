const { PrismaClient } = require("@prisma/client");

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required");
  console.error(
    'Usage: DATABASE_URL="your-database-url" node scripts/sql/get-recipe-example.js'
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

async function getRecipeExample() {
  // Find a Recipe with a RecipeBOM that has a good number of items
  const recipesWithBoms = await prisma.recipe.findMany({
    where: {
      isClassDefinition: true,
      active: true,
      recipeBoms: {
        some: {},
      },
    },
    include: {
      recipeBoms: {
        include: {
          recipeBomITem: {
            include: {
              item: {
                select: {
                  itemNumber: true,
                  itemName: true,
                  itemGroup: true,
                },
              },
            },
          },
        },
      },
    },
    take: 20,
  });

  // Find one with a decent number of items
  const goodExample = recipesWithBoms.find((r) =>
    r.recipeBoms.some((rb) => rb.recipeBomITem.length > 10)
  );

  if (goodExample) {
    const recipeBom = goodExample.recipeBoms[0];

    console.log("\n" + "=".repeat(80));
    console.log("RECOMMENDED RECIPE TO TEST IN UI");
    console.log("=".repeat(80));
    console.log(`\n✅ Recipe Name: ${goodExample.Recipe}`);
    console.log(`   Recipe ID: ${goodExample.id}`);
    console.log(`   Customer: ${goodExample.customerId}`);
    console.log(`   Active: ${goodExample.active}`);
    console.log(`   Whiskey Type: ${goodExample.whiskeyType || "N/A"}`);

    console.log(`\n📦 RecipeBOM Details:`);
    console.log(`   RecipeBOM ID: ${recipeBom.id}`);
    console.log(`   Revision: ${recipeBom.revision}`);
    console.log(`   Master: ${recipeBom.master}`);
    console.log(`   Total Items: ${recipeBom.recipeBomITem.length}`);

    // Group by operation
    const byOperation = recipeBom.recipeBomITem.reduce((acc, item) => {
      acc[item.operation] = (acc[item.operation] || 0) + 1;
      return acc;
    }, {});

    console.log(`\n🔧 Items by Operation:`);
    Object.entries(byOperation).forEach(([op, count]) => {
      console.log(`   ${op}: ${count} items`);
    });

    console.log(`\n📝 Sample Items (first 10):`);
    recipeBom.recipeBomITem.slice(0, 10).forEach((item, idx) => {
      console.log(
        `   ${idx + 1}. [${item.operation}] ${item.item?.itemNumber || "N/A"}`
      );
      console.log(
        `      Quantity: ${item.quantity}, Item: ${
          item.item?.itemName || "N/A"
        }`
      );
    });

    console.log("\n" + "=".repeat(80));
    console.log("TESTING INSTRUCTIONS");
    console.log("=".repeat(80));
    console.log(`\n1. Navigate to Recipes in your UI`);
    console.log(`2. Search for or filter to: "${goodExample.Recipe}"`);
    console.log(`3. Open the Recipe details`);
    console.log(`4. Look for RecipeBOM or BOM section`);
    console.log(
      `5. Verify you see ${recipeBom.recipeBomITem.length} items organized by operation`
    );
    console.log(
      `6. Check that Mashing, Fermentation, and Processing items are present`
    );

    console.log(`\n📋 Expected Data:`);
    console.log(`   - Recipe: ${goodExample.Recipe}`);
    console.log(`   - BOM Revision: ${recipeBom.revision}`);
    console.log(`   - Total Ingredients: ${recipeBom.recipeBomITem.length}`);
    Object.entries(byOperation).forEach(([op, count]) => {
      console.log(`   - ${op}: ${count}`);
    });
    console.log("\n");
  } else {
    console.log("No suitable recipe example found");
  }

  await prisma.$disconnect();
}

getRecipeExample().catch(console.error);
