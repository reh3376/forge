import { MigrationParams } from "./umzug.config";
import { PrismaClient, EnumEnzymeCategory } from "@prisma/client";

// Enhanced migration utilities
interface MigrationProgress {
  total: number;
  processed: number;
  errors: number;
  warnings: number;
  startTime: Date;
  currentItem?: string;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

interface EnzymeDataTransformation {
  itemNumber: string;
  originalName: string;
  standardizedName: string;
  category: EnumEnzymeCategory;
  dosePerMetricTon: number;
  instructions: string;
  validationRules: {
    minDose: number;
    maxDose: number;
    requiredFields: string[];
  };
  transformations: {
    nameStandardization?: (name: string) => string;
    doseNormalization?: (dose: number) => number;
    instructionFormatting?: (instruction: string) => string;
  };
}

class AdvancedEnzymeMigration {
  private prisma: PrismaClient;
  private progress: MigrationProgress;
  private batchSize: number = 5;
  private migrationUser: string = "advanced-enzyme-migration-v2-corrected";

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.progress = {
      total: 0,
      processed: 0,
      errors: 0,
      warnings: 0,
      startTime: new Date(),
    };
  }

  // Enhanced enzyme data with validation rules and transformations
  // NOTE: We can only use this data for EnzymeConfiguration, NOT for Item updates
  private getEnzymeTransformations(): EnzymeDataTransformation[] {
    return [
      {
        itemNumber: "ENZ-UNI01-Enzyme (Termamyl SC DS)",
        originalName: "Termamyl SC DS",
        standardizedName: "Termamyl SC DS - Alpha Amylase", // Cannot be applied to Item
        category: EnumEnzymeCategory.LIQUIFACTION,
        dosePerMetricTon: 0.13,
        instructions:
          "Add with water/backset before grain addition at ambient temperature",
        validationRules: {
          minDose: 0.1,
          maxDose: 0.2,
          requiredFields: ["itemNumber", "category"],
        },
        transformations: {
          nameStandardization: (name: string) =>
            name.trim().replace(/\s+/g, " "),
          doseNormalization: (dose: number) => Math.round(dose * 1000) / 1000,
          instructionFormatting: (instruction: string) =>
            instruction.charAt(0).toUpperCase() + instruction.slice(1),
        },
      },
      {
        itemNumber: "ENZ-UNI04-Enzyme (Liquozyme PRO HP DI)",
        originalName: "Liquozyme PRO HP DI",
        standardizedName: "Liquozyme PRO HP DI - Pullulanase", // Cannot be applied to Item
        category: EnumEnzymeCategory.LIQUIFACTION,
        dosePerMetricTon: 0.185,
        instructions:
          "Add with water/backset before grain addition, mix thoroughly",
        validationRules: {
          minDose: 0.15,
          maxDose: 0.25,
          requiredFields: ["itemNumber", "category"],
        },
        transformations: {
          nameStandardization: (name: string) =>
            name.trim().replace(/\s+/g, " "),
          doseNormalization: (dose: number) => Math.round(dose * 1000) / 1000,
          instructionFormatting: (instruction: string) =>
            instruction.charAt(0).toUpperCase() + instruction.slice(1),
        },
      },
      {
        itemNumber: "ENZ-UNI02-Enzyme (Saczyme Pro 1.5X)",
        originalName: "Saczyme Pro 1.5X",
        standardizedName: "Saczyme Pro 1.5X - Glucoamylase", // Cannot be applied to Item
        category: EnumEnzymeCategory.SACCHARIFICATION,
        dosePerMetricTon: 0.6,
        instructions:
          "Add at 152°F (67°C) during temperature crash, ensure proper mixing",
        validationRules: {
          minDose: 0.5,
          maxDose: 0.8,
          requiredFields: ["itemNumber", "category"],
        },
        transformations: {
          nameStandardization: (name: string) =>
            name.trim().replace(/\s+/g, " "),
          doseNormalization: (dose: number) => Math.round(dose * 1000) / 1000,
          instructionFormatting: (instruction: string) =>
            instruction.charAt(0).toUpperCase() + instruction.slice(1),
        },
      },
      {
        itemNumber: "ENZ-UNI03-Enzyme (Viscoferm)",
        originalName: "Viscoferm",
        standardizedName: "Viscoferm - Beta Glucanase", // Cannot be applied to Item
        category: EnumEnzymeCategory.VISCOSITY,
        dosePerMetricTon: 0.1,
        instructions:
          "Add at 152°F (67°C) during temperature crash for viscosity reduction",
        validationRules: {
          minDose: 0.05,
          maxDose: 0.15,
          requiredFields: ["itemNumber", "category"],
        },
        transformations: {
          nameStandardization: (name: string) =>
            name.trim().replace(/\s+/g, " "),
          doseNormalization: (dose: number) => Math.round(dose * 1000) / 1000,
          instructionFormatting: (instruction: string) =>
            instruction.charAt(0).toUpperCase() + instruction.slice(1),
        },
      },
    ];
  }

  // Validate enzyme data before processing
  private validateEnzymeData(
    enzyme: EnzymeDataTransformation
  ): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    // Check required fields
    for (const field of enzyme.validationRules.requiredFields) {
      if (!enzyme[field as keyof EnzymeDataTransformation]) {
        result.errors.push(`Missing required field: ${field}`);
        result.isValid = false;
      }
    }

    // Validate dose range
    if (
      enzyme.dosePerMetricTon < enzyme.validationRules.minDose ||
      enzyme.dosePerMetricTon > enzyme.validationRules.maxDose
    ) {
      result.warnings.push(
        `Dose ${enzyme.dosePerMetricTon} is outside recommended range ` +
          `(${enzyme.validationRules.minDose}-${enzyme.validationRules.maxDose})`
      );
    }

    // Validate category
    if (!Object.values(EnumEnzymeCategory).includes(enzyme.category)) {
      result.errors.push(`Invalid enzyme category: ${enzyme.category}`);
      result.isValid = false;
    }

    // Validate item number format
    if (!enzyme.itemNumber.match(/^ENZ-[A-Z]{3}\d{2}-/)) {
      result.warnings.push(
        `Item number format may be non-standard: ${enzyme.itemNumber}`
      );
    }

    return result;
  }

  // Apply transformations to enzyme data (for EnzymeConfiguration only)
  private applyTransformations(
    enzyme: EnzymeDataTransformation
  ): EnzymeDataTransformation {
    const transformed = { ...enzyme };

    // Apply dose normalization
    if (transformed.transformations.doseNormalization) {
      transformed.dosePerMetricTon =
        transformed.transformations.doseNormalization(
          transformed.dosePerMetricTon
        );
    }

    // Apply instruction formatting
    if (transformed.transformations.instructionFormatting) {
      transformed.instructions =
        transformed.transformations.instructionFormatting(
          transformed.instructions
        );
    }

    return transformed;
  }

  // Perform data integrity check
  private async performDataIntegrityCheck(): Promise<{
    itemsCount: number;
    enzymeConfigsCount: number;
    orphanedConfigs: number;
    duplicateConfigs: number;
  }> {
    const [itemsCount, enzymeConfigsCount, orphanedConfigs, duplicateConfigs] =
      await Promise.all([
        this.prisma.item.count({ where: { itemGroup: "RM-ENZ" } }),
        this.prisma.enzymeConfiguration.count(),
        this.prisma.enzymeConfiguration.count({
          where: {
            item: null,
          },
        }),
        this.prisma.$queryRaw`
        SELECT COUNT(*) as count FROM (
          SELECT "itemId", COUNT(*) 
          FROM "EnzymeConfiguration" 
          GROUP BY "itemId" 
          HAVING COUNT(*) > 1
        ) duplicates
      `.then((result) => Number(result[0]?.count || 0)),
      ]);

    return {
      itemsCount,
      enzymeConfigsCount,
      orphanedConfigs,
      duplicateConfigs,
    };
  }

  // Process enzymes in batches for better performance
  private async processBatch(
    enzymes: EnzymeDataTransformation[]
  ): Promise<void> {
    const batchPromises = enzymes.map(async (enzyme) => {
      this.progress.currentItem = enzyme.originalName; // Use original name for logging
      this.logProgress();

      try {
        // Validate data
        const validation = this.validateEnzymeData(enzyme);
        if (!validation.isValid) {
          console.error(
            `❌ Validation failed for ${enzyme.originalName}:`,
            validation.errors
          );
          this.progress.errors++;
          return;
        }

        if (validation.warnings.length > 0) {
          console.warn(
            `⚠️  Warnings for ${enzyme.originalName}:`,
            validation.warnings
          );
          this.progress.warnings++;
        }

        // Apply transformations
        const transformedEnzyme = this.applyTransformations(enzyme);

        // Check if item exists
        const existingItem = await this.prisma.item.findFirst({
          where: { itemNumber: transformedEnzyme.itemNumber },
        });

        if (!existingItem) {
          console.error(`❌ Item not found: ${transformedEnzyme.itemNumber}`);
          this.progress.errors++;
          return;
        }

        console.log(
          `  ✅ Item found: ${existingItem.itemName} (${existingItem.erpId})`
        );
        console.log(
          `     🔒 CONSTRAINT: Cannot modify itemName, description, number, erpId, itemType, or itemClass`
        );

        // Use transaction for data consistency
        await this.prisma.$transaction(async (tx) => {
          // REMOVED: Item updates - these are now prohibited
          // We can only set itemGroup to RM-ENZ if it's not already set
          if (existingItem.itemGroup !== "RM-ENZ") {
            await tx.item.update({
              where: { id: existingItem.id },
              data: {
                itemGroup: "RM-ENZ",
                updatedAt: new Date(),
                updatedBy: this.migrationUser,
              },
            });
            console.log(`     📝 Updated itemGroup to: RM-ENZ`);
          } else {
            console.log(`     ✅ itemGroup already set to: RM-ENZ`);
          }

          // Upsert enzyme configuration (this is allowed)
          await tx.enzymeConfiguration.upsert({
            where: { itemId: existingItem.id },
            update: {
              category: transformedEnzyme.category,
              dosePerMetricTon: transformedEnzyme.dosePerMetricTon,
              instructions: transformedEnzyme.instructions,
              active: true,
              updatedAt: new Date(),
              updatedBy: this.migrationUser,
            },
            create: {
              itemId: existingItem.id,
              category: transformedEnzyme.category,
              dosePerMetricTon: transformedEnzyme.dosePerMetricTon,
              instructions: transformedEnzyme.instructions,
              active: true,
              createdAt: new Date(),
              createdBy: this.migrationUser,
              updatedAt: new Date(),
              schemaVersion: "0002-a-corrected",
            },
          });
        });

        console.log(
          `✅ Successfully processed: ${transformedEnzyme.originalName}`
        );
        this.progress.processed++;
      } catch (error) {
        console.error(`❌ Error processing ${enzyme.originalName}:`, error);
        this.progress.errors++;
      }
    });

    await Promise.all(batchPromises);
  }

  // Log migration progress
  private logProgress(): void {
    const elapsed = Date.now() - this.progress.startTime.getTime();
    const rate = this.progress.processed / (elapsed / 1000);
    const eta =
      this.progress.total > this.progress.processed
        ? (this.progress.total - this.progress.processed) / rate
        : 0;

    console.log(
      `📊 Progress: ${this.progress.processed}/${this.progress.total} ` +
        `(${Math.round(
          (this.progress.processed / this.progress.total) * 100
        )}%) ` +
        `| Errors: ${this.progress.errors} | Warnings: ${this.progress.warnings} ` +
        `| Rate: ${rate.toFixed(2)}/s | ETA: ${eta.toFixed(0)}s ` +
        `${
          this.progress.currentItem
            ? `| Current: ${this.progress.currentItem}`
            : ""
        }`
    );
  }

  // Main migration execution
  async execute(): Promise<void> {
    console.log("🚀 Starting corrected advanced enzyme migration...");
    console.log(
      "🔒 CONSTRAINTS: Only itemGroup can be modified, all other Item fields left unchanged"
    );

    // Pre-migration integrity check
    console.log("🔍 Performing pre-migration data integrity check...");
    const preCheck = await this.performDataIntegrityCheck();
    console.log("📋 Pre-migration state:", preCheck);

    const enzymes = this.getEnzymeTransformations();
    this.progress.total = enzymes.length;
    this.progress.startTime = new Date();

    console.log(
      `📦 Processing ${enzymes.length} enzymes in batches of ${this.batchSize}...`
    );

    // Process in batches
    for (let i = 0; i < enzymes.length; i += this.batchSize) {
      const batch = enzymes.slice(i, i + this.batchSize);
      console.log(
        `\n🔄 Processing batch ${
          Math.floor(i / this.batchSize) + 1
        }/${Math.ceil(enzymes.length / this.batchSize)}...`
      );
      await this.processBatch(batch);
    }

    // Post-migration integrity check
    console.log("\n🔍 Performing post-migration data integrity check...");
    const postCheck = await this.performDataIntegrityCheck();
    console.log("📋 Post-migration state:", postCheck);

    // Final summary
    const duration = Date.now() - this.progress.startTime.getTime();
    console.log("\n=== CORRECTED ADVANCED MIGRATION SUMMARY ===");
    console.log(
      `✅ Successfully processed: ${this.progress.processed}/${this.progress.total} enzymes`
    );
    console.log(`❌ Errors: ${this.progress.errors}`);
    console.log(`⚠️  Warnings: ${this.progress.warnings}`);
    console.log(`⏱️  Duration: ${(duration / 1000).toFixed(2)} seconds`);
    console.log(
      `📊 Processing rate: ${(
        this.progress.processed /
        (duration / 1000)
      ).toFixed(2)} items/second`
    );
    console.log(
      "🔒 CONSTRAINTS RESPECTED: Only itemGroup modified, itemName/description left unchanged"
    );

    if (this.progress.errors > 0) {
      throw new Error(
        `Migration completed with ${this.progress.errors} errors. Please review the logs.`
      );
    }

    console.log(
      "🎉 Corrected advanced enzyme migration completed successfully!"
    );
  }

  // Rollback functionality
  async rollback(): Promise<void> {
    console.log("🔄 Starting corrected advanced enzyme migration rollback...");

    const enzymeItemNumbers = this.getEnzymeTransformations().map(
      (e) => e.itemNumber
    );

    // Find affected items
    const affectedItems = await this.prisma.item.findMany({
      where: {
        itemNumber: { in: enzymeItemNumbers },
      },
      include: {
        EnzymeConfiguration: true,
      },
    });

    console.log(`📦 Found ${affectedItems.length} items to rollback...`);

    // Remove enzyme configurations created by this migration
    for (const item of affectedItems) {
      const deletedConfigs = await this.prisma.enzymeConfiguration.deleteMany({
        where: {
          itemId: item.id,
          schemaVersion: "0002-a-corrected",
        },
      });

      console.log(
        `🗑️  Removed ${deletedConfigs.count} enzyme configuration(s) for: ${item.itemName}`
      );
    }

    console.log(
      "⚠️  Note: itemGroup changes are not rolled back (original values unknown)"
    );
    console.log("✅ Corrected advanced enzyme migration rollback completed!");
  }
}

export async function up({ prisma }: MigrationParams): Promise<void> {
  const migration = new AdvancedEnzymeMigration(prisma);
  await migration.execute();
}

export async function down({ prisma }: MigrationParams): Promise<void> {
  const migration = new AdvancedEnzymeMigration(prisma);
  await migration.rollback();
}

// Export the class for testing purposes
export { AdvancedEnzymeMigration };
