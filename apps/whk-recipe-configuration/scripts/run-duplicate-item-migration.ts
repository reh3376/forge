#!/usr/bin/env ts-node

import { PrismaClient } from "@prisma/client";
import { up } from "./migrations/005-fix-duplicate-item-numbers.migration";

async function runMigration() {
  const prisma = new PrismaClient();

  try {
    console.log("🚀 Starting duplicate itemNumber cleanup migration...\n");

    await up({ prisma });

    console.log("\n✅ Migration completed successfully!");
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration if this script is executed directly
if (require.main === module) {
  runMigration();
}

export { runMigration };
