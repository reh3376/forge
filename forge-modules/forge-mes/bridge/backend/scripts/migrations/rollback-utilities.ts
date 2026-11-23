import { PrismaClient } from "@prisma/client";
import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";

// Types for rollback operations
interface BackupMetadata {
  timestamp: string;
  migrationName: string;
  backupPath: string;
  affectedTables: string[];
  recordCounts: Record<string, number>;
  checksum: string;
}

interface RollbackImpact {
  affectedTables: string[];
  recordsToDelete: Record<string, number>;
  recordsToModify: Record<string, number>;
  dependentRecords: Record<string, number>;
  estimatedDuration: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  warnings: string[];
}

interface RollbackValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  dataIntegrityChecks: {
    orphanedRecords: number;
    duplicateRecords: number;
    invalidReferences: number;
    missingRequiredData: number;
  };
}

interface PartialRollbackOptions {
  itemNumbers?: string[];
  categories?: string[];
  dateRange?: {
    from: Date;
    to: Date;
  };
  dryRun?: boolean;
  batchSize?: number;
}

export class RollbackUtilities {
  private prisma: PrismaClient;
  private backupDir: string;
  private auditUser: string = "rollback-utilities";

  constructor(prisma: PrismaClient, backupDir: string = "./backups") {
    this.prisma = prisma;
    this.backupDir = backupDir;
  }

  // Ensure backup directory exists
  private async ensureBackupDirectory(): Promise<void> {
    try {
      await fs.access(this.backupDir);
    } catch {
      await fs.mkdir(this.backupDir, { recursive: true });
    }
  }

  // Create data backup before rollback
  async createPreRollbackBackup(
    migrationName: string
  ): Promise<BackupMetadata> {
    console.log(
      `📦 Creating pre-rollback backup for migration: ${migrationName}`
    );

    await this.ensureBackupDirectory();

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(
      this.backupDir,
      `${migrationName}-${timestamp}.json`
    );

    // Get all enzyme-related data
    const [items, enzymeConfigs, migrationMeta] = await Promise.all([
      this.prisma.item.findMany({
        where: {
          itemNumber: {
            startsWith: "ENZ-",
          },
        },
      }),
      this.prisma.enzymeConfiguration.findMany({
        include: {
          item: true,
        },
      }),
      this.prisma
        .$queryRaw`SELECT * FROM migration_meta ORDER BY executed_at DESC`,
    ]);

    const backupData = {
      timestamp,
      migrationName,
      data: {
        items,
        enzymeConfigs,
        migrationMeta,
      },
      recordCounts: {
        items: items.length,
        enzymeConfigs: enzymeConfigs.length,
        migrationMeta: Array.isArray(migrationMeta) ? migrationMeta.length : 0,
      },
    };

    // Calculate checksum for integrity verification
    const checksum = this.calculateChecksum(JSON.stringify(backupData.data));

    const metadata: BackupMetadata = {
      timestamp,
      migrationName,
      backupPath,
      affectedTables: ["Item", "EnzymeConfiguration", "migration_meta"],
      recordCounts: backupData.recordCounts,
      checksum,
    };

    // Save backup data
    await fs.writeFile(
      backupPath,
      JSON.stringify(
        {
          metadata,
          data: backupData.data,
        },
        null,
        2
      )
    );

    // Save metadata separately for quick access
    const metadataPath = path.join(
      this.backupDir,
      `${migrationName}-${timestamp}-metadata.json`
    );
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    console.log(`✅ Backup created successfully: ${backupPath}`);
    console.log(
      `📊 Backup contains: ${Object.entries(metadata.recordCounts)
        .map(([table, count]) => `${table}: ${count}`)
        .join(", ")}`
    );

    return metadata;
  }

  // Analyze rollback impact before execution
  async analyzeRollbackImpact(migrationName: string): Promise<RollbackImpact> {
    console.log(`🔍 Analyzing rollback impact for migration: ${migrationName}`);

    const impact: RollbackImpact = {
      affectedTables: [],
      recordsToDelete: {},
      recordsToModify: {},
      dependentRecords: {},
      estimatedDuration: 0,
      riskLevel: "LOW",
      warnings: [],
    };

    // Analyze enzyme configurations that would be deleted
    const enzymeConfigs = await this.prisma.enzymeConfiguration.findMany({
      include: {
        item: true,
      },
    });

    if (enzymeConfigs.length > 0) {
      impact.affectedTables.push("EnzymeConfiguration");
      impact.recordsToDelete["EnzymeConfiguration"] = enzymeConfigs.length;

      // Check for dependent records (recipes using these enzymes)
      const dependentRecipes = await this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count 
        FROM "Recipe" r 
        WHERE r.id IN (
          SELECT DISTINCT rp."recipeId" 
          FROM "RecipeParameter" rp 
          WHERE rp."parameterName" LIKE '%enzyme%'
        )
      `;

      const dependentCount = Number(dependentRecipes[0]?.count || 0);
      if (dependentCount > 0) {
        impact.dependentRecords["Recipe"] = dependentCount;
        impact.warnings.push(
          `${dependentCount} recipes may reference enzyme parameters`
        );
        impact.riskLevel = "MEDIUM";
      }
    }

    // Analyze items that would be modified
    const enzymeItems = await this.prisma.item.findMany({
      where: {
        itemNumber: {
          startsWith: "ENZ-",
        },
      },
    });

    if (enzymeItems.length > 0) {
      impact.affectedTables.push("Item");
      impact.recordsToModify["Item"] = enzymeItems.length;
    }

    // Estimate duration based on record counts
    const totalRecords =
      Object.values(impact.recordsToDelete).reduce(
        (sum, count) => sum + count,
        0
      ) +
      Object.values(impact.recordsToModify).reduce(
        (sum, count) => sum + count,
        0
      );

    impact.estimatedDuration = Math.max(5, Math.ceil(totalRecords * 0.1)); // ~0.1 seconds per record, minimum 5 seconds

    // Determine risk level
    if (totalRecords > 100 || Object.keys(impact.dependentRecords).length > 0) {
      impact.riskLevel = "HIGH";
    } else if (totalRecords > 50) {
      impact.riskLevel = "MEDIUM";
    }

    // Add warnings based on risk assessment
    if (impact.riskLevel === "HIGH") {
      impact.warnings.push(
        "High number of records affected - consider partial rollback"
      );
    }

    if (impact.dependentRecords["Recipe"]) {
      impact.warnings.push(
        "Recipes may be affected - verify enzyme parameter usage"
      );
    }

    console.log(`📊 Impact analysis complete:`);
    console.log(`   Risk Level: ${impact.riskLevel}`);
    console.log(`   Affected Tables: ${impact.affectedTables.join(", ")}`);
    console.log(`   Estimated Duration: ${impact.estimatedDuration} seconds`);
    if (impact.warnings.length > 0) {
      console.log(`   Warnings: ${impact.warnings.length}`);
    }

    return impact;
  }

  // Validate data integrity after rollback
  async validatePostRollback(): Promise<RollbackValidationResult> {
    console.log(`🔍 Validating data integrity after rollback...`);

    const result: RollbackValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      dataIntegrityChecks: {
        orphanedRecords: 0,
        duplicateRecords: 0,
        invalidReferences: 0,
        missingRequiredData: 0,
      },
    };

    try {
      // Check for orphaned enzyme configurations
      const orphanedConfigs = await this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count 
        FROM "EnzymeConfiguration" ec 
        LEFT JOIN "Item" i ON ec."itemId" = i.id 
        WHERE i.id IS NULL
      `;
      result.dataIntegrityChecks.orphanedRecords = Number(
        orphanedConfigs[0]?.count || 0
      );

      // Check for duplicate enzyme configurations per item
      const duplicateConfigs = await this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count 
        FROM (
          SELECT "itemId", COUNT(*) 
          FROM "EnzymeConfiguration" 
          GROUP BY "itemId" 
          HAVING COUNT(*) > 1
        ) duplicates
      `;
      result.dataIntegrityChecks.duplicateRecords = Number(
        duplicateConfigs[0]?.count || 0
      );

      // Check for enzyme configurations with invalid categories
      const invalidCategories = await this.prisma.enzymeConfiguration.findMany({
        where: {
          category: {
            notIn: ["LIQUIFACTION", "SACCHARIFICATION", "VISCOSITY"],
          },
        },
      });
      result.dataIntegrityChecks.invalidReferences = invalidCategories.length;

      // Check for enzyme configurations missing required data
      const missingData = await this.prisma.enzymeConfiguration.findMany({
        where: {
          OR: [
            { dosePerMetricTon: { lte: 0 } },
            { instructions: { equals: "" } },
          ],
        },
      });
      result.dataIntegrityChecks.missingRequiredData = missingData.length;

      // Evaluate results
      if (result.dataIntegrityChecks.orphanedRecords > 0) {
        result.errors.push(
          `Found ${result.dataIntegrityChecks.orphanedRecords} orphaned enzyme configurations`
        );
        result.isValid = false;
      }

      if (result.dataIntegrityChecks.duplicateRecords > 0) {
        result.warnings.push(
          `Found ${result.dataIntegrityChecks.duplicateRecords} items with duplicate enzyme configurations`
        );
      }

      if (result.dataIntegrityChecks.invalidReferences > 0) {
        result.errors.push(
          `Found ${result.dataIntegrityChecks.invalidReferences} enzyme configurations with invalid categories`
        );
        result.isValid = false;
      }

      if (result.dataIntegrityChecks.missingRequiredData > 0) {
        result.warnings.push(
          `Found ${result.dataIntegrityChecks.missingRequiredData} enzyme configurations with missing required data`
        );
      }

      console.log(`✅ Data integrity validation complete:`);
      console.log(`   Valid: ${result.isValid}`);
      console.log(`   Errors: ${result.errors.length}`);
      console.log(`   Warnings: ${result.warnings.length}`);
    } catch (error) {
      result.errors.push(`Validation failed: ${error}`);
      result.isValid = false;
      console.error(`❌ Validation error:`, error);
    }

    return result;
  }

  // Perform partial rollback with specific criteria
  async performPartialRollback(options: PartialRollbackOptions): Promise<{
    processed: number;
    skipped: number;
    errors: string[];
  }> {
    console.log(`🔄 Performing partial rollback with options:`, options);

    const result = {
      processed: 0,
      skipped: 0,
      errors: [],
    };

    try {
      // Build where clause based on options
      const whereClause: any = {};

      if (options.itemNumbers && options.itemNumbers.length > 0) {
        whereClause.item = {
          itemNumber: {
            in: options.itemNumbers,
          },
        };
      }

      if (options.categories && options.categories.length > 0) {
        whereClause.category = {
          in: options.categories,
        };
      }

      if (options.dateRange) {
        whereClause.createdAt = {
          gte: options.dateRange.from,
          lte: options.dateRange.to,
        };
      }

      // Find matching enzyme configurations
      const targetConfigs = await this.prisma.enzymeConfiguration.findMany({
        where: whereClause,
        include: {
          item: true,
        },
      });

      console.log(
        `📦 Found ${targetConfigs.length} enzyme configurations matching criteria`
      );

      if (options.dryRun) {
        console.log(
          `🧪 DRY RUN - Would delete ${targetConfigs.length} configurations:`
        );
        targetConfigs.forEach((config) => {
          console.log(`   - ${config.item.itemName} (${config.category})`);
        });
        return result;
      }

      // Process in batches
      const batchSize = options.batchSize || 10;
      for (let i = 0; i < targetConfigs.length; i += batchSize) {
        const batch = targetConfigs.slice(i, i + batchSize);

        try {
          await this.prisma.$transaction(async (tx) => {
            for (const config of batch) {
              await tx.enzymeConfiguration.delete({
                where: { id: config.id },
              });
              console.log(
                `🗑️  Deleted configuration for: ${config.item.itemName}`
              );
              result.processed++;
            }
          });
        } catch (error) {
          result.errors.push(
            `Batch ${Math.floor(i / batchSize) + 1} failed: ${error}`
          );
          result.skipped += batch.length;
        }
      }

      console.log(
        `✅ Partial rollback complete: ${result.processed} processed, ${result.skipped} skipped`
      );
    } catch (error) {
      result.errors.push(`Partial rollback failed: ${error}`);
      console.error(`❌ Partial rollback error:`, error);
    }

    return result;
  }

  // Emergency rollback for production scenarios
  async emergencyRollback(
    migrationName: string,
    options: {
      skipBackup?: boolean;
      skipValidation?: boolean;
      force?: boolean;
    } = {}
  ): Promise<void> {
    console.log(
      `🚨 EMERGENCY ROLLBACK initiated for migration: ${migrationName}`
    );
    console.log(
      `⚠️  Options: skipBackup=${options.skipBackup}, skipValidation=${options.skipValidation}, force=${options.force}`
    );

    try {
      // Create backup unless skipped
      if (!options.skipBackup) {
        await this.createPreRollbackBackup(`emergency-${migrationName}`);
      }

      // Analyze impact unless forced
      if (!options.force) {
        const impact = await this.analyzeRollbackImpact(migrationName);
        if (impact.riskLevel === "CRITICAL" || impact.riskLevel === "HIGH") {
          console.log(
            `⚠️  HIGH RISK rollback detected. Use force=true to proceed.`
          );
          if (!options.force) {
            throw new Error(
              "Emergency rollback aborted due to high risk. Use force option to override."
            );
          }
        }
      }

      // Execute rollback based on migration name
      if (migrationName.includes("enzyme")) {
        console.log(`🔄 Executing enzyme-specific emergency rollback...`);

        // Remove all enzyme configurations
        const deletedConfigs = await this.prisma.enzymeConfiguration.deleteMany(
          {}
        );
        console.log(
          `🗑️  Deleted ${deletedConfigs.count} enzyme configurations`
        );

        // Reset enzyme items to basic state (optional)
        const enzymeItems = await this.prisma.item.findMany({
          where: {
            itemNumber: {
              startsWith: "ENZ-",
            },
          },
        });

        for (const item of enzymeItems) {
          await this.prisma.item.update({
            where: { id: item.id },
            data: {
              itemName: item.itemNumber.split("-").pop() || item.itemName,
              itemDescription: `Enzyme (${item.itemNumber})`,
              updatedAt: new Date(),
              updatedBy: `emergency-rollback-${this.auditUser}`,
            },
          });
        }

        console.log(
          `📝 Reset ${enzymeItems.length} enzyme items to basic state`
        );
      }

      // Validate unless skipped
      if (!options.skipValidation) {
        const validation = await this.validatePostRollback();
        if (!validation.isValid && !options.force) {
          throw new Error(
            `Emergency rollback validation failed: ${validation.errors.join(
              ", "
            )}`
          );
        }
      }

      console.log(`✅ Emergency rollback completed successfully`);
    } catch (error) {
      console.error(`❌ Emergency rollback failed:`, error);
      throw error;
    }
  }

  // Restore from backup
  async restoreFromBackup(
    backupPath: string,
    options: {
      dryRun?: boolean;
      validateChecksum?: boolean;
    } = {}
  ): Promise<void> {
    console.log(`📥 Restoring from backup: ${backupPath}`);

    try {
      const backupContent = await fs.readFile(backupPath, "utf-8");
      const backup = JSON.parse(backupContent);

      if (options.validateChecksum) {
        const calculatedChecksum = this.calculateChecksum(
          JSON.stringify(backup.data)
        );
        if (calculatedChecksum !== backup.metadata.checksum) {
          throw new Error(
            "Backup checksum validation failed - data may be corrupted"
          );
        }
        console.log(`✅ Backup checksum validated`);
      }

      if (options.dryRun) {
        console.log(`🧪 DRY RUN - Would restore:`);
        console.log(`   Items: ${backup.data.items.length}`);
        console.log(
          `   Enzyme Configurations: ${backup.data.enzymeConfigs.length}`
        );
        return;
      }

      // Restore data in transaction
      await this.prisma.$transaction(async (tx) => {
        // Clear existing enzyme data
        await tx.enzymeConfiguration.deleteMany({});

        // Restore enzyme configurations
        for (const config of backup.data.enzymeConfigs) {
          await tx.enzymeConfiguration.create({
            data: {
              itemId: config.itemId,
              category: config.category,
              dosePerMetricTon: config.dosePerMetricTon,
              instructions: config.instructions,
              active: config.active,
              createdAt: new Date(config.createdAt),
              createdBy: config.createdBy,
              updatedAt: new Date(),
              updatedBy: `restore-${this.auditUser}`,
              schemaVersion: config.schemaVersion,
            },
          });
        }

        // Update items
        for (const item of backup.data.items) {
          await tx.item.update({
            where: { id: item.id },
            data: {
              itemName: item.itemName,
              itemDescription: item.itemDescription,
              updatedAt: new Date(),
              updatedBy: `restore-${this.auditUser}`,
            },
          });
        }
      });

      console.log(`✅ Backup restored successfully`);
    } catch (error) {
      console.error(`❌ Backup restore failed:`, error);
      throw error;
    }
  }

  // Utility function to calculate checksum
  private calculateChecksum(data: string): string {
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  // List available backups
  async listBackups(): Promise<BackupMetadata[]> {
    await this.ensureBackupDirectory();

    const files = await fs.readdir(this.backupDir);
    const metadataFiles = files.filter((f) => f.endsWith("-metadata.json"));

    const backups: BackupMetadata[] = [];
    for (const file of metadataFiles) {
      try {
        const content = await fs.readFile(
          path.join(this.backupDir, file),
          "utf-8"
        );
        backups.push(JSON.parse(content));
      } catch (error) {
        console.warn(`Failed to read backup metadata: ${file}`, error);
      }
    }

    return backups.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  // Cleanup old backups
  async cleanupOldBackups(retentionDays: number = 30): Promise<number> {
    const backups = await this.listBackups();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let deletedCount = 0;
    for (const backup of backups) {
      if (new Date(backup.timestamp) < cutoffDate) {
        try {
          await fs.unlink(backup.backupPath);
          await fs.unlink(backup.backupPath.replace(".json", "-metadata.json"));
          deletedCount++;
          console.log(
            `🗑️  Deleted old backup: ${backup.migrationName} (${backup.timestamp})`
          );
        } catch (error) {
          console.warn(`Failed to delete backup: ${backup.backupPath}`, error);
        }
      }
    }

    console.log(`✅ Cleanup complete: ${deletedCount} old backups deleted`);
    return deletedCount;
  }
}
