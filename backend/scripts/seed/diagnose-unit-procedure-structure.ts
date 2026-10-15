#!/usr/bin/env ts-node

/**
 * Diagnostic Script: Unit Procedure Structure Analysis
 *
 * Analyzes the actual database structure to understand how UnitProcedures,
 * Operations, and EquipmentPhases relate to Recipes in production.
 *
 * Usage:
 *   DB_URL=<connection-string> npx ts-node scripts/seed/diagnose-unit-procedure-structure.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function diagnoseStructure() {
  console.log("🔍 Starting Unit Procedure Structure Diagnosis...\n");

  // Pick a sample recipe to analyze in detail
  const sampleRecipeName = "ABT-70-21-00-09-R01";

  console.log(`📊 Analyzing sample recipe: ${sampleRecipeName}\n`);

  const sampleRecipe = await prisma.recipe.findFirst({
    where: {
      Recipe: sampleRecipeName,
    },
  });

  if (!sampleRecipe) {
    console.log(`❌ Sample recipe ${sampleRecipeName} not found`);
    return;
  }

  console.log(`✅ Found recipe: ${sampleRecipe.Recipe} (${sampleRecipe.id})`);
  console.log(`   isClassDefinition: ${sampleRecipe.isClassDefinition}`);
  console.log(`   active: ${sampleRecipe.active}\n`);

  // Get all UnitProcedures linked to this recipe
  const unitProcedures = await prisma.unitProcedure.findMany({
    where: {
      recipe: {
        some: {
          id: sampleRecipe.id,
        },
      },
    },
    include: {
      operations: {
        include: {
          equipmentPhases: true,
        },
      },
    },
  });

  console.log(
    `📦 UnitProcedures linked to this recipe: ${unitProcedures.length}\n`
  );

  if (unitProcedures.length === 0) {
    console.log("❌ No unit procedures found for this recipe");
    return;
  }

  // Analyze each UnitProcedure
  for (const up of unitProcedures) {
    console.log(`\n🔹 UnitProcedure: ${up.name}`);
    console.log(`   ID: ${up.id}`);
    console.log(`   isClassDef: ${up.isClassDef}`);
    console.log(`   revision: ${up.revision}`);
    console.log(`   Operations: ${up.operations.length}`);

    // Analyze operations
    const cookOps = up.operations.filter((op) => op.name === "Cook");
    console.log(`   Cook Operations: ${cookOps.length}`);

    for (const op of cookOps) {
      console.log(`\n      🔸 Operation: ${op.name}`);
      console.log(`         ID: ${op.id}`);
      console.log(`         isClassDefinition: ${op.isClassDefinition}`);
      console.log(`         EquipmentPhases: ${op.equipmentPhases.length}`);

      // Show phase types
      const phaseNames = op.equipmentPhases.map((p) => p.name);
      const uniquePhaseNames = [...new Set(phaseNames)];
      console.log(
        `         Unique phase types: ${uniquePhaseNames.join(", ")}`
      );

      // Check for mashing-related phases
      const mashingPhaseNames = [
        "CornAdd",
        "RyeAdd",
        "WheatAdd",
        "MaltAdd",
        "Hold",
        "Steam",
        "Cooldown",
        "PhCapture",
        "Drop",
      ];
      const mashingPhases = op.equipmentPhases.filter((p) =>
        mashingPhaseNames.includes(p.name)
      );
      console.log(`         Mashing-related phases: ${mashingPhases.length}`);
    }
  }

  // Global statistics
  console.log(`\n\n📈 Global Statistics:\n`);

  // Count UnitProcedures by isClassDef
  const upByClassDef = await prisma.$queryRaw<
    Array<{ isClassDef: boolean | null; count: bigint }>
  >`
    SELECT "isClassDef", COUNT(*) as count
    FROM "UnitProcedure"
    GROUP BY "isClassDef"
  `;

  console.log("UnitProcedure isClassDef distribution:");
  for (const row of upByClassDef) {
    console.log(
      `   ${row.isClassDef === null ? "NULL" : row.isClassDef}: ${row.count}`
    );
  }

  // Count Operations by isClassDefinition
  const opByClassDef = await prisma.$queryRaw<
    Array<{ isClassDefinition: boolean | null; count: bigint }>
  >`
    SELECT "isClassDefinition", COUNT(*) as count
    FROM "Operation"
    GROUP BY "isClassDefinition"
  `;

  console.log("\nOperation isClassDefinition distribution:");
  for (const row of opByClassDef) {
    console.log(
      `   ${row.isClassDefinition === null ? "NULL" : row.isClassDefinition}: ${
        row.count
      }`
    );
  }

  // Count Cook operations
  const cookOpsCount = await prisma.operation.count({
    where: {
      name: "Cook",
    },
  });

  console.log(`\nTotal Cook operations: ${cookOpsCount}`);

  // Count Cook operations by isClassDefinition
  const cookOpsByClassDef = await prisma.$queryRaw<
    Array<{ isClassDefinition: boolean | null; count: bigint }>
  >`
    SELECT "isClassDefinition", COUNT(*) as count
    FROM "Operation"
    WHERE name = 'Cook'
    GROUP BY "isClassDefinition"
  `;

  console.log("Cook operations by isClassDefinition:");
  for (const row of cookOpsByClassDef) {
    console.log(
      `   ${row.isClassDefinition === null ? "NULL" : row.isClassDefinition}: ${
        row.count
      }`
    );
  }

  // Count recipes without mashing protocols
  const recipesWithoutProtocols = await prisma.recipe.count({
    where: {
      active: true,
      mashingProtocolId: null,
    },
  });

  console.log(
    `\nRecipes without mashing protocols: ${recipesWithoutProtocols}`
  );

  // Sample query: Get UnitProcedures linked to active recipes without protocols
  const upLinkedToRecipes = await prisma.$queryRaw<Array<{ total: bigint }>>`
    SELECT COUNT(DISTINCT up.id) as total
    FROM "UnitProcedure" up
    INNER JOIN "_RecipeToUnitProcedure" r2up ON up.id = r2up."B"
    INNER JOIN "Recipe" r ON r.id = r2up."A"
    WHERE r.active = true AND r."mashingProtocolId" IS NULL
  `;

  console.log(
    `UnitProcedures linked to recipes needing protocols: ${
      upLinkedToRecipes[0]?.total || 0
    }`
  );

  // Check how many of those have isClassDef = true
  const upClassDefLinkedToRecipes = await prisma.$queryRaw<
    Array<{ total: bigint }>
  >`
    SELECT COUNT(DISTINCT up.id) as total
    FROM "UnitProcedure" up
    INNER JOIN "_RecipeToUnitProcedure" r2up ON up.id = r2up."B"
    INNER JOIN "Recipe" r ON r.id = r2up."A"
    WHERE r.active = true
      AND r."mashingProtocolId" IS NULL
      AND up."isClassDef" = true
  `;

  console.log(
    `UnitProcedures with isClassDef=true: ${
      upClassDefLinkedToRecipes[0]?.total || 0
    }`
  );

  // Recommendation
  console.log(`\n\n💡 Recommendations:\n`);

  const totalUps = Number(upLinkedToRecipes[0]?.total || 0);
  const classDefUps = Number(upClassDefLinkedToRecipes[0]?.total || 0);

  if (classDefUps === 0 && totalUps > 0) {
    console.log(
      "⚠️  NO UnitProcedures have isClassDef=true for recipes needing protocols"
    );
    console.log(
      "✅ Recommendation: REMOVE the isClassDef filter from the backfill script"
    );
    console.log(
      "   OR use a different selection strategy (e.g., most recent, by revision)"
    );
  } else if (classDefUps < totalUps) {
    console.log(
      `⚠️  Only ${classDefUps}/${totalUps} UnitProcedures have isClassDef=true`
    );
    console.log(
      "✅ Recommendation: Consider removing isClassDef filter or adding fallback logic"
    );
  } else {
    console.log(
      "✅ All UnitProcedures have isClassDef=true - current filter is correct"
    );
  }
}

async function main() {
  try {
    await diagnoseStructure();
    console.log("\n✅ Diagnosis completed successfully!");
  } catch (error) {
    console.error("❌ Error during diagnosis:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { diagnoseStructure };
