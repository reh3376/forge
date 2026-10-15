#!/usr/bin/env ts-node

import { umzug, initializeMigrationTable, cleanup } from "./umzug.config";

async function runMigrations() {
  try {
    console.log("Initializing migration tracking table...");
    await initializeMigrationTable();

    console.log("Running pending migrations...");
    const migrations = await umzug.up();

    if (migrations.length === 0) {
      console.log("No pending migrations found.");
    } else {
      console.log(`Successfully executed ${migrations.length} migration(s):`);
      migrations.forEach((migration) => {
        console.log(`  - ${migration.name}`);
      });
    }
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

async function rollbackMigrations(count = 1) {
  try {
    console.log(`Rolling back ${count} migration(s)...`);
    const migrations = await umzug.down({ step: count });

    if (migrations.length === 0) {
      console.log("No migrations to rollback.");
    } else {
      console.log(
        `Successfully rolled back ${migrations.length} migration(s):`
      );
      migrations.forEach((migration) => {
        console.log(`  - ${migration.name}`);
      });
    }
  } catch (error) {
    console.error("Rollback failed:", error);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

async function listMigrations() {
  try {
    const executed = await umzug.executed();
    const pending = await umzug.pending();

    console.log("\n=== Migration Status ===");
    console.log(`Executed migrations (${executed.length}):`);
    executed.forEach((migration) => {
      console.log(`  ✓ ${migration.name}`);
    });

    console.log(`\nPending migrations (${pending.length}):`);
    pending.forEach((migration) => {
      console.log(`  ○ ${migration.name}`);
    });
  } catch (error) {
    console.error("Failed to list migrations:", error);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

// CLI interface
const command = process.argv[2];
const arg = process.argv[3];

switch (command) {
  case "up":
    runMigrations();
    break;
  case "down":
    rollbackMigrations(arg ? parseInt(arg, 10) : 1);
    break;
  case "list":
  case "status":
    listMigrations();
    break;
  default:
    console.log(`
Usage: ts-node migrate.ts <command> [options]

Commands:
  up              Run all pending migrations
  down [count]    Rollback migrations (default: 1)
  list|status     Show migration status

Examples:
  ts-node migrate.ts up
  ts-node migrate.ts down 2
  ts-node migrate.ts list
    `);
    process.exit(1);
}
