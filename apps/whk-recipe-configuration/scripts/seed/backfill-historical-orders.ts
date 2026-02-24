import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function backfillHistoricalOrders() {
  console.log("Starting historical orders backfill...\n");

  // Backfill ProductionOrders
  console.log("=== Production Orders ===");

  const productionOrders = await prisma.productionOrder.findMany({
    where: {
      status: { not: "Complete" },
    },
    select: {
      id: true,
      quantity: true,
      startDate: true,
      endDate: true,
    },
  });

  console.log(`Found ${productionOrders.length} production orders to update`);

  let poUpdated = 0;
  for (const po of productionOrders) {
    await prisma.productionOrder.update({
      where: { id: po.id },
      data: {
        status: "Complete",
        complete: true,
        inProcess: false,
        endDate: po.endDate ?? po.startDate ?? new Date(),
        completedQuantity: po.quantity,
      },
    });
    poUpdated++;
    if (poUpdated % 10 === 0) {
      console.log(
        `  Updated ${poUpdated}/${productionOrders.length} production orders`
      );
    }
  }

  console.log(`✓ Updated ${poUpdated} production orders to Complete\n`);

  // Backfill ScheduleOrders
  console.log("=== Schedule Orders ===");

  const scheduleOrders = await prisma.scheduleOrder.findMany({
    where: {
      status: { not: "Complete" },
    },
    select: {
      id: true,
      estimatedStart: true,
      estimatedEnd: true,
    },
  });

  console.log(`Found ${scheduleOrders.length} schedule orders to update`);

  let soUpdated = 0;
  for (const so of scheduleOrders) {
    await prisma.scheduleOrder.update({
      where: { id: so.id },
      data: {
        status: "Complete",
        actualStart: so.estimatedStart,
        actualEnd: so.estimatedEnd,
        completedCooks: 1,
        completedFermenters: 1,
      },
    });
    soUpdated++;
    if (soUpdated % 10 === 0) {
      console.log(
        `  Updated ${soUpdated}/${scheduleOrders.length} schedule orders`
      );
    }
  }

  console.log(`✓ Updated ${soUpdated} schedule orders to Complete\n`);

  console.log("=== Summary ===");
  console.log(`Production Orders: ${poUpdated} updated`);
  console.log(`Schedule Orders: ${soUpdated} updated`);
  console.log("\nBackfill complete!");
}

backfillHistoricalOrders()
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
