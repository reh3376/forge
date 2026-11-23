const { PrismaClient } = require("@prisma/client");

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required");
  console.error(
    'Usage: DATABASE_URL="your-database-url" node scripts/sql/check-bomitem-hierarchy.js'
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

async function checkBomItemHierarchy() {
  console.log("\n=== BomItem Class/Instance Analysis ===\n");

  // Count class definitions vs instances
  const classDefinitions = await prisma.bomItem.count({
    where: { isClassDefinition: true },
  });

  const instances = await prisma.bomItem.count({
    where: { isClassDefinition: false },
  });

  console.log(`Total BomItems: ${classDefinitions + instances}`);
  console.log(
    `├─ Class Definitions (isClassDefinition=true): ${classDefinitions}`
  );
  console.log(`└─ Instances (isClassDefinition=false): ${instances}`);

  // Find BomItems that have sub-items
  const bomItemsWithInstances = await prisma.bomItem.findMany({
    where: {
      isClassDefinition: true,
      instances: {
        some: {},
      },
    },
    include: {
      instances: true,
      item: {
        select: {
          itemNumber: true,
          itemGroup: true,
        },
      },
      bom: {
        select: {
          bomRevision: true,
        },
      },
    },
  });

  console.log(`\nBomItems with sub-items: ${bomItemsWithInstances.length}`);

  if (bomItemsWithInstances.length > 0) {
    console.log("\nSample BomItem hierarchy:");
    bomItemsWithInstances.slice(0, 5).forEach((bomItem, idx) => {
      console.log(`\n${idx + 1}. Parent BomItem:`);
      console.log(`   ├─ ID: ${bomItem.id}`);
      console.log(`   ├─ Item: ${bomItem.item.itemNumber}`);
      console.log(`   ├─ ItemGroup: ${bomItem.item.itemGroup || "none"}`);
      console.log(`   ├─ Bom: ${bomItem.bom?.bomRevision || "none"}`);
      console.log(`   ├─ Quantity: ${bomItem.quantity}`);
      console.log(`   └─ Sub-items (${bomItem.instances.length}):`);
      bomItem.instances.forEach((instance, iIdx) => {
        console.log(`      ${iIdx + 1}. Instance ID: ${instance.id}`);
        console.log(`         ├─ Quantity: ${instance.quantity}`);
        console.log(
          `         ├─ QuantityActual: ${instance.quantityActual || "none"}`
        );
        console.log(`         └─ LotId: ${instance.lotId || "none"}`);
      });
    });
  }

  // Check how many BomItems reference Boms
  const bomItemsWithBom = await prisma.bomItem.count({
    where: {
      bomId: { not: null },
    },
  });

  const bomItemsWithoutBom = await prisma.bomItem.count({
    where: {
      bomId: null,
    },
  });

  console.log(`\n=== BomItem → Bom Relationship ===`);
  console.log(`BomItems linked to Bom: ${bomItemsWithBom}`);
  console.log(`BomItems without Bom: ${bomItemsWithoutBom}`);

  await prisma.$disconnect();
}

checkBomItemHierarchy().catch(console.error);
