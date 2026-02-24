import { MigrationParams } from "./umzug.config";

export async function up({ prisma }: MigrationParams): Promise<void> {
  console.log("Starting duplicate itemNumber cleanup migration...");

  // Find all duplicate itemNumbers
  const duplicateItemNumbers = await prisma.$queryRaw<
    Array<{ itemNumber: string; count: number }>
  >`
    SELECT "itemNumber", COUNT(*) as count 
    FROM "Item" 
    WHERE "itemNumber" IS NOT NULL 
    GROUP BY "itemNumber" 
    HAVING COUNT(*) > 1 
    ORDER BY count DESC
  `;

  console.log(
    `Found ${duplicateItemNumbers.length} itemNumbers with duplicates`
  );

  if (duplicateItemNumbers.length === 0) {
    console.log(
      "No duplicate itemNumbers found. Migration completed successfully."
    );
    return;
  }

  let totalProcessed = 0;
  let totalRemoved = 0;
  let totalDependenciesMigrated = 0;
  const migrationUser = "duplicate-cleanup-migration";
  const now = new Date();

  for (const duplicate of duplicateItemNumbers) {
    console.log(
      `\nProcessing itemNumber: ${duplicate.itemNumber} (${duplicate.count} duplicates)`
    );

    // Get all items with this itemNumber, ordered by creation date (oldest first)
    const duplicateItems = await prisma.item.findMany({
      where: {
        itemNumber: duplicate.itemNumber,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (duplicateItems.length <= 1) {
      console.log(
        `  ⚠️  Expected duplicates but found ${duplicateItems.length} items. Skipping.`
      );
      continue;
    }

    // Keep the oldest item (first in the array)
    const itemToKeep = duplicateItems[0];
    const itemsToRemove = duplicateItems.slice(1);

    console.log(
      `  ✅ Keeping oldest item: ${itemToKeep.id} (created: ${itemToKeep.createdAt})`
    );
    console.log(`     Name: ${itemToKeep.itemName}`);
    console.log(`     Description: ${itemToKeep.itemDescription || "N/A"}`);

    // Process items to remove
    for (let i = 0; i < itemsToRemove.length; i++) {
      const itemToRemove = itemsToRemove[i];
      console.log(
        `  🗑️  Processing duplicate ${i + 1}: ${itemToRemove.id} (created: ${
          itemToRemove.createdAt
        })`
      );
      console.log(`     Name: ${itemToRemove.itemName}`);
      console.log(`     Description: ${itemToRemove.itemDescription || "N/A"}`);

      let dependenciesMigrated = 0;

      try {
        // Migrate dependencies to the kept item
        console.log(`     🔄 Migrating dependencies...`);

        // 1. Migrate AdditiveActual records
        const additiveActuals = await prisma.additiveActual.updateMany({
          where: { itemId: itemToRemove.id },
          data: { itemId: itemToKeep.id },
        });
        if (additiveActuals.count > 0) {
          console.log(
            `        ✅ Migrated ${additiveActuals.count} AdditiveActual records`
          );
          dependenciesMigrated += additiveActuals.count;
        }

        // 2. Migrate Bom records
        const boms = await prisma.bom.updateMany({
          where: { itemId: itemToRemove.id },
          data: { itemId: itemToKeep.id },
        });
        if (boms.count > 0) {
          console.log(`        ✅ Migrated ${boms.count} Bom records`);
          dependenciesMigrated += boms.count;
        }

        // 3. Migrate BomItem records
        const bomItems = await prisma.bomItem.updateMany({
          where: { itemId: itemToRemove.id },
          data: {
            itemId: itemToKeep.id,
            updatedBy: migrationUser,
            updatedAt: now,
          },
        });
        if (bomItems.count > 0) {
          console.log(`        ✅ Migrated ${bomItems.count} BomItem records`);
          dependenciesMigrated += bomItems.count;
        }

        // 4. Migrate Inventory records
        const inventories = await prisma.inventory.updateMany({
          where: { itemId: itemToRemove.id },
          data: {
            itemId: itemToKeep.id,
            updatedBy: migrationUser,
            updatedAt: now,
          },
        });
        if (inventories.count > 0) {
          console.log(
            `        ✅ Migrated ${inventories.count} Inventory records`
          );
          dependenciesMigrated += inventories.count;
        }

        // 5. Migrate InventoryLog records
        const inventoryLogs = await prisma.inventoryLog.updateMany({
          where: { itemId: itemToRemove.id },
          data: { itemId: itemToKeep.id },
        });
        if (inventoryLogs.count > 0) {
          console.log(
            `        ✅ Migrated ${inventoryLogs.count} InventoryLog records`
          );
          dependenciesMigrated += inventoryLogs.count;
        }

        // 6. Migrate InventoryTransfer records
        const inventoryTransfers = await prisma.inventoryTransfer.updateMany({
          where: { itemId: itemToRemove.id },
          data: {
            itemId: itemToKeep.id,
            updatedBy: migrationUser,
            updatedAt: now,
          },
        });
        if (inventoryTransfers.count > 0) {
          console.log(
            `        ✅ Migrated ${inventoryTransfers.count} InventoryTransfer records`
          );
          dependenciesMigrated += inventoryTransfers.count;
        }

        // 7. Migrate ItemReceipt records
        const itemReceipts = await prisma.itemReceipt.updateMany({
          where: { itemId: itemToRemove.id },
          data: {
            itemId: itemToKeep.id,
            updatedBy: migrationUser,
            updatedAt: now,
          },
        });
        if (itemReceipts.count > 0) {
          console.log(
            `        ✅ Migrated ${itemReceipts.count} ItemReceipt records`
          );
          dependenciesMigrated += itemReceipts.count;
        }

        // 8. Migrate Lot records (continerItemId)
        const lots = await prisma.lot.updateMany({
          where: { continerItemId: itemToRemove.id },
          data: { continerItemId: itemToKeep.id },
        });
        if (lots.count > 0) {
          console.log(`        ✅ Migrated ${lots.count} Lot records`);
          dependenciesMigrated += lots.count;
        }

        // 9. Migrate ProductionOrder records (fgItemId)
        const productionOrders = await prisma.productionOrder.updateMany({
          where: { fgItemId: itemToRemove.id },
          data: {
            fgItemId: itemToKeep.id,
            updatedBy: migrationUser,
            updatedAt: now,
          },
        });
        if (productionOrders.count > 0) {
          console.log(
            `        ✅ Migrated ${productionOrders.count} ProductionOrder records`
          );
          dependenciesMigrated += productionOrders.count;
        }

        // 10. Migrate RecipeBomItem records (updatedBy is timestamp, not text)
        const recipeBomItems = await prisma.recipeBomItem.updateMany({
          where: { itemId: itemToRemove.id },
          data: { itemId: itemToKeep.id, updatedAt: now },
        });
        if (recipeBomItems.count > 0) {
          console.log(
            `        ✅ Migrated ${recipeBomItems.count} RecipeBomItem records`
          );
          dependenciesMigrated += recipeBomItems.count;
        }

        // 11. Migrate many-to-many relationship tables
        // _ItemOnLots
        await prisma.$executeRaw`
          UPDATE "_ItemOnLots" SET "A" = ${itemToKeep.id} WHERE "A" = ${itemToRemove.id}
        `;

        // _ItemToPurchaseOrder
        await prisma.$executeRaw`
          UPDATE "_ItemToPurchaseOrder" SET "A" = ${itemToKeep.id} WHERE "A" = ${itemToRemove.id}
        `;

        // _ItemToSalesOrder
        await prisma.$executeRaw`
          UPDATE "_ItemToSalesOrder" SET "A" = ${itemToKeep.id} WHERE "A" = ${itemToRemove.id}
        `;

        // _ItemToTestParameter
        await prisma.$executeRaw`
          UPDATE "_ItemToTestParameter" SET "A" = ${itemToKeep.id} WHERE "A" = ${itemToRemove.id}
        `;

        // _containerItem
        await prisma.$executeRaw`
          UPDATE "_containerItem" SET "A" = ${itemToKeep.id} WHERE "A" = ${itemToRemove.id}
        `;

        // 12. Migrate enzyme_configurations if they exist
        try {
          const enzymeConfigs = await prisma.$executeRaw`
            UPDATE "enzyme_configurations" SET "itemId" = ${itemToKeep.id}, "updatedBy" = ${migrationUser}, "updatedAt" = ${now}
            WHERE "itemId" = ${itemToRemove.id}
          `;
          if (enzymeConfigs > 0) {
            console.log(
              `        ✅ Migrated ${enzymeConfigs} enzyme_configurations records`
            );
            dependenciesMigrated += Number(enzymeConfigs);
          }
        } catch (enzymeError) {
          // Table might not exist, ignore
        }

        console.log(
          `     📊 Total dependencies migrated: ${dependenciesMigrated}`
        );
        totalDependenciesMigrated += dependenciesMigrated;

        // Now delete the duplicate item
        await prisma.item.delete({
          where: {
            id: itemToRemove.id,
          },
        });
        console.log(`     ✅ Successfully deleted duplicate item`);
        totalRemoved++;
      } catch (error) {
        console.error(`     ❌ Failed to process item: ${error}`);
        console.error(
          `     Manual intervention required for item: ${itemToRemove.id}`
        );
      }
    }

    totalProcessed++;
  }

  // Try to create audit log entry if audit table exists
  try {
    await prisma.$queryRaw`
      INSERT INTO "Audit" ("action", "entityType", "entityId", "changes", "performedBy", "performedAt")
      VALUES (
        'MIGRATION',
        'Item', 
        'multiple',
        ${JSON.stringify({
          migration: "005-fix-duplicate-item-numbers",
          summary: `Processed ${totalProcessed} duplicate itemNumbers, removed ${totalRemoved} duplicate items, migrated ${totalDependenciesMigrated} dependencies`,
          duplicateItemNumbers: duplicateItemNumbers.map((d) => d.itemNumber),
        })}::jsonb,
        ${migrationUser},
        ${now}
      )
    `;
    console.log("✅ Audit log entry created");
  } catch (auditError) {
    console.log(
      "Note: Could not create audit log entry (audit table may not exist or have different schema)"
    );
  }

  console.log("\n=== MIGRATION SUMMARY ===");
  console.log(`✅ Processed itemNumbers with duplicates: ${totalProcessed}`);
  console.log(`🗑️  Successfully removed duplicate items: ${totalRemoved}`);
  console.log(`🔄 Total dependencies migrated: ${totalDependenciesMigrated}`);

  if (totalRemoved > 0) {
    console.log("\n🔄 Verifying cleanup...");
    const remainingDuplicates = await prisma.$queryRaw<
      Array<{ itemNumber: string; count: number }>
    >`
      SELECT "itemNumber", COUNT(*) as count 
      FROM "Item" 
      WHERE "itemNumber" IS NOT NULL 
      GROUP BY "itemNumber" 
      HAVING COUNT(*) > 1
    `;

    if (remainingDuplicates.length === 0) {
      console.log("✅ All duplicates successfully resolved!");
    } else {
      console.log(
        `⚠️  ${remainingDuplicates.length} itemNumbers still have duplicates`
      );
      console.log("These require manual intervention:");
      remainingDuplicates.forEach((item) => {
        console.log(`   - ${item.itemNumber} (${item.count} duplicates)`);
      });
    }
  }

  console.log("Duplicate itemNumber cleanup migration completed!");
}

export async function down({ prisma }: MigrationParams): Promise<void> {
  console.log("Rolling back duplicate itemNumber cleanup migration...");

  // This migration cannot be automatically rolled back since we deleted data
  // The rollback would require restoring the deleted duplicate items from a backup
  console.log(
    "⚠️  WARNING: This migration cannot be automatically rolled back."
  );
  console.log(
    "   Deleted duplicate items cannot be restored without a database backup."
  );
  console.log("   Migrated dependencies would need to be manually reassigned.");
  console.log(
    "   If rollback is required, restore from a backup taken before this migration."
  );

  throw new Error(
    "Migration 005-fix-duplicate-item-numbers cannot be automatically rolled back. Restore from backup if needed."
  );
}
