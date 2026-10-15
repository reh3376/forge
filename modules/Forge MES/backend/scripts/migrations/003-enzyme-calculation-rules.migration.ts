import { MigrationParams } from "./umzug.config";
import {
  EnumCalculationMethod,
  EnumGrainType,
  EnumEnzymeCategory,
} from "@prisma/client";

/**
 * Migration to seed enzyme calculation rules based on business logic
 * This creates the calculation rules that determine how enzyme dosing is calculated
 * for different grain types and enzyme categories
 */

interface EnzymeCalculationRuleData {
  enzymeItemNumber: string;
  grainType?: EnumGrainType;
  calculationMethod: EnumCalculationMethod;
  multiplier: number;
  description: string;
}

export async function up({ prisma }: MigrationParams): Promise<void> {
  console.log("🧪 Starting enzyme calculation rules migration...");

  const migrationUser = "enzyme-calculation-rules-migration";
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

  // Define calculation rules based on business logic from the codebase
  const calculationRulesData: EnzymeCalculationRuleData[] = [
    // LIQUIFACTION ENZYMES - Use TOTAL_GRAIN method with grain-specific multipliers

    // Termamyl SC DS - Alpha Amylase
    {
      enzymeItemNumber: "ENZ-UNI01-Enzyme (Termamyl SC DS)",
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.0,
      description: "Standard calculation for all grains",
    },
    {
      enzymeItemNumber: "ENZ-UNI01-Enzyme (Termamyl SC DS)",
      grainType: EnumGrainType.RYE,
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.25, // 25% increase for high rye content (>25%)
      description: "Increased dosing for rye-heavy mash bills",
    },
    {
      enzymeItemNumber: "ENZ-UNI01-Enzyme (Termamyl SC DS)",
      grainType: EnumGrainType.WHEAT,
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.15, // 15% increase for wheat content (>20%)
      description: "Increased dosing for wheat-containing mash bills",
    },

    // Liquozyme PRO HP DI - Pullulanase
    {
      enzymeItemNumber: "ENZ-UNI04-Enzyme (Liquozyme PRO HP DI)",
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.0,
      description: "Standard calculation for all grains",
    },
    {
      enzymeItemNumber: "ENZ-UNI04-Enzyme (Liquozyme PRO HP DI)",
      grainType: EnumGrainType.RYE,
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.25, // 25% increase for high rye content
      description: "Increased dosing for rye-heavy mash bills",
    },
    {
      enzymeItemNumber: "ENZ-UNI04-Enzyme (Liquozyme PRO HP DI)",
      grainType: EnumGrainType.WHEAT,
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.15, // 15% increase for wheat content
      description: "Increased dosing for wheat-containing mash bills",
    },

    // Amylex 6T
    {
      enzymeItemNumber: "ENZ-UNI05-Enzyme (Amylex 6T)",
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.0,
      description: "Standard calculation for all grains",
    },
    {
      enzymeItemNumber: "ENZ-UNI05-Enzyme (Amylex 6T)",
      grainType: EnumGrainType.RYE,
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.25,
      description: "Increased dosing for rye-heavy mash bills",
    },

    // Alphalase THP
    {
      enzymeItemNumber: "ENZ-UNI06-Enzyme (Alphalase THP)",
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.0,
      description: "Standard calculation for all grains",
    },
    {
      enzymeItemNumber: "ENZ-UNI06-Enzyme (Alphalase THP)",
      grainType: EnumGrainType.RYE,
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.25,
      description: "Increased dosing for rye-heavy mash bills",
    },

    // SACCHARIFICATION ENZYMES - Use TOTAL_GRAIN with malt and corn adjustments

    // Saczyme Pro 1.5X - Glucoamylase
    {
      enzymeItemNumber: "ENZ-UNI07-Enzyme (Saczyme Pro 1.5X - Glucoamylase)",
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.0,
      description: "Standard calculation for all grains",
    },
    {
      enzymeItemNumber: "ENZ-UNI07-Enzyme (Saczyme Pro 1.5X - Glucoamylase)",
      grainType: EnumGrainType.MALT,
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 0.85, // 15% reduction for high malt content (>15%)
      description:
        "Reduced dosing for malt-heavy mash bills (malt has natural enzymes)",
    },
    {
      enzymeItemNumber: "ENZ-UNI07-Enzyme (Saczyme Pro 1.5X - Glucoamylase)",
      grainType: EnumGrainType.CORN,
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.2, // 20% increase for high corn content (>70%)
      description: "Increased dosing for corn-heavy mash bills",
    },

    // Saczyme Yield
    {
      enzymeItemNumber: "ENZ-UNI08-Enzyme (Saczyme Yield)",
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.0,
      description: "Standard calculation for all grains",
    },
    {
      enzymeItemNumber: "ENZ-UNI08-Enzyme (Saczyme Yield)",
      grainType: EnumGrainType.MALT,
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 0.85,
      description: "Reduced dosing for malt-heavy mash bills",
    },
    {
      enzymeItemNumber: "ENZ-UNI08-Enzyme (Saczyme Yield)",
      grainType: EnumGrainType.CORN,
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.2,
      description: "Increased dosing for corn-heavy mash bills",
    },

    // Diazyme SSF
    {
      enzymeItemNumber: "ENZ-UNI09-Enzyme (Diazyme SSF)",
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.0,
      description: "Standard calculation for all grains",
    },
    {
      enzymeItemNumber: "ENZ-UNI09-Enzyme (Diazyme SSF)",
      grainType: EnumGrainType.MALT,
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 0.85,
      description: "Reduced dosing for malt-heavy mash bills",
    },
    {
      enzymeItemNumber: "ENZ-UNI09-Enzyme (Diazyme SSF)",
      grainType: EnumGrainType.CORN,
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.2,
      description: "Increased dosing for corn-heavy mash bills",
    },

    // Diazyme SSF2
    {
      enzymeItemNumber: "ENZ-UNI10-Enzyme (Diazyme SSF2)",
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.0,
      description: "Standard calculation for all grains",
    },
    {
      enzymeItemNumber: "ENZ-UNI10-Enzyme (Diazyme SSF2)",
      grainType: EnumGrainType.MALT,
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 0.85,
      description: "Reduced dosing for malt-heavy mash bills",
    },
    {
      enzymeItemNumber: "ENZ-UNI10-Enzyme (Diazyme SSF2)",
      grainType: EnumGrainType.CORN,
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.2,
      description: "Increased dosing for corn-heavy mash bills",
    },

    // VISCOSITY ENZYMES - Use GRAIN_SPECIFIC method for rye/wheat

    // Viscoferm - Beta Glucanase
    {
      enzymeItemNumber: "ENZ-UNI11-Enzyme (Viscoferm - Beta Glucanase)",
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.0,
      description: "Base calculation for all grains",
    },
    {
      enzymeItemNumber: "ENZ-UNI11-Enzyme (Viscoferm - Beta Glucanase)",
      grainType: EnumGrainType.RYE,
      calculationMethod: EnumCalculationMethod.GRAIN_SPECIFIC,
      multiplier: 1.5, // 50% increase for high rye+wheat content (>30%)
      description: "Grain-specific calculation for rye (high viscosity impact)",
    },
    {
      enzymeItemNumber: "ENZ-UNI11-Enzyme (Viscoferm - Beta Glucanase)",
      grainType: EnumGrainType.WHEAT,
      calculationMethod: EnumCalculationMethod.GRAIN_SPECIFIC,
      multiplier: 1.5, // 50% increase for high rye+wheat content
      description:
        "Grain-specific calculation for wheat (high viscosity impact)",
    },

    // Laminex C2K
    {
      enzymeItemNumber: "ENZ-UNI12-Enzyme (Laminex C2K)",
      calculationMethod: EnumCalculationMethod.TOTAL_GRAIN,
      multiplier: 1.0,
      description: "Base calculation for all grains",
    },
    {
      enzymeItemNumber: "ENZ-UNI12-Enzyme (Laminex C2K)",
      grainType: EnumGrainType.RYE,
      calculationMethod: EnumCalculationMethod.GRAIN_SPECIFIC,
      multiplier: 1.5,
      description: "Grain-specific calculation for rye (high viscosity impact)",
    },
    {
      enzymeItemNumber: "ENZ-UNI12-Enzyme (Laminex C2K)",
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

  console.log("\n=== ENZYME CALCULATION RULES MIGRATION SUMMARY ===");
  console.log(`✅ Created calculation rules: ${createdRulesCount}`);
  console.log(`⏭️  Skipped existing rules: ${skippedRulesCount}`);
  console.log(`📊 Total rules processed: ${calculationRulesData.length}`);
  console.log("🎉 Enzyme calculation rules migration completed successfully!");
}

export async function down({ prisma }: MigrationParams): Promise<void> {
  console.log("🔄 Rolling back enzyme calculation rules migration...");

  // Delete all calculation rules created by this migration
  const deletedRules = await prisma.enzymeCalculationRule.deleteMany({
    where: {
      createdBy: "enzyme-calculation-rules-migration",
    },
  });

  console.log(`🗑️  Deleted ${deletedRules.count} enzyme calculation rules`);
  console.log("✅ Enzyme calculation rules migration rollback completed");
}
