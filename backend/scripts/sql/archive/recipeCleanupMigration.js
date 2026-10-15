/**
 * Script to clean up duplicate and bad recipe and BOM records
 * Specifically targets entities with "RUN" or "DEL" in their names/revisions
 * This version handles foreign key dependencies before deletion
 */

const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

// Configuration
const config = {
  useSqlFile: false, // Set to true to use SQL file, false to use direct JS implementation
  sqlFilePath: path.join(__dirname, "recipe-cleanup-migration.sql"),
  debug: true, // Set to true for detailed logging
  safeMode: true, // When true, will not delete BOMs with existing references
};

async function executeInTransaction(prisma, asyncFn) {
  try {
    await prisma.$executeRaw`BEGIN`;
    await asyncFn();
    await prisma.$executeRaw`COMMIT`;
    console.log("Transaction committed successfully");
    return true;
  } catch (error) {
    await prisma.$executeRaw`ROLLBACK`;
    console.error("Error occurred, transaction rolled back:", error);
    return false;
  }
}

async function executeSqlFile(prisma) {
  console.log(`Executing SQL file: ${config.sqlFilePath}`);

  // Read and parse SQL file
  const sqlScript = fs.readFileSync(config.sqlFilePath, "utf8");

  // Split into statements (respecting PostgreSQL statement format)
  const statements = sqlScript
    .replace(/--.*$/gm, "") // Remove comments
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  console.log(`Found ${statements.length} SQL statements to execute`);

  // Execute all statements
  for (const [index, statement] of statements.entries()) {
    const truncatedStatement =
      statement.length > 80 ? statement.substring(0, 77) + "..." : statement;

    console.log(
      `Executing statement ${index + 1}/${
        statements.length
      }: ${truncatedStatement}`
    );
    await prisma.$executeRawUnsafe(statement);
  }

  console.log("SQL file execution completed");
}

async function executeDirect(prisma) {
  console.log("Starting direct migration execution...");

  // STEP 0: Check for orphaned references first
  console.log("Checking for orphaned BOM references...");
  const orphanedReferences = await prisma.$queryRaw`
    SELECT 
      po.id as production_order_id, 
      po."poNumber" as production_order_number,
      b.id as bom_id,
      b."bomName" as bom_name,
      b."bomRevision" as bom_revision
    FROM "ProductionOrder" po
    JOIN "Bom" b ON po."bomId" = b.id
    WHERE (b."bomRevision" LIKE 'RUN%' OR b."bomRevision" LIKE '%DEL%' OR b."bomRevision" LIKE '%DELETE%') AND
      b.id NOT IN (
        SELECT b1.id
        FROM "Bom" b1
        JOIN "Bom" b2 ON 
          CASE 
            WHEN b1."bomRevision" LIKE 'RUN%' THEN regexp_replace(b1."bomRevision", '^RUN[0-9]+-BOM-', 'BOM-')
            ELSE regexp_replace(b1."bomRevision", '-(DEL|DELETE)[0-9]*$', '')
          END = b2."bomRevision" AND 
          b1."bomName" = b2."bomName"
        WHERE b1."bomRevision" LIKE 'RUN%' OR b1."bomRevision" LIKE '%DEL%' OR b1."bomRevision" LIKE '%DELETE%'
      )
  `;

  if (orphanedReferences.length > 0) {
    console.log(
      "⚠️ WARNING: Found orphaned BOM references that do not have clear mappings:"
    );
    console.table(orphanedReferences);
    console.log(
      "These will be mapped to a fallback BOM to preserve data integrity."
    );
  }

  // STEP 1: Create mappings for problematic recipes and BOMs to their legitimate counterparts

  // Find mappings for RUN recipes
  console.log("Creating mappings for problematic records...");

  // RUN recipe mappings
  const runRecipeMapping = await prisma.$queryRaw`
    SELECT 
      r1.id as problem_id, 
      r2.id as legitimate_id,
      r1."Recipe" as problem_name,
      r2."Recipe" as legitimate_name
    FROM "Recipe" r1
    JOIN "Recipe" r2 ON 
      regexp_replace(r1."Recipe", '^RUN[0-9]+-', '') = r2."Recipe" AND 
      r1."customerCode" = r2."customerCode"
    WHERE r1."Recipe" LIKE 'RUN%'
  `;

  // DEL recipe mappings
  const delRecipeMapping = await prisma.$queryRaw`
    SELECT 
      r1.id as problem_id, 
      r2.id as legitimate_id,
      r1."Recipe" as problem_name,
      r2."Recipe" as legitimate_name
    FROM "Recipe" r1
    JOIN "Recipe" r2 ON 
      regexp_replace(r1."Recipe", '-(DEL|DELETE)[0-9]*$', '') = r2."Recipe" AND 
      r1."customerCode" = r2."customerCode"
    WHERE r1."Recipe" LIKE '%DEL%' OR r1."Recipe" LIKE '%DELETE%'
  `;

  // Combine recipe mappings
  const recipeMapping = [...runRecipeMapping, ...delRecipeMapping];

  // Find mappings for RUN BOMs
  const runBomMapping = await prisma.$queryRaw`
    SELECT 
      b1.id as problem_id, 
      b2.id as legitimate_id,
      b1."bomRevision" as problem_revision,
      b2."bomRevision" as legitimate_revision
    FROM "Bom" b1
    JOIN "Bom" b2 ON 
      regexp_replace(b1."bomRevision", '^RUN[0-9]+-BOM-', 'BOM-') = b2."bomRevision" AND 
      b1."bomName" = b2."bomName"
    WHERE b1."bomRevision" LIKE 'RUN%'
  `;

  // Find mappings for DEL BOMs
  const delBomMapping = await prisma.$queryRaw`
    SELECT 
      b1.id as problem_id, 
      b2.id as legitimate_id,
      b1."bomRevision" as problem_revision,
      b2."bomRevision" as legitimate_revision
    FROM "Bom" b1
    JOIN "Bom" b2 ON 
      regexp_replace(b1."bomRevision", '-(DEL|DELETE)[0-9]*$', '') = b2."bomRevision" AND 
      b1."bomName" = b2."bomName"
    WHERE b1."bomRevision" LIKE '%DEL%' OR b1."bomRevision" LIKE '%DELETE%'
  `;

  // Combine BOM mappings
  let bomMapping = [...runBomMapping, ...delBomMapping];

  // Get all problematic BOMs that don't have proper mappings
  const unmappedBomIds = await prisma.$queryRaw`
    SELECT id, "bomName", "bomRevision"
    FROM "Bom"
    WHERE "bomRevision" LIKE 'RUN%' OR "bomRevision" LIKE '%DEL%' OR "bomRevision" LIKE '%DELETE%'
    AND id NOT IN (${bomMapping.map((m) => m.problem_id)})
  `;

  // If we have unmapped BOMs, create fallback mappings
  if (unmappedBomIds.length > 0) {
    console.log(
      `Found ${unmappedBomIds.length} problematic BOMs without proper mappings`
    );

    // Get a fallback BOM (one that's active and recent)
    const fallbackBom = await prisma.bom.findFirst({
      where: { inactive: false },
      orderBy: { updatedAt: "desc" },
    });

    if (fallbackBom) {
      console.log(
        `Using fallback BOM: ${fallbackBom.bomName} (${fallbackBom.bomRevision}) as mapping target`
      );

      // Add fallback mappings
      const fallbackMappings = unmappedBomIds.map((bom) => ({
        problem_id: bom.id,
        legitimate_id: fallbackBom.id,
        problem_revision: bom.bomRevision,
        legitimate_revision: "FALLBACK-MAPPING",
      }));

      bomMapping = [...bomMapping, ...fallbackMappings];
    } else {
      console.error(
        "No fallback BOM found! Cannot create mappings for orphaned BOMs."
      );
    }
  }

  // Count records for reporting
  const delRecipesCount = await prisma.$queryRaw`
    SELECT COUNT(*) FROM "Recipe" WHERE "Recipe" LIKE '%DEL%' OR "Recipe" LIKE '%DELETE%'
  `;

  const runRecipesCount = await prisma.$queryRaw`
    SELECT COUNT(*) FROM "Recipe" WHERE "Recipe" LIKE 'RUN%'
  `;

  const delBomCount = await prisma.$queryRaw`
    SELECT COUNT(*) FROM "Bom" WHERE "bomRevision" LIKE '%DEL%' OR "bomRevision" LIKE '%DELETE%'
  `;

  const runBomCount = await prisma.$queryRaw`
    SELECT COUNT(*) FROM "Bom" WHERE "bomRevision" LIKE 'RUN%'
  `;

  const bomItemCount = await prisma.$queryRaw`
    SELECT COUNT(*) FROM "BomItem" WHERE "bomId" IN (
      SELECT id FROM "Bom" WHERE "bomRevision" LIKE 'RUN%' OR "bomRevision" LIKE '%DEL%' OR "bomRevision" LIKE '%DELETE%'
    )
  `;

  console.log("Records to be processed:");
  console.log(
    `- ${delRecipesCount[0].count} recipes with DEL/DELETE in name (will be deleted)`
  );
  console.log(
    `- ${runRecipesCount[0].count} recipes with RUN prefix (will be deleted)`
  );
  console.log(
    `- ${delBomCount[0].count} BOMs with DEL/DELETE in revision (will be deleted)`
  );
  console.log(
    `- ${runBomCount[0].count} BOMs with RUN in revision (will be deleted)`
  );
  console.log(
    `- ${bomItemCount[0].count} BOM items associated with problematic BOMs (will be deleted)`
  );

  // STEP 2: Migrate Recipe dependencies to legitimate recipes
  console.log("\nMigrating Recipe foreign key dependencies...");

  // Update Batch records
  for (const mapping of recipeMapping) {
    await prisma.$executeRaw`
      UPDATE "Batch" 
      SET "recipeId" = ${mapping.legitimate_id}
      WHERE "recipeId" = ${mapping.problem_id}
    `;
  }

  // Update Lot records
  for (const mapping of recipeMapping) {
    await prisma.$executeRaw`
      UPDATE "Lot" 
      SET "recipeId" = ${mapping.legitimate_id}
      WHERE "recipeId" = ${mapping.problem_id}
    `;
  }

  // Update ProductionOrderRecipeInstance records
  for (const mapping of recipeMapping) {
    await prisma.$executeRaw`
      UPDATE "ProductionOrderRecipeInstance" 
      SET "recipeId" = ${mapping.legitimate_id}
      WHERE "recipeId" = ${mapping.problem_id}
    `;
  }

  // Update ProductionOrder records
  for (const mapping of recipeMapping) {
    await prisma.$executeRaw`
      UPDATE "ProductionOrder" 
      SET "recipeId" = ${mapping.legitimate_id}
      WHERE "recipeId" = ${mapping.problem_id}
    `;
  }

  // Update Recipe.classIdId references (self-referencing foreign key)
  for (const mapping of recipeMapping) {
    await prisma.$executeRaw`
      UPDATE "Recipe" 
      SET "classIdId" = ${mapping.legitimate_id}
      WHERE "classIdId" = ${mapping.problem_id}
    `;
  }

  // Update ScheduleOrder records
  for (const mapping of recipeMapping) {
    await prisma.$executeRaw`
      UPDATE "ScheduleOrder" 
      SET "scheduleOrderRecipeId" = ${mapping.legitimate_id}
      WHERE "scheduleOrderRecipeId" = ${mapping.problem_id}
    `;
  }

  // STEP 3: Migrate BOM dependencies to legitimate BOMs
  console.log("Migrating BOM foreign key dependencies...");

  // Update ProductionOrder records
  for (const mapping of bomMapping) {
    await prisma.$executeRaw`
      UPDATE "ProductionOrder" 
      SET "bomId" = ${mapping.legitimate_id}
      WHERE "bomId" = ${mapping.problem_id}
    `;
  }

  // Update UnitProcedure.bomsId records
  for (const mapping of bomMapping) {
    await prisma.$executeRaw`
      UPDATE "UnitProcedure" 
      SET "bomsId" = ${mapping.legitimate_id}
      WHERE "bomsId" = ${mapping.problem_id}
    `;
  }

  // Update UnitProcedure.primaryBomId records
  for (const mapping of bomMapping) {
    await prisma.$executeRaw`
      UPDATE "UnitProcedure" 
      SET "primaryBomId" = ${mapping.legitimate_id}
      WHERE "primaryBomId" = ${mapping.problem_id}
    `;
  }

  // Check for remaining references before deletion
  console.log("Checking for any remaining references...");

  const remainingRefs = await prisma.$queryRaw`
    SELECT 
      'ProductionOrder' as table_name, 
      COUNT(*) as remaining_references
    FROM "ProductionOrder"
    WHERE "bomId" IN (SELECT id FROM "Bom" WHERE "bomRevision" LIKE 'RUN%' OR "bomRevision" LIKE '%DEL%' OR "bomRevision" LIKE '%DELETE%')
    UNION ALL
    SELECT 
      'UnitProcedure.bomsId' as table_name, 
      COUNT(*) as remaining_references
    FROM "UnitProcedure"
    WHERE "bomsId" IN (SELECT id FROM "Bom" WHERE "bomRevision" LIKE 'RUN%' OR "bomRevision" LIKE '%DEL%' OR "bomRevision" LIKE '%DELETE%')
    UNION ALL
    SELECT 
      'UnitProcedure.primaryBomId' as table_name, 
      COUNT(*) as remaining_references
    FROM "UnitProcedure"
    WHERE "primaryBomId" IN (SELECT id FROM "Bom" WHERE "bomRevision" LIKE 'RUN%' OR "bomRevision" LIKE '%DEL%' OR "bomRevision" LIKE '%DELETE%')
  `;

  const totalRemainingRefs = remainingRefs.reduce(
    (sum, item) => sum + parseInt(item.remaining_references),
    0
  );

  if (totalRemainingRefs > 0) {
    console.warn(
      "⚠️ WARNING: Found remaining references to problematic BOMs after migration:"
    );
    console.table(remainingRefs);

    if (config.safeMode) {
      console.log(
        "Running in safe mode: Will not delete BOMs with existing references."
      );
    }
  }

  // STEP 4: Remove junction table links for problematic recipes
  console.log("Removing junction table links for problematic recipes...");
  await prisma.$executeRaw`
    DELETE FROM "_RecipeToRecipeBom"
    WHERE "A" IN (SELECT id FROM "Recipe" WHERE "Recipe" LIKE 'RUN%' OR "Recipe" LIKE '%DEL%' OR "Recipe" LIKE '%DELETE%')
  `;

  await prisma.$executeRaw`
    DELETE FROM "_RecipeToRecipeParameter"
    WHERE "A" IN (SELECT id FROM "Recipe" WHERE "Recipe" LIKE 'RUN%' OR "Recipe" LIKE '%DEL%' OR "Recipe" LIKE '%DELETE%')
  `;

  await prisma.$executeRaw`
    DELETE FROM "_RecipeToUnitProcedure"
    WHERE "A" IN (SELECT id FROM "Recipe" WHERE "Recipe" LIKE 'RUN%' OR "Recipe" LIKE '%DEL%' OR "Recipe" LIKE '%DELETE%')
  `;

  // STEP 5: Delete all problematic recipes
  console.log("Deleting all problematic recipes...");
  await prisma.$executeRaw`
    DELETE FROM "Recipe"
    WHERE "Recipe" LIKE 'RUN%' OR "Recipe" LIKE '%DEL%' OR "Recipe" LIKE '%DELETE%'
  `;

  // STEP 6: Remove BOM items for problematic BOMs
  console.log("Removing BomItems for problematic BOMs...");
  await prisma.$executeRaw`
    DELETE FROM "BomItem"
    WHERE "bomId" IN (SELECT id FROM "Bom" WHERE "bomRevision" LIKE 'RUN%' OR "bomRevision" LIKE '%DEL%' OR "bomRevision" LIKE '%DELETE%')
  `;

  // STEP 7: Delete all problematic BOMs
  console.log("Deleting problematic BOMs...");

  // Get detailed information about BOMs that would be deleted
  const bomsToDelete = await prisma.$queryRaw`
    WITH boms_to_delete AS (
      SELECT id FROM "Bom" WHERE "bomRevision" LIKE 'RUN%' OR "bomRevision" LIKE '%DEL%' OR "bomRevision" LIKE '%DELETE%'
    )
    SELECT 
      b.id, 
      b."bomName", 
      b."bomRevision",
      (SELECT COUNT(*) FROM "ProductionOrder" WHERE "bomId" = b.id) as po_refs,
      (SELECT COUNT(*) FROM "UnitProcedure" WHERE "bomsId" = b.id OR "primaryBomId" = b.id) as up_refs
    FROM "Bom" b
    WHERE b.id IN (SELECT id FROM boms_to_delete)
  `;

  // Log BOMs with remaining references
  const bomsWithRefs = bomsToDelete.filter(
    (b) => parseInt(b.po_refs) > 0 || parseInt(b.up_refs) > 0
  );
  if (bomsWithRefs.length > 0) {
    console.warn(
      "\n⚠️ WARNING: The following BOMs still have references and cannot be safely deleted:"
    );
    console.table(bomsWithRefs);
  }

  if (config.safeMode) {
    // In safe mode, only delete BOMs without references
    await prisma.$executeRaw`
      DELETE FROM "Bom"
      WHERE ("bomRevision" LIKE 'RUN%' OR "bomRevision" LIKE '%DEL%' OR "bomRevision" LIKE '%DELETE%')
      AND id NOT IN (
        SELECT "bomId" FROM "ProductionOrder" 
        UNION ALL
        SELECT "bomsId" FROM "UnitProcedure" WHERE "bomsId" IS NOT NULL
        UNION ALL
        SELECT "primaryBomId" FROM "UnitProcedure" WHERE "primaryBomId" IS NOT NULL
      )
    `;
  } else {
    // In unsafe mode, attempt to delete all problematic BOMs
    await prisma.$executeRaw`
      DELETE FROM "Bom"
      WHERE "bomRevision" LIKE 'RUN%' OR "bomRevision" LIKE '%DEL%' OR "bomRevision" LIKE '%DELETE%'
    `;
  }

  // STEP 8: Verify everything worked as expected
  console.log("\nVerifying migration...");

  const remainingRunRecipes = await prisma.$queryRaw`
    SELECT COUNT(*) FROM "Recipe" WHERE "Recipe" LIKE 'RUN%'
  `;

  const remainingDelRecipes = await prisma.$queryRaw`
    SELECT COUNT(*) FROM "Recipe" WHERE "Recipe" LIKE '%DEL%' OR "Recipe" LIKE '%DELETE%'
  `;

  const remainingRunBoms = await prisma.$queryRaw`
    SELECT COUNT(*) FROM "Bom" WHERE "bomRevision" LIKE 'RUN%'
  `;

  const remainingDelBoms = await prisma.$queryRaw`
    SELECT COUNT(*) FROM "Bom" WHERE "bomRevision" LIKE '%DEL%' OR "bomRevision" LIKE '%DELETE%'
  `;

  const remainingBomItems = await prisma.$queryRaw`
    SELECT COUNT(*) FROM "BomItem" WHERE "bomId" IN (
      SELECT id FROM "Bom" WHERE "bomRevision" LIKE 'RUN%' OR "bomRevision" LIKE '%DEL%' OR "bomRevision" LIKE '%DELETE%'
    )
  `;

  // Log verification results
  console.log("Verification results:");
  console.log(
    `- ${remainingRunRecipes[0].count} recipes with RUN prefix remain (should be 0)`
  );
  console.log(
    `- ${remainingDelRecipes[0].count} recipes with DEL/DELETE remain (should be 0)`
  );
  console.log(
    `- ${
      remainingRunBoms[0].count
    } BOMs with RUN in revision remain (should be ${
      config.safeMode ? "variable" : "0"
    })`
  );
  console.log(
    `- ${
      remainingDelBoms[0].count
    } BOMs with DEL/DELETE in revision remain (should be ${
      config.safeMode ? "variable" : "0"
    })`
  );
  console.log(
    `- ${remainingBomItems[0].count} BOM items for problematic BOMs remain (should be 0)`
  );

  // If in safe mode, we allow some BOMs to remain
  let verificationSucceeded =
    remainingRunRecipes[0].count === 0 && remainingDelRecipes[0].count === 0;

  if (config.safeMode) {
    // In safe mode, it's okay if some BOMs remain due to references
    console.log(
      "\nSome problematic BOMs may remain due to existing references."
    );
    console.log(
      "This is expected behavior in safe mode to prevent constraint violations."
    );

    // Report BOMs that couldn't be deleted
    if (
      parseInt(remainingRunBoms[0].count) > 0 ||
      parseInt(remainingDelBoms[0].count) > 0
    ) {
      const problematicBoms = await prisma.$queryRaw`
        SELECT 
          b.id, 
          b."bomName", 
          b."bomRevision",
          'ProductionOrder' as referenced_by
        FROM "Bom" b
        JOIN "ProductionOrder" po ON po."bomId" = b.id
        WHERE b."bomRevision" LIKE 'RUN%' OR b."bomRevision" LIKE '%DEL%' OR b."bomRevision" LIKE '%DELETE%'
        UNION ALL
        SELECT 
          b.id, 
          b."bomName", 
          b."bomRevision",
          'UnitProcedure.bomsId' as referenced_by
        FROM "Bom" b
        JOIN "UnitProcedure" up ON up."bomsId" = b.id
        WHERE b."bomRevision" LIKE 'RUN%' OR b."bomRevision" LIKE '%DEL%' OR b."bomRevision" LIKE '%DELETE%'
        UNION ALL
        SELECT 
          b.id, 
          b."bomName", 
          b."bomRevision",
          'UnitProcedure.primaryBomId' as referenced_by
        FROM "Bom" b
        JOIN "UnitProcedure" up ON up."primaryBomId" = b.id
        WHERE b."bomRevision" LIKE 'RUN%' OR b."bomRevision" LIKE '%DEL%' OR b."bomRevision" LIKE '%DELETE%'
      `;

      console.log(
        "\nThe following BOMs could not be deleted due to existing references:"
      );
      console.table(problematicBoms);
    }
  } else {
    // In non-safe mode, no BOMs should remain
    verificationSucceeded =
      verificationSucceeded &&
      remainingRunBoms[0].count === 0 &&
      remainingDelBoms[0].count === 0;
  }

  if (!verificationSucceeded) {
    throw new Error(
      "Migration verification failed - some problematic records remain"
    );
  }

  console.log("Direct migration execution completed");
}

async function main() {
  console.log("Starting recipe and BOM cleanup migration...");

  const prisma = new PrismaClient({
    log: config.debug ? ["query", "info", "warn", "error"] : ["warn", "error"],
  });

  try {
    let success;

    if (config.useSqlFile) {
      // Execute migration from SQL file with transaction handling
      success = await executeInTransaction(prisma, async () => {
        await executeSqlFile(prisma);
      });
    } else {
      // Execute migration directly with transaction handling
      success = await executeInTransaction(prisma, async () => {
        await executeDirect(prisma);
      });
    }

    if (success) {
      console.log("\nMigration completed successfully!");
    } else {
      console.error("\nMigration failed!");
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Allow running directly or as a module
if (require.main === module) {
  // Parse command line arguments
  const args = process.argv.slice(2);
  if (args.includes("--sql")) {
    config.useSqlFile = true;
  }
  if (args.includes("--debug")) {
    config.debug = true;
  }
  if (args.includes("--force")) {
    config.safeMode = false;
    console.log(
      "⚠️ WARNING: Running in force mode - will attempt to delete all problematic BOMs regardless of references"
    );
  }

  main().catch((error) => {
    console.error("Script execution failed:", error);
    process.exit(1);
  });
} else {
  module.exports = {
    main,
    executeInTransaction,
    executeSqlFile,
    executeDirect,
  };
}
