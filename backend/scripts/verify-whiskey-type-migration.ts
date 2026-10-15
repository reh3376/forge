import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function verifyMigration() {
  console.log(
    "╔═══════════════════════════════════════════════════════════════╗"
  );
  console.log(
    "║     WhiskeyType Migration Verification Report                ║"
  );
  console.log(
    "╚═══════════════════════════════════════════════════════════════╝\n"
  );

  try {
    // 1. Check all whiskey types exist
    console.log("📦 WhiskeyType Entity Status:");
    console.log(
      "─────────────────────────────────────────────────────────────"
    );

    const whiskeyTypes = await prisma.whiskeyType.findMany({
      orderBy: { code: "asc" },
    });

    const ttbDefinitions = whiskeyTypes.filter((wt) => wt.isTTBDefinition);
    const derivedTypes = whiskeyTypes.filter((wt) => !wt.isTTBDefinition);

    console.log(`  Total WhiskeyTypes: ${whiskeyTypes.length}`);
    console.log(`  TTB Definitions: ${ttbDefinitions.length}`);
    console.log(`    Codes: ${ttbDefinitions.map((wt) => wt.code).join(", ")}`);
    console.log(`  Derived Types: ${derivedTypes.length}`);
    console.log(`    Codes: ${derivedTypes.map((wt) => wt.code).join(", ")}`);

    // Expected codes
    const expectedCodes = [
      "ASM",
      "BW",
      "CB",
      "CW",
      "FGB",
      "FGW",
      "MW",
      "RB",
      "RW",
      "TW",
      "WB",
      "WW",
    ];
    const missingCodes = expectedCodes.filter(
      (code) => !whiskeyTypes.find((wt) => wt.code === code)
    );

    if (missingCodes.length > 0) {
      console.log(`\n  ⚠️  Missing whiskey types: ${missingCodes.join(", ")}`);
    } else {
      console.log(`\n  ✓ All expected whiskey types present`);
    }

    // 2. Check Lot migration
    console.log("\n📋 Lot Migration Status:");
    console.log(
      "─────────────────────────────────────────────────────────────"
    );

    const lotsTotal = await prisma.lot.count();
    const lotsWithEntity = await prisma.lot.count({
      where: { whiskeyTypeId: { not: null } },
    });

    let lotsWithEnum = 0;
    try {
      const result = await prisma.$queryRaw<
        Array<{ count: bigint }>
      >`SELECT COUNT(*) as count FROM "Lot" WHERE "whiskeyType" IS NOT NULL`;
      lotsWithEnum = Number(result[0].count);
    } catch (error) {
      console.log(
        "  ℹ️  Old enum column does not exist (likely already dropped)"
      );
    }

    console.log(`  Total lots: ${lotsTotal}`);
    console.log(
      `  With whiskeyTypeId: ${lotsWithEntity} (${
        lotsTotal > 0 ? Math.round((lotsWithEntity / lotsTotal) * 100) : 0
      }%)`
    );
    if (lotsWithEnum > 0) {
      console.log(`  With old enum: ${lotsWithEnum}`);
    }

    // Check for unmigrated lots (have enum but no entity)
    let orphanedLots: Array<{
      id: string;
      lotNumber: string;
      whiskeyType: string;
    }> = [];
    try {
      orphanedLots = await prisma.$queryRaw`
        SELECT id, "lotNumber", "whiskeyType"::text
        FROM "Lot"
        WHERE "whiskeyType" IS NOT NULL
        AND "whiskeyTypeId" IS NULL
        LIMIT 10
      `;

      if (orphanedLots.length > 0) {
        console.log(
          `\n  ⚠️  Found ${orphanedLots.length}+ lots with enum but no entity:`
        );
        orphanedLots.slice(0, 5).forEach((lot) => {
          console.log(`     - ${lot.lotNumber}: ${lot.whiskeyType}`);
        });
        if (orphanedLots.length > 5) {
          console.log(`     ... and ${orphanedLots.length - 5} more`);
        }
      } else {
        console.log("\n  ✓ No orphaned lots found - all migrated successfully");
      }
    } catch (error) {
      console.log(
        "\n  ℹ️  Cannot check for orphaned lots (enum column may not exist)"
      );
    }

    // 3. Check Recipe migration
    console.log("\n📚 Recipe Migration Status:");
    console.log(
      "─────────────────────────────────────────────────────────────"
    );

    const recipesTotal = await prisma.recipe.count();
    const recipesWithEntity = await prisma.recipe.count({
      where: { whiskeyTypeId: { not: null } },
    });

    let recipesWithEnum = 0;
    try {
      const result = await prisma.$queryRaw<
        Array<{ count: bigint }>
      >`SELECT COUNT(*) as count FROM "Recipe" WHERE "whiskeyType" IS NOT NULL`;
      recipesWithEnum = Number(result[0].count);
    } catch (error) {
      console.log(
        "  ℹ️  Old enum column does not exist (likely already dropped)"
      );
    }

    console.log(`  Total recipes: ${recipesTotal}`);
    console.log(
      `  With whiskeyTypeId: ${recipesWithEntity} (${
        recipesTotal > 0
          ? Math.round((recipesWithEntity / recipesTotal) * 100)
          : 0
      }%)`
    );
    if (recipesWithEnum > 0) {
      console.log(`  With old enum: ${recipesWithEnum}`);
    }

    // Check for unmigrated recipes (have enum but no entity)
    let orphanedRecipes: Array<{
      id: string;
      Recipe: string;
      whiskeyType: string;
    }> = [];
    try {
      orphanedRecipes = await prisma.$queryRaw`
        SELECT id, "Recipe", "whiskeyType"::text
        FROM "Recipe"
        WHERE "whiskeyType" IS NOT NULL
        AND "whiskeyTypeId" IS NULL
        LIMIT 10
      `;

      if (orphanedRecipes.length > 0) {
        console.log(
          `\n  ⚠️  Found ${orphanedRecipes.length}+ recipes with enum but no entity:`
        );
        orphanedRecipes.slice(0, 5).forEach((recipe) => {
          console.log(`     - ${recipe.Recipe}: ${recipe.whiskeyType}`);
        });
        if (orphanedRecipes.length > 5) {
          console.log(`     ... and ${orphanedRecipes.length - 5} more`);
        }
      } else {
        console.log(
          "\n  ✓ No orphaned recipes found - all migrated successfully"
        );
      }
    } catch (error) {
      console.log(
        "\n  ℹ️  Cannot check for orphaned recipes (enum column may not exist)"
      );
    }

    // 4. Test WhiskeyType relations
    console.log("\n🔗 WhiskeyType Relationships:");
    console.log(
      "─────────────────────────────────────────────────────────────"
    );

    const whiskeyTypesWithCounts = await Promise.all(
      whiskeyTypes.map(async (wt) => {
        const lotCount = await prisma.lot.count({
          where: { whiskeyTypeId: wt.id },
        });
        const recipeCount = await prisma.recipe.count({
          where: { whiskeyTypeId: wt.id },
        });
        return { code: wt.code, name: wt.name, lotCount, recipeCount };
      })
    );

    whiskeyTypesWithCounts.forEach((wt) => {
      if (wt.lotCount > 0 || wt.recipeCount > 0) {
        console.log(`  ${wt.code} (${wt.name}):`);
        if (wt.lotCount > 0) console.log(`    - ${wt.lotCount} lot(s)`);
        if (wt.recipeCount > 0)
          console.log(`    - ${wt.recipeCount} recipe(s)`);
      }
    });

    // 5. Summary and recommendations
    console.log(
      "\n╔═══════════════════════════════════════════════════════════════╗"
    );
    console.log(
      "║     Migration Summary                                         ║"
    );
    console.log(
      "╚═══════════════════════════════════════════════════════════════╝\n"
    );

    const allMigrated =
      orphanedLots.length === 0 && orphanedRecipes.length === 0;

    if (allMigrated) {
      console.log("  ✅ Migration Successful!");
      console.log(`     - ${whiskeyTypes.length} whiskey types available`);
      console.log(`     - ${lotsWithEntity} lots migrated`);
      console.log(`     - ${recipesWithEntity} recipes migrated`);
      console.log("\n  📝 Next Steps:");
      console.log("     1. Verify application functionality with new entity");
      console.log("     2. Test GraphQL and REST endpoints");
      console.log(
        "     3. After thorough testing, manually drop old enum columns:"
      );
      console.log('        ALTER TABLE "Lot" DROP COLUMN "whiskeyType";');
      console.log('        ALTER TABLE "Recipe" DROP COLUMN "whiskeyType";');
      console.log('        DROP TYPE IF EXISTS "EnumLotWhiskeyType";');
      console.log('        DROP TYPE IF EXISTS "EnumRecipeWhiskeyType";');
    } else {
      console.log("  ⚠️  Migration Incomplete!");
      console.log(`     - ${orphanedLots.length} lot(s) need migration`);
      console.log(`     - ${orphanedRecipes.length} recipe(s) need migration`);
      console.log("\n  📝 Recommended Action:");
      console.log(
        "     Run the seeding script again: npm run seed:whiskey-types"
      );
    }
  } catch (error) {
    console.error("\n❌ Error during verification:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run verification
if (require.main === module) {
  verifyMigration()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { verifyMigration };
