const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function checkRecipeFKConstraints() {
  try {
    console.log("\n🔍 CHECKING ALL FOREIGN KEY CONSTRAINTS ON RECIPE\n");
    console.log("=".repeat(70));

    // Get all FK constraints that reference Recipe.id
    const fkConstraints = await prisma.$queryRawUnsafe(`
      SELECT
        tc.table_name,
        kcu.column_name,
        rc.delete_rule,
        rc.update_rule,
        tc.constraint_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints AS rc
        ON tc.constraint_name = rc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = 'Recipe'
        AND ccu.column_name = 'id'
      ORDER BY tc.table_name
    `);

    console.log(
      `\nFound ${fkConstraints.length} tables with Foreign Keys to Recipe.id:\n`
    );

    for (const fk of fkConstraints) {
      console.log(`${fk.table_name}.${fk.column_name}`);
      console.log(`  ON DELETE: ${fk.delete_rule}`);
      console.log(`  ON UPDATE: ${fk.update_rule}`);
      console.log(`  Constraint: ${fk.constraint_name}\n`);
    }

    // Now check the 15 Recipes with NO Lot references
    console.log("=".repeat(70));
    console.log("📝 Checking References for Recipes WITHOUT Lot References\n");

    const duplicateGroups = await prisma.$queryRawUnsafe(`
      SELECT
        REGEXP_REPLACE("Recipe", '^RUN[0-9]+-', '', 'g') as target_name,
        ARRAY_AGG(id ORDER BY
          CASE
            WHEN "Recipe" NOT LIKE 'RUN%' THEN 1
            ELSE 2
          END,
          "createdAt" DESC
        ) as recipe_ids
      FROM "Recipe"
      WHERE "Recipe" LIKE '%-%'
      GROUP BY target_name
      HAVING COUNT(*) > 1
    `);

    const allDuplicateRecipeIds = duplicateGroups.flatMap((g) =>
      g.recipe_ids.slice(1)
    );

    // Get Recipes with NO Lot references
    const recipesWithLots = await prisma.$queryRawUnsafe(
      `
      SELECT DISTINCT "recipeId"
      FROM "Lot"
      WHERE "recipeId" = ANY($1::text[])
    `,
      allDuplicateRecipeIds
    );

    const recipeIdsWithLots = recipesWithLots.map((r) => r.recipeId);
    const recipesWithoutLots = allDuplicateRecipeIds.filter(
      (id) => !recipeIdsWithLots.includes(id)
    );

    console.log(
      `Found ${recipesWithoutLots.length} Recipes without Lot references\n`
    );

    // Check each table for references
    const tablesToCheck = fkConstraints.map((fk) => ({
      table: fk.table_name,
      column: fk.column_name,
    }));

    for (const { table, column } of tablesToCheck) {
      if (table === "Lot") continue; // Already checked

      try {
        const count = await prisma.$queryRawUnsafe(
          `
          SELECT COUNT(*) as count
          FROM "${table}"
          WHERE "${column}" = ANY($1::text[])
        `,
          recipesWithoutLots
        );

        if (Number(count[0].count) > 0) {
          console.log(`${table}.${column}: ${count[0].count} references`);
        }
      } catch (error) {
        console.log(`${table}.${column}: Error checking (${error.message})`);
      }
    }

    console.log("\n" + "=".repeat(70));
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.log("Stack:", error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

checkRecipeFKConstraints().then(() => {
  process.exit(0);
});
