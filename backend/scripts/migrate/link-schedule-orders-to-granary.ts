import { PrismaClient } from "@prisma/client";

async function linkOrphanOrders() {
  const prisma = new PrismaClient();

  try {
    // Find Granary asset
    const granary = await prisma.asset.findFirst({
      where: { name: { contains: "Granary", mode: "insensitive" } },
    });

    if (!granary) {
      console.error("Granary asset not found!");
      process.exit(1);
    }

    console.log(`Found Granary asset: ${granary.id} (${granary.name})`);

    // Find orphan schedule order queues (no areas linked)
    const orphans = await prisma.scheduleOrderQueue.findMany({
      where: { areas: { none: {} } },
      include: { scheduleOrder: true },
    });

    console.log(`Found ${orphans.length} orphan schedule order queues`);

    if (orphans.length === 0) {
      console.log("No orphan schedule order queues to link.");
      return;
    }

    // Link each orphan to Granary
    let linked = 0;
    for (const orphan of orphans) {
      await prisma.scheduleOrderQueue.update({
        where: { id: orphan.id },
        data: { areas: { connect: { id: granary.id } } },
      });
      linked++;
      console.log(
        `[${linked}/${orphans.length}] Linked queue ${orphan.id} (index: ${orphan.queueIndex}) to ${granary.name}`
      );
    }

    console.log(
      `\nSuccessfully linked ${linked} schedule order queues to ${granary.name}`
    );
  } catch (error) {
    console.error("Error linking orphan orders:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

linkOrphanOrders();
