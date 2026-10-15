import {
  PrismaClient,
  EnumEnzymeCategory,
  EnumCalculationMethod,
} from "@prisma/client";
import {
  SeedModule,
  SeedConfig,
  SeedResult,
  ValidationResult,
  SEED_PRIORITIES,
} from "../config";

// Import the system config seeding function (for UNS configuration values)
import { seedEnzymeSystemConfigurations } from "../../seed.enzyme.systemconfig";

// Enzyme dosing configurations - matched to items by product name pattern
const ENZYME_DOSING_CONFIGS: Array<{
  productNamePattern: string;
  category: EnumEnzymeCategory;
  dosePerMetricTon: number;
  instructions: string;
  calculationMethod: EnumCalculationMethod;
  multiplier: number;
}> = [
  {
    productNamePattern: "Laminex C2K",
    category: EnumEnzymeCategory.VISCOSITY,
    dosePerMetricTon: 0.1,
    instructions: "at 152 degrees F on crash",
    calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
    multiplier: 1.0,
  },
  {
    productNamePattern: "DIAZYME SSF2",
    category: EnumEnzymeCategory.LIQUIFACTION,
    dosePerMetricTon: 0.15,
    instructions: "at 180-190 degrees F during cooking",
    calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
    multiplier: 1.0,
  },
  {
    productNamePattern: "Termamyl",
    category: EnumEnzymeCategory.LIQUIFACTION,
    dosePerMetricTon: 0.12,
    instructions: "at 180-190 degrees F during cooking",
    calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
    multiplier: 1.0,
  },
  {
    productNamePattern: "Saczyme",
    category: EnumEnzymeCategory.SACCHARIFICATION,
    dosePerMetricTon: 0.2,
    instructions: "at 140-150 degrees F during saccharification",
    calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
    multiplier: 1.0,
  },
  {
    productNamePattern: "Viscoferm",
    category: EnumEnzymeCategory.VISCOSITY,
    dosePerMetricTon: 0.08,
    instructions: "at 152 degrees F on crash",
    calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
    multiplier: 1.0,
  },
  {
    productNamePattern: "Liquozyme",
    category: EnumEnzymeCategory.VISCOSITY,
    dosePerMetricTon: 0.1,
    instructions: "at 152 degrees F on crash",
    calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
    multiplier: 1.0,
  },
];

export const enzymeConfigModule: SeedModule = {
  name: "enzyme-config",
  description: "Enzyme configurations and calculation rules for dosing",
  dependencies: ["basic-items"],
  priority: SEED_PRIORITIES.TESTING,
  enabled: true,

  runner: async (
    client: PrismaClient,
    config: SeedConfig
  ): Promise<SeedResult> => {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    let recordsCreated = 0;
    let recordsUpdated = 0;

    try {
      console.log("  └─ Seeding enzyme configurations...");

      // Step 1: Seed system configuration values (UNS config for cache, precision, etc.)
      console.log("    ├─ Seeding enzyme system configuration values...");
      await seedEnzymeSystemConfigurations(client);

      // Step 2: Find all enzyme items by itemType or itemGroup pattern (RM-ENZ-*)
      console.log("    ├─ Looking up enzyme items...");
      const enzymeItems = await client.item.findMany({
        where: {
          OR: [{ itemType: "Enzyme" }, { itemGroup: { startsWith: "RM-ENZ" } }],
          active: true,
        },
      });

      console.log(`    ├─ Found ${enzymeItems.length} enzyme items`);

      if (enzymeItems.length === 0) {
        warnings.push(
          "No enzyme items found in database. Ensure enzyme items are seeded first."
        );
        return {
          success: true,
          message: "No enzyme items to configure",
          recordsCreated,
          recordsUpdated,
          errors,
          warnings,
          executionTimeMs: Date.now() - startTime,
        };
      }

      // Step 3: For each dosing config, find matching item and upsert configuration
      console.log("    ├─ Creating enzyme configurations...");
      const missingEnzymes: string[] = [];

      for (const dosingConfig of ENZYME_DOSING_CONFIGS) {
        // Find item by product name pattern (case-insensitive partial match)
        // Check itemNumber first (contains name in parentheses like "ENZ-GUS01-Enzyme (Laminex C2K)")
        // Then fallback to itemName and itemDescription
        const matchingItem = enzymeItems.find(
          (item) =>
            item.itemNumber
              ?.toLowerCase()
              .includes(dosingConfig.productNamePattern.toLowerCase()) ||
            item.itemName
              ?.toLowerCase()
              .includes(dosingConfig.productNamePattern.toLowerCase()) ||
            item.itemDescription
              ?.toLowerCase()
              .includes(dosingConfig.productNamePattern.toLowerCase())
        );

        if (!matchingItem) {
          missingEnzymes.push(dosingConfig.productNamePattern);
          continue;
        }

        // Upsert EnzymeConfiguration
        const existingConfig = await client.enzymeConfiguration.findUnique({
          where: { itemId: matchingItem.id },
        });

        if (existingConfig) {
          // Update existing
          await client.enzymeConfiguration.update({
            where: { id: existingConfig.id },
            data: {
              category: dosingConfig.category,
              dosePerMetricTon: dosingConfig.dosePerMetricTon,
              instructions: dosingConfig.instructions,
              active: true,
              updatedBy: "enzyme-seeder",
            },
          });
          recordsUpdated++;

          // Upsert calculation rule
          const existingRule = await client.enzymeCalculationRule.findFirst({
            where: { enzymeConfigurationId: existingConfig.id },
          });

          if (existingRule) {
            await client.enzymeCalculationRule.update({
              where: { id: existingRule.id },
              data: {
                calculationMethod: dosingConfig.calculationMethod,
                multiplier: dosingConfig.multiplier,
                active: true,
                updatedBy: "enzyme-seeder",
              },
            });
          } else {
            await client.enzymeCalculationRule.create({
              data: {
                enzymeConfigurationId: existingConfig.id,
                grainType: null, // Applies to all grains
                calculationMethod: dosingConfig.calculationMethod,
                multiplier: dosingConfig.multiplier,
                active: true,
                createdBy: "enzyme-seeder",
              },
            });
            recordsCreated++;
          }
        } else {
          // Create new configuration
          const newConfig = await client.enzymeConfiguration.create({
            data: {
              itemId: matchingItem.id,
              category: dosingConfig.category,
              dosePerMetricTon: dosingConfig.dosePerMetricTon,
              instructions: dosingConfig.instructions,
              active: true,
              createdBy: "enzyme-seeder",
            },
          });
          recordsCreated++;

          // Create calculation rule
          await client.enzymeCalculationRule.create({
            data: {
              enzymeConfigurationId: newConfig.id,
              grainType: null, // Applies to all grains
              calculationMethod: dosingConfig.calculationMethod,
              multiplier: dosingConfig.multiplier,
              active: true,
              createdBy: "enzyme-seeder",
            },
          });
          recordsCreated++;
        }

        console.log(
          `    │  ✓ ${dosingConfig.productNamePattern} → ${
            matchingItem.itemName || matchingItem.itemNumber
          }`
        );
      }

      // Report missing enzymes as warnings
      if (missingEnzymes.length > 0) {
        warnings.push(
          `No matching items found for: ${missingEnzymes.join(", ")}`
        );
        console.log(`    └─ ⚠ Missing items for: ${missingEnzymes.join(", ")}`);
      }

      const finalCount = await client.enzymeConfiguration.count();
      console.log(`    └─ Total enzyme configurations: ${finalCount}`);

      return {
        success: true,
        message: `Enzyme configurations seeded: ${recordsCreated} created, ${recordsUpdated} updated`,
        recordsCreated,
        recordsUpdated,
        errors,
        warnings,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown error in enzyme config seeding";
      errors.push(errorMessage);
      console.error("    └─ ✗ Error:", errorMessage);

      return {
        success: false,
        message: `Enzyme config seeding failed: ${errorMessage}`,
        recordsCreated,
        recordsUpdated,
        errors,
        warnings,
        executionTimeMs: Date.now() - startTime,
      };
    }
  },

  validator: async (client: PrismaClient): Promise<ValidationResult> => {
    const errors: string[] = [];
    const warnings: string[] = [];
    let recordsValidated = 0;

    try {
      // Count enzyme configurations
      const enzymeConfigsCount = await client.enzymeConfiguration.count();
      recordsValidated += enzymeConfigsCount;

      if (enzymeConfigsCount === 0) {
        warnings.push(
          "No enzyme configurations found - this is optional but recommended"
        );
      } else if (enzymeConfigsCount < 5) {
        warnings.push(
          `Few enzyme configurations: ${enzymeConfigsCount} (recommended at least 5)`
        );
      }

      // Check for orphaned configs (item deleted)
      const configsWithItems = await client.enzymeConfiguration.findMany({
        include: { item: true },
      });

      const orphanedConfigs = configsWithItems.filter((c) => !c.item);
      if (orphanedConfigs.length > 0) {
        errors.push(
          `${orphanedConfigs.length} enzyme configurations have missing items`
        );
      }

      // Check for configs without calculation rules
      const configsWithRules = await client.enzymeConfiguration.findMany({
        include: { calculationRules: true },
      });

      const configsWithoutRules = configsWithRules.filter(
        (c) => c.calculationRules.length === 0
      );
      if (configsWithoutRules.length > 0) {
        warnings.push(
          `${configsWithoutRules.length} enzyme configurations have no calculation rules`
        );
      }

      // Validate reasonable dosage rates
      const unreasonableDosages = configsWithItems.filter((config) => {
        const dosage = config.dosePerMetricTon;
        return dosage < 0.01 || dosage > 10; // Reasonable range for enzyme dosing
      });

      if (unreasonableDosages.length > 0) {
        warnings.push(
          `${unreasonableDosages.length} enzyme configurations have unusual dosage rates`
        );
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        recordsValidated,
      };
    } catch (error) {
      return {
        valid: true, // Don't fail validation for optional enzyme configs
        errors: [],
        warnings: [
          `Enzyme config validation skipped: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        ],
        recordsValidated,
      };
    }
  },
};
