/**
 * Seed Formula Library with standard BOM calculation formulas
 *
 * Run with: npx ts-node scripts/seed/seed-formula-library.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Standard formulas for BOM calculations
const STANDARD_FORMULAS = [
  // ===============================================
  // MODERN GRAIN CHARACTER FORMULAS (Abbreviation-based)
  // Uses abbreviations: C=Corn, R=Rye, W=Wheat, M=Malt, Y=Barley, S=Sorghum, B=Buckwheat, O=Oats, Z=Other
  // Supports variety codes like C1, C2, R1 for multiple varieties
  // ===============================================
  {
    name: "Grain from Percentage (Universal)",
    description:
      "Universal formula for calculating grain quantity from any grain character percentage. Works with abbreviations like C, R, W, M, etc.",
    category: "Grain",
    expression: "grainLoad * (C / 100)",
    tags: ["grain", "percentage", "universal", "corn"],
    documentation:
      "Universal grain calculation formula.\n\nVariables:\n- grainLoad: Total grain weight in lbs\n- C/R/W/M/Y/S/B/O/Z: Grain character percentage (0-100)\n\nExample for corn: grainLoad * (C / 100)\nExample for rye: grainLoad * (R / 100)\n\nGrain Character Abbreviations:\n- C = Corn\n- R = Rye\n- W = Wheat\n- M = Malt (Malted Barley)\n- Y = Barley (unmalted)\n- S = Sorghum\n- B = Buckwheat\n- O = Oats\n- Z = Other\n\nVariety codes (C1, C2, R1) are supported for multiple varieties.\n\nReturns: Grain weight in lbs",
    requiredVariables: ["grainLoad", "C"],
    exampleInputs: { grainLoad: 3000, C: 70, R: 21, W: 0, M: 9 },
    expectedOutput: 2100,
  },
  {
    name: "Rye from Percentage (R)",
    description:
      "Calculates rye quantity using R (Rye) abbreviation. Example: 3000 lbs * 21% = 630 lbs rye",
    category: "Grain",
    expression: "grainLoad * (R / 100)",
    tags: ["grain", "rye", "percentage", "R"],
    documentation:
      "Variables:\n- grainLoad: Total grain weight in lbs\n- R: Rye percentage from grain character (0-100)\n\nReturns: Rye weight in lbs",
    requiredVariables: ["grainLoad", "R"],
    exampleInputs: { grainLoad: 3000, C: 70, R: 21, W: 0, M: 9 },
    expectedOutput: 630,
  },
  {
    name: "Malt from Percentage (M)",
    description:
      "Calculates malted barley quantity using M (Malt) abbreviation. Example: 3000 lbs * 9% = 270 lbs malt",
    category: "Grain",
    expression: "grainLoad * (M / 100)",
    tags: ["grain", "malt", "barley", "percentage", "M"],
    documentation:
      "Variables:\n- grainLoad: Total grain weight in lbs\n- M: Malted barley percentage from grain character (0-100)\n\nReturns: Malt weight in lbs",
    requiredVariables: ["grainLoad", "M"],
    exampleInputs: { grainLoad: 3000, C: 70, R: 21, W: 0, M: 9 },
    expectedOutput: 270,
  },
  {
    name: "Wheat from Percentage (W)",
    description: "Calculates wheat quantity using W (Wheat) abbreviation",
    category: "Grain",
    expression: "grainLoad * (W / 100)",
    tags: ["grain", "wheat", "percentage", "W"],
    documentation:
      "Variables:\n- grainLoad: Total grain weight in lbs\n- W: Wheat percentage from grain character (0-100)\n\nReturns: Wheat weight in lbs",
    requiredVariables: ["grainLoad", "W"],
    exampleInputs: { grainLoad: 3000, C: 70, R: 21, W: 0, M: 9 },
    expectedOutput: 0,
  },

  // ===============================================
  // LEGACY GRAIN FORMULAS (for backward compatibility)
  // Uses legacy variable names: corn, rye, wheat, malt
  // ===============================================
  {
    name: "Corn Quantity from Grain Load (Legacy)",
    description:
      "[LEGACY] Calculates corn quantity using legacy variable name. Example: 3000 lbs * 70% = 2100 lbs corn",
    category: "Grain (Legacy)",
    expression: "grainLoad * (corn / 100)",
    tags: ["grain", "corn", "percentage", "legacy"],
    documentation:
      '[LEGACY - Use "Grain from Percentage (Universal)" for new formulas]\n\nVariables:\n- grainLoad: Total grain weight in lbs\n- corn: Corn percentage from mash bill (0-100)\n\nReturns: Corn weight in lbs',
    requiredVariables: ["grainLoad", "corn"],
    exampleInputs: { grainLoad: 3000, corn: 70, rye: 21, wheat: 0, malt: 9 },
    expectedOutput: 2100,
  },
  {
    name: "Rye Quantity from Grain Load (Legacy)",
    description:
      "[LEGACY] Calculates rye quantity using legacy variable name. Example: 3000 lbs * 21% = 630 lbs rye",
    category: "Grain (Legacy)",
    expression: "grainLoad * (rye / 100)",
    tags: ["grain", "rye", "percentage", "legacy"],
    documentation:
      "[LEGACY - Use abbreviation-based formulas for new recipes]\n\nVariables:\n- grainLoad: Total grain weight in lbs\n- rye: Rye percentage from mash bill (0-100)\n\nReturns: Rye weight in lbs",
    requiredVariables: ["grainLoad", "rye"],
    exampleInputs: { grainLoad: 3000, corn: 70, rye: 21, wheat: 0, malt: 9 },
    expectedOutput: 630,
  },
  {
    name: "Wheat Quantity from Grain Load (Legacy)",
    description:
      "[LEGACY] Calculates wheat quantity using legacy variable name",
    category: "Grain (Legacy)",
    expression: "grainLoad * (wheat / 100)",
    tags: ["grain", "wheat", "percentage", "legacy"],
    documentation:
      "[LEGACY - Use abbreviation-based formulas for new recipes]\n\nVariables:\n- grainLoad: Total grain weight in lbs\n- wheat: Wheat percentage from mash bill (0-100)\n\nReturns: Wheat weight in lbs",
    requiredVariables: ["grainLoad", "wheat"],
    exampleInputs: { grainLoad: 3000, corn: 70, rye: 21, wheat: 0, malt: 9 },
    expectedOutput: 0,
  },
  {
    name: "Malt Quantity from Grain Load (Legacy)",
    description:
      "[LEGACY] Calculates malted barley quantity using legacy variable name. Example: 3000 lbs * 9% = 270 lbs malt",
    category: "Grain (Legacy)",
    expression: "grainLoad * (malt / 100)",
    tags: ["grain", "malt", "barley", "percentage", "legacy"],
    documentation:
      "[LEGACY - Use abbreviation-based formulas for new recipes]\n\nVariables:\n- grainLoad: Total grain weight in lbs\n- malt: Malted barley percentage from mash bill (0-100)\n\nReturns: Malt weight in lbs",
    requiredVariables: ["grainLoad", "malt"],
    exampleInputs: { grainLoad: 3000, corn: 70, rye: 21, wheat: 0, malt: 9 },
    expectedOutput: 270,
  },

  // Water calculations
  {
    name: "Water from Bushels",
    description:
      "Calculates water volume using bushels and gallons per bushel ratio. Standard: 4.5 gal/bushel",
    category: "Water",
    expression: "BUSHELS(grainLoad) * gallonsPerBushel",
    tags: ["water", "bushels", "volume"],
    documentation:
      "Converts grain load to bushels (÷56 lbs/bushel) then multiplies by gallons per bushel.\n\nVariables:\n- grainLoad: Total grain weight in lbs\n- gallonsPerBushel: Water ratio (default 4.5)\n\nReturns: Water volume in gallons",
    requiredVariables: ["grainLoad"],
    optionalVariables: ["gallonsPerBushel"],
    exampleInputs: { grainLoad: 3000, gallonsPerBushel: 4.5 },
    expectedOutput: 241.07,
  },
  {
    name: "Backset from Water Load",
    description:
      "Calculates backset quantity as a percentage of total water. Standard: 25%",
    category: "Water",
    expression: "waterLoad * 0.25",
    tags: ["water", "backset", "percentage"],
    documentation:
      "Calculates backset volume as 25% of total water load.\n\nVariables:\n- waterLoad: Total water volume in gallons\n\nReturns: Backset volume in gallons",
    requiredVariables: ["waterLoad"],
    exampleInputs: { waterLoad: 240 },
    expectedOutput: 60,
  },
  {
    name: "Fresh Water (Remaining)",
    description:
      "Calculates fresh water as total water minus backset (75% of water load)",
    category: "Water",
    expression: "waterLoad * 0.75",
    tags: ["water", "fresh", "percentage"],
    documentation:
      "Calculates fresh water volume as 75% of total water load (remaining after backset).\n\nVariables:\n- waterLoad: Total water volume in gallons\n\nReturns: Fresh water volume in gallons",
    requiredVariables: ["waterLoad"],
    exampleInputs: { waterLoad: 240 },
    expectedOutput: 180,
  },

  // Utility calculations
  {
    name: "Grain Load to Bushels",
    description: "Converts grain weight in lbs to bushels (56 lbs per bushel)",
    category: "Custom",
    expression: "BUSHELS(grainLoad)",
    tags: ["conversion", "bushels", "utility"],
    documentation:
      "Standard conversion: 1 bushel = 56 lbs\n\nVariables:\n- grainLoad: Total grain weight in lbs\n\nReturns: Grain quantity in bushels",
    requiredVariables: ["grainLoad"],
    exampleInputs: { grainLoad: 3000 },
    expectedOutput: 53.57,
  },
  {
    name: "Grain Load to Metric Tons",
    description: "Converts grain weight in lbs to metric tons",
    category: "Custom",
    expression: "METRIC_TONS(grainLoad)",
    tags: ["conversion", "metric", "utility"],
    documentation:
      "Standard conversion: 1 metric ton = 2205 lbs\n\nVariables:\n- grainLoad: Total grain weight in lbs\n\nReturns: Grain quantity in metric tons",
    requiredVariables: ["grainLoad"],
    exampleInputs: { grainLoad: 3000 },
    expectedOutput: 1.36,
  },

  // ===============================================
  // YIELD ESTIMATION FORMULAS
  // Core calculation chain for production yield
  // ===============================================
  {
    name: "Grain Units per Fermenter",
    description:
      "Calculates bushels of grain per fermenter from cook weight and cooks per fermenter",
    category: "Yield",
    expression: "grainPerCook * cooksPerFerm / lbsPerBushel",
    tags: ["yield", "grain", "fermenter", "bushels"],
    documentation:
      "Converts total grain per fermenter to bushels.\n\nVariables:\n- grainPerCook: Grain weight per cook (lbs)\n- cooksPerFerm: Number of cooks per fermenter\n- lbsPerBushel: Pounds per bushel (56)\n\nExample: 23000 * 3 / 56 = 1232.14 bushels",
    requiredVariables: ["grainPerCook", "cooksPerFerm", "lbsPerBushel"],
    exampleInputs: { grainPerCook: 23000, cooksPerFerm: 3, lbsPerBushel: 56 },
    expectedOutput: 1232.14,
  },
  {
    name: "Proof Gallons per Barrel",
    description:
      "Calculates proof gallons per barrel from entry proof and barrel fill",
    category: "Yield",
    expression: "(entryProof / 100) * avgBarrelFill",
    tags: ["yield", "proof-gallons", "barrel"],
    documentation:
      "PG per barrel = proof factor * average barrel fill.\n\nVariables:\n- entryProof: Entry proof (e.g., 125)\n- avgBarrelFill: Average barrel fill in gallons (e.g., 53.07)\n\nExample: (125/100) * 53.07 = 66.34 PG/BBL",
    requiredVariables: ["entryProof", "avgBarrelFill"],
    exampleInputs: { entryProof: 125, avgBarrelFill: 53.07 },
    expectedOutput: 66.34,
  },
  {
    name: "Proof Gallons per Fermenter",
    description:
      "Calculates total proof gallons per fermenter from grain units and yield rate",
    category: "Yield",
    expression: "grainUnitsPerFerm * yieldRate",
    tags: ["yield", "proof-gallons", "fermenter"],
    documentation:
      "PG per fermenter = bushels per fermenter * yield rate.\n\nVariables:\n- grainUnitsPerFerm: Bushels of grain per fermenter\n- yieldRate: Proof gallons per bushel (PG/GU)\n\nExample: 1232.14 * 5.2 = 6407.14 PG/Ferm",
    requiredVariables: ["grainUnitsPerFerm", "yieldRate"],
    exampleInputs: { grainUnitsPerFerm: 1232.14, yieldRate: 5.2 },
    expectedOutput: 6407.13,
  },
  {
    name: "Barrels per Fermenter",
    description:
      "Calculates barrels per fermenter from PG per fermenter and PG per barrel",
    category: "Yield",
    expression: "pgPerFerm / pgPerBarrel",
    tags: ["yield", "barrels", "fermenter"],
    documentation:
      "BBL per fermenter = PG per fermenter / PG per barrel.\n\nVariables:\n- pgPerFerm: Proof gallons per fermenter\n- pgPerBarrel: Proof gallons per barrel\n\nExample: 6407.14 / 66.34 = 96.58 BBL/Ferm",
    requiredVariables: ["pgPerFerm", "pgPerBarrel"],
    exampleInputs: { pgPerFerm: 6407.14, pgPerBarrel: 66.34 },
    expectedOutput: 96.58,
  },
  {
    name: "Total Fermenters Required",
    description:
      "Calculates total fermenters needed from total barrels and barrels per fermenter",
    category: "Yield",
    expression: "CEIL(totalBarrels / bblPerFerm)",
    tags: ["yield", "fermenters", "total"],
    documentation:
      "Total fermenters = ceil(total barrels / barrels per fermenter).\n\nVariables:\n- totalBarrels: Total barrels ordered\n- bblPerFerm: Barrels per fermenter\n\nExample: CEIL(500 / 96.58) = 6",
    requiredVariables: ["totalBarrels", "bblPerFerm"],
    exampleInputs: { totalBarrels: 500, bblPerFerm: 96.58 },
    expectedOutput: 6,
  },
  {
    name: "Total Grain Weight",
    description:
      "Calculates total grain weight from total cooks and grain per cook",
    category: "Yield",
    expression: "totalCooks * grainPerCook",
    tags: ["yield", "grain", "total"],
    documentation:
      "Total grain = total cooks * grain per cook.\n\nVariables:\n- totalCooks: Total number of cooks\n- grainPerCook: Grain weight per cook (lbs)\n\nExample: 18 * 23000 = 414000 lbs",
    requiredVariables: ["totalCooks", "grainPerCook"],
    exampleInputs: { totalCooks: 18, grainPerCook: 23000 },
    expectedOutput: 414000,
  },
];

async function seedFormulaLibrary() {
  console.log("🌱 Seeding Formula Library...\n");

  let created = 0;
  let skipped = 0;

  for (const formula of STANDARD_FORMULAS) {
    // Check if formula already exists
    const existing = await prisma.formulaLibrary.findFirst({
      where: { name: formula.name },
    });

    if (existing) {
      console.log(`⏭️  Skipping "${formula.name}" (already exists)`);
      skipped++;
      continue;
    }

    // Create the formula
    const created_formula = await prisma.formulaLibrary.create({
      data: {
        name: formula.name,
        description: formula.description,
        category: formula.category,
        expression: formula.expression,
        tags: formula.tags,
        documentation: formula.documentation,
        requiredVariables: formula.requiredVariables,
        optionalVariables: formula.optionalVariables || [],
        exampleInputs: formula.exampleInputs,
        expectedOutputs: formula.expectedOutput ? [formula.expectedOutput] : [],
        version: 1,
        isActive: true,
        createdBy: "system",
      },
    });

    console.log(`✅ Created "${formula.name}" (${created_formula.id})`);
    created++;

    // Add a test case for formulas with expected output
    if (formula.expectedOutput) {
      await prisma.formulaTestCase.create({
        data: {
          formula: {
            connect: { id: created_formula.id },
          },
          name: `Default test for ${formula.name}`,
          inputs: formula.exampleInputs,
          expectedOutput: formula.expectedOutput,
          tolerance: 0.01,
          createdBy: "system",
        },
      });
      console.log(`   📋 Added test case`);
    }
  }

  console.log(`\n✨ Seeding complete!`);
  console.log(`   Created: ${created}`);
  console.log(`   Skipped: ${skipped}`);
}

seedFormulaLibrary()
  .catch((error) => {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
