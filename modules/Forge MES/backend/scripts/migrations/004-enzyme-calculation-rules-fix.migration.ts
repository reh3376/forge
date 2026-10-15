import { MigrationParams } from "./umzug.config";
import {
  EnumCalculationMethod,
  EnumGrainType,
  EnumEnzymeCategory,
} from "@prisma/client";

/**
 * Migration to seed the remaining enzyme calculation rules with correct item numbers
 * This completes the calculation rules for all enzyme configurations
 */

interface EnzymeCalculationRuleData {
  enzymeItemNumber: string;
  grainType?: EnumGrainType;
  calculationMethod: EnumCalculationMethod;
  multiplier: number;
  description: string;
}

export async function up({ prisma }: MigrationParams): Promise<void> {
  console.log("🧪 Starting enzyme calculation rules fix migration...");

  const migrationUser = "enzyme-calculation-rules-fix-migration";
  const now = new Date();

  // Get all enzyme configurations
  const enzymeConfigs = await prisma.enzymeConfiguration.findMany({
    include: {
      item: {
        select: {
          itemNumber: true,
          itemName: true,
        },
      },
    },
  });

  console.log(
    `📦 Found ${enzymeConfigs.length} enzyme configurations to process`
  );

  // Define calculation rules for the missing enzymes with correct item numbers
  const calculationRulesData: EnzymeCalculationRuleData[] = [
    // SACCHARIFICATION ENZYMES - Use TOTAL_GRAIN with malt and corn adjustments

    // Saczyme Pro 1.5X - Glucoamylase (correct item number)
    {
      enzymeItemNumber: "ENZ-UNI02-Enzyme (Saczyme Pro 1.5X)",
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.0,
      description: "Standard calculation for all grains",
    },
    {
      enzymeItemNumber: "ENZ-UNI02-Enzyme (Saczyme Pro 1.5X)",
      grainType: EnumGrainType.MALT,
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 0.85, // 15% reduction for high malt content (>15%)
      description:
        "Reduced dosing for malt-heavy mash bills (malt has natural enzymes)",
    },
    {
      enzymeItemNumber: "ENZ-UNI02-Enzyme (Saczyme Pro 1.5X)",
      grainType: EnumGrainType.CORN,
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.2, // 20% increase for high corn content (>70%)
      description: "Increased dosing for corn-heavy mash bills",
    },

    // Saczyme Yield (correct item number)
    {
      enzymeItemNumber: "ENZ-UNI07-Enzyme (Saczyme Yield)",
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.0,
      description: "Standard calculation for all grains",
    },
    {
      enzymeItemNumber: "ENZ-UNI07-Enzyme (Saczyme Yield)",
      grainType: EnumGrainType.MALT,
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 0.85,
      description: "Reduced dosing for malt-heavy mash bills",
    },
    {
      enzymeItemNumber: "ENZ-UNI07-Enzyme (Saczyme Yield)",
      grainType: EnumGrainType.CORN,
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.2,
      description: "Increased dosing for corn-heavy mash bills",
    },

    // Diazyme SSF (correct item number)
    {
      enzymeItemNumber: "ENZ-UNI08-Enzyme (Diazyme SSF)",
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.0,
      description: "Standard calculation for all grains",
    },
    {
      enzymeItemNumber: "ENZ-UNI08-Enzyme (Diazyme SSF)",
      grainType: EnumGrainType.MALT,
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 0.85,
      description: "Reduced dosing for malt-heavy mash bills",
    },
    {
      enzymeItemNumber: "ENZ-UNI08-Enzyme (Diazyme SSF)",
      grainType: EnumGrainType.CORN,
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.2,
      description: "Increased dosing for corn-heavy mash bills",
    },

    // Diazyme SSF2 (correct item number - Gustafson specific)
    {
      enzymeItemNumber: "ENZ-GUS02-Enzyme (Diazyme SSF2)",
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.0,
      description: "Standard calculation for all grains",
    },
    {
      enzymeItemNumber: "ENZ-GUS02-Enzyme (Diazyme SSF2)",
      grainType: EnumGrainType.MALT,
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 0.85,
      description: "Reduced dosing for malt-heavy mash bills",
    },
    {
      enzymeItemNumber: "ENZ-GUS02-Enzyme (Diazyme SSF2)",
      grainType: EnumGrainType.CORN,
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.2,
      description: "Increased dosing for corn-heavy mash bills",
    },

    // VISCOSITY ENZYMES - Use GRAIN_SPECIFIC method for rye/wheat

    // Viscoferm - Beta Glucanase (correct item number)
    {
      enzymeItemNumber: "ENZ-UNI03-Enzyme (Viscoferm)",
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.0,
      description: "Base calculation for all grains",
    },
    {
      enzymeItemNumber: "ENZ-UNI03-Enzyme (Viscoferm)",
      grainType: EnumGrainType.RYE,
      calculationMethod: EnumCalculationMethod.GRAIN_SPECIFIC,
      multiplier: 1.5, // 50% increase for high rye+wheat content (>30%)
      description: "Grain-specific calculation for rye (high viscosity impact)",
    },
    {
      enzymeItemNumber: "ENZ-UNI03-Enzyme (Viscoferm)",
      grainType: EnumGrainType.WHEAT,
      calculationMethod: EnumCalculationMethod.GRAIN_SPECIFIC,
      multiplier: 1.5, // 50% increase for high rye+wheat content
      description:
        "Grain-specific calculation for wheat (high viscosity impact)",
    },

    // Laminex C2K (correct item number - Gustafson specific)
    {
      enzymeItemNumber: "ENZ-GUS01-Enzyme (Laminex C2K)",
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.0,
      description: "Base calculation for all grains",
    },
    {
      enzymeItemNumber: "ENZ-GUS01-Enzyme (Laminex C2K)",
      grainType: EnumGrainType.RYE,
      calculationMethod: EnumCalculationMethod.GRAIN_SPECIFIC,
      multiplier: 1.5,
      description: "Grain-specific calculation for rye (high viscosity impact)",
    },
    {
      enzymeItemNumber: "ENZ-GUS01-Enzyme (Laminex C2K)",
      grainType: EnumGrainType.WHEAT,
      calculationMethod: EnumCalculationMethod.GRAIN_SPECIFIC,
      multiplier: 1.5,
      description:
        "Grain-specific calculation for wheat (high viscosity impact)",
    },
  ];

  let createdRulesCount = 0;
  let skippedRulesCount = 0;

  // Process each calculation rule
  for (const ruleData of calculationRulesData) {
    // Find the enzyme configuration for this item number
    const enzymeConfig = enzymeConfigs.find(
      (config) => config.item.itemNumber === ruleData.enzymeItemNumber
    );

    if (!enzymeConfig) {
      console.log(
        `⚠️  Enzyme configuration not found for item: ${ruleData.enzymeItemNumber}`
      );
      skippedRulesCount++;
      continue;
    }

    // Check if this rule already exists
    const existingRule = await prisma.enzymeCalculationRule.findFirst({
      where: {
        enzymeConfigurationId: enzymeConfig.id,
        grainType: ruleData.grainType || null,
        calculationMethod: ruleData.calculationMethod,
      },
    });

    if (existingRule) {
      console.log(
        `⏭️  Rule already exists for ${enzymeConfig.item.itemName} (${
          ruleData.grainType || "ALL"
        } grains)`
      );
      skippedRulesCount++;
      continue;
    }

    // Create the calculation rule
    await prisma.enzymeCalculationRule.create({
      data: {
        enzymeConfigurationId: enzymeConfig.id,
        grainType: ruleData.grainType,
        calculationMethod: ruleData.calculationMethod,
        multiplier: ruleData.multiplier,
        active: true,
        createdAt: now,
        createdBy: migrationUser,
        updatedAt: now,
      },
    });

    console.log(
      `✅ Created rule for ${enzymeConfig.item.itemName}: ${
        ruleData.calculationMethod
      } | ${ruleData.grainType || "ALL"} | x${ruleData.multiplier}`
    );
    createdRulesCount++;
  }

  console.log("\n=== ENZYME CALCULATION RULES FIX MIGRATION SUMMARY ===");
  console.log(`✅ Created calculation rules: ${createdRulesCount}`);
  console.log(`⏭️  Skipped existing rules: ${skippedRulesCount}`);
  console.log(`📊 Total rules processed: ${calculationRulesData.length}`);
  console.log(
    "🎉 Enzyme calculation rules fix migration completed successfully!"
  );
}

export async function down({ prisma }: MigrationParams): Promise<void> {
  console.log("🔄 Rolling back enzyme calculation rules fix migration...");

  // Delete all calculation rules created by this migration
  const deletedRules = await prisma.enzymeCalculationRule.deleteMany({
    where: {
      createdBy: "enzyme-calculation-rules-fix-migration",
    },
  });

  console.log(`🗑️  Deleted ${deletedRules.count} enzyme calculation rules`);
  console.log("✅ Enzyme calculation rules fix migration rollback completed");
}
