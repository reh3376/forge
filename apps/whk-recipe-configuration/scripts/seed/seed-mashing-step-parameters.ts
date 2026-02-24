/**
 * Seed Mashing Step Parameter Definitions
 *
 * This script seeds parameter definitions for each mashing step type.
 * Defines what parameters operators should record for each step.
 *
 * Run with: npx ts-node scripts/seed/seed-mashing-step-parameters.ts
 */

import {
  PrismaClient,
  EnumMashingProtocolStepStepType,
  EnumMashingParameterType,
} from "@prisma/client";

const prisma = new PrismaClient();

interface ParameterDefinition {
  stepType: EnumMashingProtocolStepStepType;
  parameterName: string;
  displayName: string;
  parameterType: EnumMashingParameterType;
  unit?: string;
  isRequired: boolean;
  defaultValue?: string;
  validationMin?: number;
  validationMax?: number;
  deviationThreshold?: number;
  displayOrder: number;
  category: string;
  description?: string;
  enumValues?: string[];
}

const PARAMETER_DEFINITIONS: ParameterDefinition[] = [
  // ===================================
  // Hold Step Parameters
  // ===================================
  {
    stepType: EnumMashingProtocolStepStepType.Hold,
    parameterName: "targetTemperature",
    displayName: "Target Temperature",
    parameterType: EnumMashingParameterType.Float,
    unit: "°F",
    isRequired: true,
    deviationThreshold: 5, // 5% deviation threshold
    displayOrder: 1,
    category: "Temperature",
    description: "Target temperature for the hold step",
    validationMin: 100,
    validationMax: 220,
  },
  {
    stepType: EnumMashingProtocolStepStepType.Hold,
    parameterName: "holdDuration",
    displayName: "Hold Duration",
    parameterType: EnumMashingParameterType.Int,
    unit: "min",
    isRequired: true,
    deviationThreshold: 10, // 10% deviation threshold
    displayOrder: 2,
    category: "Timing",
    description: "Duration to hold at target temperature",
    validationMin: 1,
    validationMax: 180,
  },
  {
    stepType: EnumMashingProtocolStepStepType.Hold,
    parameterName: "holdType",
    displayName: "Hold Type",
    parameterType: EnumMashingParameterType.Enum,
    isRequired: false,
    displayOrder: 3,
    category: "Control",
    description: "Type of hold action: Heat, Cool, or Hold",
    enumValues: ["Heat", "Cool", "Hold"],
  },

  // ===================================
  // GrainAdd Step Parameters (consolidated for ALL grain types)
  // ===================================
  {
    stepType: EnumMashingProtocolStepStepType.GrainAdd,
    parameterName: "grainQuantity",
    displayName: "Grain Quantity",
    parameterType: EnumMashingParameterType.Float,
    unit: "lbs",
    isRequired: true,
    deviationThreshold: 5,
    displayOrder: 1,
    category: "Material",
    description:
      "Quantity of grain to add (specific grain type derived from linked BOM item)",
    validationMin: 0,
    validationMax: 30000,
  },
  {
    stepType: EnumMashingProtocolStepStepType.GrainAdd,
    parameterName: "addRate",
    displayName: "Add Rate",
    parameterType: EnumMashingParameterType.Float,
    unit: "lbs/min",
    isRequired: false,
    displayOrder: 2,
    category: "Material",
    description: "Rate at which grain is added",
    validationMin: 0,
    validationMax: 1000,
  },
  {
    stepType: EnumMashingProtocolStepStepType.GrainAdd,
    parameterName: "temperatureAtAddition",
    displayName: "Temperature at Addition",
    parameterType: EnumMashingParameterType.Float,
    unit: "°F",
    isRequired: false,
    deviationThreshold: 5,
    displayOrder: 3,
    category: "Temperature",
    description: "Mash temperature when grain is added",
    validationMin: 100,
    validationMax: 220,
  },

  // ===================================
  // Corn Step Parameters (LEGACY - kept for backward compatibility)
  // ===================================
  {
    stepType: EnumMashingProtocolStepStepType.Corn,
    parameterName: "grainQuantity",
    displayName: "Grain Quantity",
    parameterType: EnumMashingParameterType.Float,
    unit: "lbs",
    isRequired: true,
    deviationThreshold: 5,
    displayOrder: 1,
    category: "Material",
    description: "Quantity of corn grain to add",
    validationMin: 0,
    validationMax: 30000,
  },
  {
    stepType: EnumMashingProtocolStepStepType.Corn,
    parameterName: "addRate",
    displayName: "Add Rate",
    parameterType: EnumMashingParameterType.Float,
    unit: "lbs/min",
    isRequired: false,
    displayOrder: 2,
    category: "Material",
    description: "Rate at which grain is added",
    validationMin: 0,
    validationMax: 1000,
  },
  {
    stepType: EnumMashingProtocolStepStepType.Corn,
    parameterName: "temperatureAtAddition",
    displayName: "Temperature at Addition",
    parameterType: EnumMashingParameterType.Float,
    unit: "°F",
    isRequired: false,
    deviationThreshold: 5,
    displayOrder: 3,
    category: "Temperature",
    description: "Mash temperature when grain is added",
    validationMin: 100,
    validationMax: 220,
  },

  // ===================================
  // Wheat Step Parameters
  // ===================================
  {
    stepType: EnumMashingProtocolStepStepType.Wheat,
    parameterName: "grainQuantity",
    displayName: "Grain Quantity",
    parameterType: EnumMashingParameterType.Float,
    unit: "lbs",
    isRequired: true,
    deviationThreshold: 5,
    displayOrder: 1,
    category: "Material",
    description: "Quantity of wheat grain to add",
    validationMin: 0,
    validationMax: 10000,
  },
  {
    stepType: EnumMashingProtocolStepStepType.Wheat,
    parameterName: "addRate",
    displayName: "Add Rate",
    parameterType: EnumMashingParameterType.Float,
    unit: "lbs/min",
    isRequired: false,
    displayOrder: 2,
    category: "Material",
    description: "Rate at which grain is added",
    validationMin: 0,
    validationMax: 1000,
  },
  {
    stepType: EnumMashingProtocolStepStepType.Wheat,
    parameterName: "temperatureAtAddition",
    displayName: "Temperature at Addition",
    parameterType: EnumMashingParameterType.Float,
    unit: "°F",
    isRequired: false,
    deviationThreshold: 5,
    displayOrder: 3,
    category: "Temperature",
    description: "Mash temperature when grain is added",
    validationMin: 100,
    validationMax: 220,
  },

  // ===================================
  // Rye Step Parameters
  // ===================================
  {
    stepType: EnumMashingProtocolStepStepType.Rye,
    parameterName: "grainQuantity",
    displayName: "Grain Quantity",
    parameterType: EnumMashingParameterType.Float,
    unit: "lbs",
    isRequired: true,
    deviationThreshold: 5,
    displayOrder: 1,
    category: "Material",
    description: "Quantity of rye grain to add",
    validationMin: 0,
    validationMax: 10000,
  },
  {
    stepType: EnumMashingProtocolStepStepType.Rye,
    parameterName: "addRate",
    displayName: "Add Rate",
    parameterType: EnumMashingParameterType.Float,
    unit: "lbs/min",
    isRequired: false,
    displayOrder: 2,
    category: "Material",
    description: "Rate at which grain is added",
    validationMin: 0,
    validationMax: 1000,
  },
  {
    stepType: EnumMashingProtocolStepStepType.Rye,
    parameterName: "temperatureAtAddition",
    displayName: "Temperature at Addition",
    parameterType: EnumMashingParameterType.Float,
    unit: "°F",
    isRequired: false,
    deviationThreshold: 5,
    displayOrder: 3,
    category: "Temperature",
    description: "Mash temperature when grain is added",
    validationMin: 100,
    validationMax: 220,
  },

  // ===================================
  // Malt Step Parameters
  // ===================================
  {
    stepType: EnumMashingProtocolStepStepType.Malt,
    parameterName: "grainQuantity",
    displayName: "Grain Quantity",
    parameterType: EnumMashingParameterType.Float,
    unit: "lbs",
    isRequired: true,
    deviationThreshold: 5,
    displayOrder: 1,
    category: "Material",
    description: "Quantity of malt to add",
    validationMin: 0,
    validationMax: 5000,
  },
  {
    stepType: EnumMashingProtocolStepStepType.Malt,
    parameterName: "addRate",
    displayName: "Add Rate",
    parameterType: EnumMashingParameterType.Float,
    unit: "lbs/min",
    isRequired: false,
    displayOrder: 2,
    category: "Material",
    description: "Rate at which malt is added",
    validationMin: 0,
    validationMax: 500,
  },
  {
    stepType: EnumMashingProtocolStepStepType.Malt,
    parameterName: "temperatureAtAddition",
    displayName: "Temperature at Addition",
    parameterType: EnumMashingParameterType.Float,
    unit: "°F",
    isRequired: false,
    deviationThreshold: 5,
    displayOrder: 3,
    category: "Temperature",
    description: "Mash temperature when malt is added",
    validationMin: 140,
    validationMax: 180,
  },

  // ===================================
  // PreMalt Step Parameters
  // ===================================
  {
    stepType: EnumMashingProtocolStepStepType.PreMalt,
    parameterName: "grainQuantity",
    displayName: "Grain Quantity",
    parameterType: EnumMashingParameterType.Float,
    unit: "lbs",
    isRequired: true,
    deviationThreshold: 5,
    displayOrder: 1,
    category: "Material",
    description: "Quantity of pre-malt to add",
    validationMin: 0,
    validationMax: 2000,
  },
  {
    stepType: EnumMashingProtocolStepStepType.PreMalt,
    parameterName: "temperatureAtAddition",
    displayName: "Temperature at Addition",
    parameterType: EnumMashingParameterType.Float,
    unit: "°F",
    isRequired: false,
    deviationThreshold: 5,
    displayOrder: 2,
    category: "Temperature",
    description: "Mash temperature when pre-malt is added",
    validationMin: 150,
    validationMax: 200,
  },

  // ===================================
  // SpecialtyGrainAdd Step Parameters
  // ===================================
  {
    stepType: EnumMashingProtocolStepStepType.SpecialtyGrainAdd,
    parameterName: "grainQuantity",
    displayName: "Grain Quantity",
    parameterType: EnumMashingParameterType.Float,
    unit: "lbs",
    isRequired: true,
    deviationThreshold: 5,
    displayOrder: 1,
    category: "Material",
    description: "Quantity of specialty grain to add (oats, spelt, etc.)",
    validationMin: 0,
    validationMax: 10000,
  },
  {
    stepType: EnumMashingProtocolStepStepType.SpecialtyGrainAdd,
    parameterName: "grainType",
    displayName: "Grain Type",
    parameterType: EnumMashingParameterType.Text,
    isRequired: false,
    displayOrder: 2,
    category: "Material",
    description: "Type of specialty grain (e.g., Oats, Spelt, Sorghum)",
  },
  {
    stepType: EnumMashingProtocolStepStepType.SpecialtyGrainAdd,
    parameterName: "addRate",
    displayName: "Add Rate",
    parameterType: EnumMashingParameterType.Float,
    unit: "lbs/min",
    isRequired: false,
    displayOrder: 3,
    category: "Material",
    description: "Rate at which grain is added",
    validationMin: 0,
    validationMax: 1000,
  },
  {
    stepType: EnumMashingProtocolStepStepType.SpecialtyGrainAdd,
    parameterName: "temperatureAtAddition",
    displayName: "Temperature at Addition",
    parameterType: EnumMashingParameterType.Float,
    unit: "°F",
    isRequired: false,
    deviationThreshold: 5,
    displayOrder: 4,
    category: "Temperature",
    description: "Mash temperature when specialty grain is added",
    validationMin: 100,
    validationMax: 220,
  },

  // ===================================
  // LiquidAdd Step Parameters
  // ===================================
  {
    stepType: EnumMashingProtocolStepStepType.LiquidAdd,
    parameterName: "volume",
    displayName: "Volume",
    parameterType: EnumMashingParameterType.Float,
    unit: "gal",
    isRequired: true,
    deviationThreshold: 5,
    displayOrder: 1,
    category: "Material",
    description: "Volume of liquid to add (water or backset)",
    validationMin: 0,
    validationMax: 5000,
  },
  {
    stepType: EnumMashingProtocolStepStepType.LiquidAdd,
    parameterName: "flowRate",
    displayName: "Flow Rate",
    parameterType: EnumMashingParameterType.Float,
    unit: "gal/min",
    isRequired: false,
    displayOrder: 2,
    category: "Material",
    description: "Rate at which liquid is added",
    validationMin: 0,
    validationMax: 500,
  },
  {
    stepType: EnumMashingProtocolStepStepType.LiquidAdd,
    parameterName: "temperature",
    displayName: "Liquid Temperature",
    parameterType: EnumMashingParameterType.Float,
    unit: "°F",
    isRequired: false,
    displayOrder: 3,
    category: "Temperature",
    description: "Temperature of the liquid being added",
    validationMin: 40,
    validationMax: 220,
  },

  // ===================================
  // AdditiveAdd Step Parameters
  // ===================================
  {
    stepType: EnumMashingProtocolStepStepType.AdditiveAdd,
    parameterName: "quantity",
    displayName: "Quantity",
    parameterType: EnumMashingParameterType.Float,
    unit: "lbs",
    isRequired: true,
    deviationThreshold: 10,
    displayOrder: 1,
    category: "Material",
    description: "Quantity of additive (enzyme, yeast, nutrient)",
    validationMin: 0,
    validationMax: 500,
  },
  {
    stepType: EnumMashingProtocolStepStepType.AdditiveAdd,
    parameterName: "addRate",
    displayName: "Add Rate",
    parameterType: EnumMashingParameterType.Float,
    unit: "lbs/min",
    isRequired: false,
    displayOrder: 2,
    category: "Material",
    description: "Rate at which additive is introduced",
    validationMin: 0,
    validationMax: 100,
  },
  {
    stepType: EnumMashingProtocolStepStepType.AdditiveAdd,
    parameterName: "temperatureAtAddition",
    displayName: "Temperature at Addition",
    parameterType: EnumMashingParameterType.Float,
    unit: "°F",
    isRequired: false,
    deviationThreshold: 5,
    displayOrder: 3,
    category: "Temperature",
    description:
      "Mash temperature when additive is added (important for enzyme activity)",
    validationMin: 80,
    validationMax: 220,
  },

  // ===================================
  // Prompt Step Parameters
  // ===================================
  {
    stepType: EnumMashingProtocolStepStepType.Prompt,
    parameterName: "acknowledged",
    displayName: "Acknowledged",
    parameterType: EnumMashingParameterType.Boolean,
    isRequired: true,
    displayOrder: 1,
    category: "Confirmation",
    description: "Operator acknowledgment of prompt/instruction",
  },
  {
    stepType: EnumMashingProtocolStepStepType.Prompt,
    parameterName: "operatorNotes",
    displayName: "Operator Notes",
    parameterType: EnumMashingParameterType.Text,
    isRequired: false,
    displayOrder: 2,
    category: "Notes",
    description: "Free-form notes from the operator",
  },
];

async function seedMashingStepParameters() {
  console.log("🌱 Seeding Mashing Step Parameter Definitions...\n");

  let created = 0;
  let skipped = 0;

  for (const def of PARAMETER_DEFINITIONS) {
    // Check if definition already exists (unique on [stepType, parameterName])
    const existing = await prisma.mashingStepParameterDefinition.findFirst({
      where: {
        stepType: def.stepType,
        parameterName: def.parameterName,
      },
    });

    if (existing) {
      console.log(
        `  ⏭️  Skipping "${def.stepType}.${def.parameterName}" — already exists`
      );
      skipped++;
      continue;
    }

    await prisma.mashingStepParameterDefinition.create({
      data: {
        stepType: def.stepType,
        parameterName: def.parameterName,
        displayName: def.displayName,
        parameterType: def.parameterType,
        unit: def.unit,
        isRequired: def.isRequired,
        defaultValue: def.defaultValue,
        validationMin: def.validationMin,
        validationMax: def.validationMax,
        deviationThreshold: def.deviationThreshold,
        displayOrder: def.displayOrder,
        category: def.category,
        description: def.description,
        enumValues: def.enumValues || [],
        createdBy: "system",
      },
    });

    console.log(
      `  ✅ Created "${def.stepType}.${def.parameterName}" (${def.category})`
    );
    created++;
  }

  // Summary by step type
  const byStepType = await prisma.mashingStepParameterDefinition.groupBy({
    by: ["stepType"],
    _count: { id: true },
  });

  console.log("\n📊 Parameters by Step Type:");
  for (const group of byStepType) {
    console.log(`   ${group.stepType}: ${group._count.id} parameters`);
  }

  const total = await prisma.mashingStepParameterDefinition.count();
  console.log(`\n✨ Mashing Step Parameter seeding complete!`);
  console.log(`   Created: ${created}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Total in DB: ${total}`);
}

seedMashingStepParameters()
  .catch((error) => {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
