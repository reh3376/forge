const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function verifyBackups() {
  try {
    console.log("\n📊 BACKUP VERIFICATION\n");
    console.log("=".repeat(60));

    // Check backup tables
    const bomBackup = await prisma.$queryRawUnsafe(
      'SELECT COUNT(*) as count FROM "Bom_backup_migration_20250128"'
    );
    console.log(`✓ Bom backup records: ${bomBackup[0].count}`);

    const bomItemBackup = await prisma.$queryRawUnsafe(
      'SELECT COUNT(*) as count FROM "BomItem_backup_migration_20250128"'
    );
    console.log(`✓ BomItem backup records: ${bomItemBackup[0].count}`);

    // Check current tables
    const bomCurrent = await prisma.$queryRawUnsafe(
      'SELECT COUNT(*) as count FROM "Bom"'
    );
    console.log(`\n📋 Current Bom records: ${bomCurrent[0].count}`);

    const bomItemCurrent = await prisma.$queryRawUnsafe(
      'SELECT COUNT(*) as count FROM "BomItem"'
    );
    console.log(`📋 Current BomItem records: ${bomItemCurrent[0].count}`);

    // Check for duplicates
    const duplicates = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count
      FROM (
        SELECT "bomRevision"
        FROM "Bom"
        GROUP BY "bomRevision"
        HAVING COUNT(*) > 1
      ) duplicates
    `);
    console.log(`\n⚠️  Duplicate bomRevisions: ${duplicates[0].count}`);

    // Show some duplicate examples
    const duplicateExamples = await prisma.$queryRawUnsafe(`
      SELECT "bomRevision", COUNT(*) as duplicate_count
      FROM "Bom"
      GROUP BY "bomRevision"
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
      LIMIT 5
    `);

    if (duplicateExamples.length > 0) {
      console.log("\n📝 Sample duplicate revisions:");
      duplicateExamples.forEach((row) => {
        console.log(`   ${row.bomRevision}: ${row.duplicate_count} duplicates`);
      });
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ Backup verification complete\n");
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

verifyBackups();
