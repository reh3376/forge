import { PrismaClient } from "@prisma/client";

async function checkItemGroups() {
  const prisma = new PrismaClient();

  try {
    const itemGroups = await prisma.itemGroup.findMany({
      orderBy: {
        name: "asc",
      },
    });

    console.log(`Found ${itemGroups.length} item groups:\n`);

    console.log("Name".padEnd(15) + "Description".padEnd(50) + "ID");
    console.log("-".repeat(15) + "-".repeat(50) + "-".repeat(20));

    for (const group of itemGroups) {
      console.log(
        group.name.padEnd(15) + (group.description || "").padEnd(50) + group.id
      );
    }
  } catch (error) {
    console.error("Error checking item groups:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkItemGroups()
  .then(() => {
    console.log("\nCheck completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Check failed:", error);
    process.exit(1);
  });
