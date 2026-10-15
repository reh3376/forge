#!/usr/bin/env ts-node

import { PrismaClient } from "@prisma/client";
import { RollbackUtilities } from "./rollback-utilities";
import { umzug, cleanup } from "./umzug.config";

const prisma = new PrismaClient();

interface RollbackCommand {
  action:
    | "backup"
    | "analyze"
    | "rollback"
    | "emergency"
    | "partial"
    | "validate"
    | "restore"
    | "list-backups"
    | "cleanup";
  migrationName?: string;
  options?: any;
}

class RollbackCLI {
  private rollbackUtils: RollbackUtilities;

  constructor() {
    this.rollbackUtils = new RollbackUtilities(prisma, "./backups");
  }

  async executeCommand(command: RollbackCommand): Promise<void> {
    try {
      switch (command.action) {
        case "backup":
          await this.createBackup(command.migrationName || "manual-backup");
          break;

        case "analyze":
          await this.analyzeImpact(command.migrationName || "enzyme-migration");
          break;

        case "rollback":
          await this.performRollback(command.migrationName, command.options);
          break;

        case "emergency":
          await this.emergencyRollback(
            command.migrationName || "enzyme-migration",
            command.options
          );
          break;

        case "partial":
          await this.partialRollback(command.options);
          break;

        case "validate":
          await this.validateIntegrity();
          break;

        case "restore":
          await this.restoreFromBackup(
            command.options?.backupPath,
            command.options
          );
          break;

        case "list-backups":
          await this.listBackups();
          break;

        case "cleanup":
          await this.cleanupBackups(command.options?.retentionDays || 30);
          break;

        default:
          this.showHelp();
      }
    } catch (error) {
      console.error(`❌ Command failed:`, error);
      process.exit(1);
    }
  }

  private async createBackup(migrationName: string): Promise<void> {
    console.log(`📦 Creating backup for migration: ${migrationName}`);
    const metadata = await this.rollbackUtils.createPreRollbackBackup(
      migrationName
    );
    console.log(`✅ Backup created: ${metadata.backupPath}`);
    console.log(
      `📊 Records backed up: ${JSON.stringify(metadata.recordCounts, null, 2)}`
    );
  }

  private async analyzeImpact(migrationName: string): Promise<void> {
    console.log(`🔍 Analyzing rollback impact for: ${migrationName}`);
    const impact = await this.rollbackUtils.analyzeRollbackImpact(
      migrationName
    );

    console.log(`\n=== ROLLBACK IMPACT ANALYSIS ===`);
    console.log(`Risk Level: ${impact.riskLevel}`);
    console.log(`Affected Tables: ${impact.affectedTables.join(", ")}`);
    console.log(`Estimated Duration: ${impact.estimatedDuration} seconds`);

    if (Object.keys(impact.recordsToDelete).length > 0) {
      console.log(`\nRecords to Delete:`);
      Object.entries(impact.recordsToDelete).forEach(([table, count]) => {
        console.log(`  - ${table}: ${count}`);
      });
    }

    if (Object.keys(impact.recordsToModify).length > 0) {
      console.log(`\nRecords to Modify:`);
      Object.entries(impact.recordsToModify).forEach(([table, count]) => {
        console.log(`  - ${table}: ${count}`);
      });
    }

    if (Object.keys(impact.dependentRecords).length > 0) {
      console.log(`\nDependent Records:`);
      Object.entries(impact.dependentRecords).forEach(([table, count]) => {
        console.log(`  - ${table}: ${count}`);
      });
    }

    if (impact.warnings.length > 0) {
      console.log(`\nWarnings:`);
      impact.warnings.forEach((warning) => {
        console.log(`  ⚠️  ${warning}`);
      });
    }
  }

  private async performRollback(
    migrationName?: string,
    options: any = {}
  ): Promise<void> {
    if (!migrationName) {
      console.log(`🔄 Performing standard umzug rollback...`);
      const migrations = await umzug.down({ step: options.steps || 1 });
      console.log(`✅ Rolled back ${migrations.length} migration(s)`);
      return;
    }

    console.log(`🔄 Performing enhanced rollback for: ${migrationName}`);

    // Create backup first unless skipped
    if (!options.skipBackup) {
      await this.createBackup(`rollback-${migrationName}`);
    }

    // Analyze impact unless forced
    if (!options.force) {
      await this.analyzeImpact(migrationName);
      console.log(
        `\n⚠️  Proceeding with rollback in 5 seconds... (Ctrl+C to cancel)`
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    // Execute rollback
    const migrations = await umzug.down({ step: options.steps || 1 });
    console.log(`✅ Rolled back ${migrations.length} migration(s)`);

    // Validate unless skipped
    if (!options.skipValidation) {
      await this.validateIntegrity();
    }
  }

  private async emergencyRollback(
    migrationName: string,
    options: any = {}
  ): Promise<void> {
    console.log(`🚨 EMERGENCY ROLLBACK for: ${migrationName}`);
    console.log(`⚠️  This is a destructive operation!`);

    if (!options.force) {
      console.log(
        `\n⚠️  Emergency rollback will proceed in 10 seconds... (Ctrl+C to cancel)`
      );
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }

    await this.rollbackUtils.emergencyRollback(migrationName, options);
  }

  private async partialRollback(options: any = {}): Promise<void> {
    console.log(`🔄 Performing partial rollback...`);

    const rollbackOptions = {
      itemNumbers: options.itemNumbers
        ? options.itemNumbers.split(",")
        : undefined,
      categories: options.categories
        ? options.categories.split(",")
        : undefined,
      dateRange: options.dateRange
        ? {
            from: new Date(options.dateRange.from),
            to: new Date(options.dateRange.to),
          }
        : undefined,
      dryRun: options.dryRun || false,
      batchSize: options.batchSize || 10,
    };

    const result = await this.rollbackUtils.performPartialRollback(
      rollbackOptions
    );

    console.log(`\n=== PARTIAL ROLLBACK RESULTS ===`);
    console.log(`Processed: ${result.processed}`);
    console.log(`Skipped: ${result.skipped}`);
    if (result.errors.length > 0) {
      console.log(`Errors: ${result.errors.length}`);
      result.errors.forEach((error) => console.log(`  ❌ ${error}`));
    }
  }

  private async validateIntegrity(): Promise<void> {
    console.log(`🔍 Validating data integrity...`);
    const validation = await this.rollbackUtils.validatePostRollback();

    console.log(`\n=== DATA INTEGRITY VALIDATION ===`);
    console.log(`Valid: ${validation.isValid ? "✅" : "❌"}`);
    console.log(
      `Orphaned Records: ${validation.dataIntegrityChecks.orphanedRecords}`
    );
    console.log(
      `Duplicate Records: ${validation.dataIntegrityChecks.duplicateRecords}`
    );
    console.log(
      `Invalid References: ${validation.dataIntegrityChecks.invalidReferences}`
    );
    console.log(
      `Missing Required Data: ${validation.dataIntegrityChecks.missingRequiredData}`
    );

    if (validation.errors.length > 0) {
      console.log(`\nErrors:`);
      validation.errors.forEach((error) => console.log(`  ❌ ${error}`));
    }

    if (validation.warnings.length > 0) {
      console.log(`\nWarnings:`);
      validation.warnings.forEach((warning) => console.log(`  ⚠️  ${warning}`));
    }
  }

  private async restoreFromBackup(
    backupPath: string,
    options: any = {}
  ): Promise<void> {
    if (!backupPath) {
      throw new Error("Backup path is required for restore operation");
    }

    console.log(`📥 Restoring from backup: ${backupPath}`);
    await this.rollbackUtils.restoreFromBackup(backupPath, options);
  }

  private async listBackups(): Promise<void> {
    console.log(`📋 Listing available backups...`);
    const backups = await this.rollbackUtils.listBackups();

    if (backups.length === 0) {
      console.log(`No backups found.`);
      return;
    }

    console.log(`\n=== AVAILABLE BACKUPS ===`);
    backups.forEach((backup, index) => {
      console.log(
        `${index + 1}. ${backup.migrationName} (${backup.timestamp})`
      );
      console.log(`   Path: ${backup.backupPath}`);
      console.log(`   Tables: ${backup.affectedTables.join(", ")}`);
      console.log(`   Records: ${JSON.stringify(backup.recordCounts)}`);
      console.log(`   Checksum: ${backup.checksum.substring(0, 16)}...`);
      console.log("");
    });
  }

  private async cleanupBackups(retentionDays: number): Promise<void> {
    console.log(`🧹 Cleaning up backups older than ${retentionDays} days...`);
    const deletedCount = await this.rollbackUtils.cleanupOldBackups(
      retentionDays
    );
    console.log(`✅ Cleanup complete: ${deletedCount} backups deleted`);
  }

  private showHelp(): void {
    console.log(`
🔄 Rollback CLI - Comprehensive Migration Rollback Tool

Usage: ts-node rollback-cli.ts <action> [options]

Actions:
  backup <migration-name>           Create a backup before rollback
  analyze <migration-name>          Analyze rollback impact
  rollback [migration-name]         Perform rollback (standard or enhanced)
  emergency <migration-name>        Emergency rollback (destructive)
  partial                          Partial rollback with criteria
  validate                         Validate data integrity
  restore <backup-path>            Restore from backup
  list-backups                     List available backups
  cleanup [retention-days]         Cleanup old backups

Options:
  --force                          Skip confirmations and safety checks
  --skip-backup                    Skip creating backup
  --skip-validation               Skip post-rollback validation
  --dry-run                       Show what would be done without executing
  --steps <number>                Number of migrations to rollback
  --item-numbers <list>           Comma-separated item numbers for partial rollback
  --categories <list>             Comma-separated categories for partial rollback
  --batch-size <number>           Batch size for partial operations
  --retention-days <number>       Days to retain backups (default: 30)

Examples:
  ts-node rollback-cli.ts backup enzyme-migration
  ts-node rollback-cli.ts analyze enzyme-migration
  ts-node rollback-cli.ts rollback --steps=2
  ts-node rollback-cli.ts emergency enzyme-migration --force
  ts-node rollback-cli.ts partial --categories=LIQUIFACTION,VISCOSITY --dry-run
  ts-node rollback-cli.ts validate
  ts-node rollback-cli.ts restore ./backups/enzyme-migration-2024-05-30.json
  ts-node rollback-cli.ts list-backups
  ts-node rollback-cli.ts cleanup 7
    `);
  }
}

// Parse command line arguments
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    const cli = new RollbackCLI();
    cli.showHelp();
    process.exit(1);
  }

  const action = args[0] as RollbackCommand["action"];
  const migrationName = args[1];

  // Parse options
  const options: any = {};
  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const [key, value] = arg.substring(2).split("=");
      if (value) {
        options[key] = value;
      } else {
        options[key] = true;
      }
    }
  }

  const command: RollbackCommand = {
    action,
    migrationName,
    options,
  };

  const cli = new RollbackCLI();

  try {
    await cli.executeCommand(command);
  } finally {
    await cleanup();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error("CLI error:", error);
    process.exit(1);
  });
}

export { RollbackCLI };
