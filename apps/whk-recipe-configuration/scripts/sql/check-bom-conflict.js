const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  console.log("\n🔍 Checking for BOM-ABT-74-18-00-08-R01 conflict...\n");

  const boms = await prisma.$queryRawUnsafe(`
    SELECT "bomRevision", "bomName", "erpId", id
    FROM "Bom"
    WHERE "bomRevision" LIKE '%BOM-ABT-74-18-00-08-R01%'
    ORDER BY "bomRevision"
  `);

  console.log(`Found ${boms.length} BOMs:\n`);
  boms.forEach((b) => {
    console.log(`  ${b.bomRevision}`);
    console.log(`    Name: ${b.bomName}, ERP: ${b.erpId}, ID: ${b.id}\n`);
  });

  // Check what would happen if we strip RUN prefixes
  console.log("🔍 Simulating RUN# prefix removal...\n");
  const simulation = await prisma.$queryRawUnsafe(`
    SELECT
      REGEXP_REPLACE("bomRevision", '^RUN[0-9]+-', '', 'g') as new_revision,
      COUNT(*) as would_create_duplicates
    FROM "Bom"
    WHERE "bomRevision" LIKE 'RUN%'
    GROUP BY new_revision
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 10
  `);

  console.log(
    `Found ${simulation.length} BOM groups that would become duplicates:\n`
  );
  simulation.forEach((s) => {
    console.log(`  ${s.new_revision}: ${s.would_create_duplicates} duplicates`);
  });

  await prisma.$disconnect();
})();
