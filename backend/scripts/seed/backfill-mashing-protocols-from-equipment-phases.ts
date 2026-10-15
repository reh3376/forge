#!/usr/bin/env ts-node

/**
 * Backfill Mashing Protocols from EquipmentPhase Data
 *
 * This script creates MashingProtocol and MashingProtocolStep records based on
 * existing EquipmentPhase data in the Operation structure. It links recipes to
 * the generated mashing protocols.
 *
 * Usage:
 *   npm run migrate:backfill-mashing-protocols
 *   or
 *   DB_URL=<connection-string> npx ts-node scripts/seed/backfill-mashing-protocols-from-equipment-phases.ts
 */

import {
  PrismaClient,
  EnumMashingProtocolStepHoldType,
  EnumMashingProtocolStepStepType,
  EnumEquipmentPhaseName,
} from "@prisma/client";

const prisma = new PrismaClient();

// Configuration: Use consolidated GrainAdd step type (recommended) vs legacy individual grain types
// Set to true to use the new GrainAdd step type, false for legacy Corn/Wheat/Rye/Malt types
const USE_CONSOLIDATED_GRAIN_ADD = true;

// Mapping from EquipmentPhase names to MashingProtocolStep types
const PHASE_TO_STEP_TYPE_MAP: Record<string, EnumMashingProtocolStepStepType> =
  {
    LiquidAdd: EnumMashingProtocolStepStepType.LiquidAdd,
    GrainAdd: EnumMashingProtocolStepStepType.GrainAdd, // Consolidated grain step - grain type derived from linked BOM item
    AdditiveAdd: EnumMashingProtocolStepStepType.AdditiveAdd,
    Hold: EnumMashingProtocolStepStepType.Hold,
    Prompt: EnumMashingProtocolStepStepType.Prompt,
  };

// Determine hold type from phase.stepType field
function getHoldType(
  stepType?: string | null
): EnumMashingProtocolStepHoldType {
  if (stepType === "Heat") {
    return EnumMashingProtocolStepHoldType.Heat;
  } else if (stepType === "Cool") {
    return EnumMashingProtocolStepHoldType.Cool;
  }
  return EnumMashingProtocolStepHoldType.Hold;
}

// Generate a user-friendly protocol name from recipe
function generateProtocolName(recipeName: string): string {
  return `${recipeName}-Mashing-Protocol`;
}

async function backfillMashingProtocols() {
  console.log(
    "🔄 Starting Mashing Protocols Backfill from EquipmentPhase Data...\n"
  );

  // Get recipes without mashing protocols (simple query first)
  const recipes = await prisma.recipe.findMany({
    where: {
      active: true,
      mashingProtocolId: null, // Only recipes without existing mashing protocols
    },
    select: {
      id: true,
      Recipe: true,
      revision: true,
    },
  });

  console.log(`📊 Found ${recipes.length} recipes without mashing protocols\n`);

  let protocolsCreated = 0;
  let stepsCreated = 0;
  let recipesLinked = 0;
  let skippedNoPhases = 0;

  for (const recipe of recipes) {
    console.log(`\n🔄 Processing recipe: ${recipe.Recipe} (${recipe.id})`);

    // Fetch ALL unit procedures for this recipe and find the first one with Cook operations
    // This is necessary because findFirst doesn't guarantee finding a UP WITH Cook operations,
    // it just finds the first UP and then filters operations (which might result in empty array)
    const unitProcedures = await prisma.unitProcedure.findMany({
      where: {
        recipe: {
          some: {
            id: recipe.id,
          },
        },
      },
      orderBy: [{ revision: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        revision: true,
        operations: {
          where: {
            name: "Cook", // Only get mashing operations
          },
          select: {
            id: true,
          },
          take: 1, // Only take the first Cook operation to avoid duplicates
          orderBy: [{ createdAt: "desc" }],
        },
      },
    });

    // Find the first unit procedure that actually has Cook operations
    const unitProcedure = unitProcedures.find((up) => up.operations.length > 0);

    if (!unitProcedure) {
      console.log(
        `   ⏭️  Skipped: No unit procedure with Cook operations found`
      );
      skippedNoPhases++;
      continue;
    }

    console.log(
      `   Using UnitProcedure: ${unitProcedure.name} (rev: ${unitProcedure.revision})`
    );

    // Get the operation ID
    const operationIds = unitProcedure.operations.map((op) => op.id);

    // Fetch mashing-related equipment phases for these operations
    // Note: Using actual phase names from the database (AdditiveAdd, GrainAdd, Hold, LiquidAdd, Prompt)
    const mashingPhases = await prisma.equipmentPhase.findMany({
      where: {
        operationId: { in: operationIds },
        name: {
          in: [
            "LiquidAdd",
            "GrainAdd",
            "AdditiveAdd",
            "Hold",
            "Prompt",
          ] as EnumEquipmentPhaseName[],
        },
        active: true,
      },
      include: {
        phaseParameters: {
          // NOTE: Do not filter by active: true - many parameters are marked inactive
          // but still contain the correct setpoint values
          select: {
            name: true,
            staticName: true,
            description: true,
            setpointNumericalValue: true,
            setpointBooleanValue: true,
            setpointType: true,
          },
        },
        bomItem: {
          select: {
            id: true,
            itemId: true,
            quantity: true,
            item: {
              select: {
                itemNumber: true,
                itemName: true,
                itemGroup: true,
              },
            },
          },
        },
      },
      orderBy: {
        operationSequenceIndex: "asc",
      },
    });

    if (mashingPhases.length === 0) {
      console.log(`   ⏭️  Skipped: No mashing-related equipment phases found`);
      skippedNoPhases++;
      continue;
    }

    console.log(
      `   Found ${mashingPhases.length} mashing-related equipment phases`
    );

    // Fetch recipe BOM items for mashing operation
    // Use two-step approach: first find RecipeBom, then query RecipeBomItems directly
    const recipeBom = await prisma.recipeBom.findFirst({
      where: {
        recipe: {
          some: {
            id: recipe.id,
          },
        },
      },
      select: {
        id: true,
      },
    });

    const mashingBomItems = recipeBom
      ? await prisma.recipeBomItem.findMany({
          where: {
            recipeBomsId: recipeBom.id,
            itemId: { not: null }, // Exclude BOM items without valid itemId
            // Include Mashing01 operation items OR water items (any operation)
            OR: [
              { operation: "Mashing01" },
              {
                item: {
                  OR: [
                    { itemName: { contains: "Water", mode: "insensitive" } },
                    { itemGroup: { contains: "Water", mode: "insensitive" } },
                  ],
                },
              },
            ],
          },
          include: {
            item: {
              select: {
                id: true,
                itemNumber: true,
                itemName: true,
                itemGroup: true,
              },
            },
          },
        })
      : [];

    console.log(`   Found ${mashingBomItems.length} mashing BOM items`);

    try {
      // Create mashing protocol for this recipe
      const protocolName = generateProtocolName(recipe.Recipe);

      const mashingProtocol = await prisma.mashingProtocol.create({
        data: {
          name: protocolName,
          revision: recipe.revision?.toString() || "1",
          master: false,
          isTemplate: false,
          running: false,
          createdBy: "backfill-script",
          updatedBy: "backfill-script",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      console.log(`   ✅ Created mashing protocol: ${protocolName}`);
      protocolsCreated++;

      // Create mashing protocol steps from equipment phases
      let stepIndex = 1;
      for (const phase of mashingPhases) {
        // Extract temperature and time parameters
        let temperatureSetpoint: number | undefined;
        let stepTime: number | undefined;
        let agitatorEnabled = false;
        let agitatorSpdSp: number | undefined;

        // Parse phase parameters
        for (const param of phase.phaseParameters) {
          const paramName = param.name;
          const paramNameLower = paramName.toLowerCase();
          const value = param.setpointNumericalValue;
          const staticName = param.staticName;

          // Get temperature from any Temperature staticName (including "Heat" or "Cool" named params)
          if (
            staticName === "Temperature" &&
            temperatureSetpoint === undefined
          ) {
            temperatureSetpoint = value ?? undefined;
          } else if (staticName === "Time" && stepTime === undefined) {
            stepTime = value != null ? Math.round(value) : undefined;
          } else if (
            staticName === "Speed" &&
            paramNameLower.includes("agitator")
          ) {
            agitatorSpdSp = value ?? undefined;
            agitatorEnabled = true;
          }
          // Generic time check (if not caught by staticName)
          else if (paramNameLower.includes("time") && stepTime === undefined) {
            stepTime = value != null ? Math.round(value) : undefined;
          }
          // Agitator speed (if not caught by staticName)
          else if (
            paramNameLower.includes("agitator") &&
            paramNameLower.includes("speed")
          ) {
            agitatorSpdSp = value ?? undefined;
            agitatorEnabled = true;
          }
        }

        // Determine hold type from phase.stepType field (Heat/Cool/Hold)
        const holdType = getHoldType(phase.stepType);

        // Generate prompt message
        const promptMessage =
          phase.message || phase.description || `${phase.name} step`;

        // Determine step type based on phase name and linked BOM items
        let stepType: EnumMashingProtocolStepStepType;
        let stepBomItems: typeof mashingBomItems = [];

        // Find RecipeBomItems that match the equipment phase BOM items
        // Match by itemId first, then by relative quantity ranking for duplicates
        if (phase.bomItem && phase.bomItem.length > 0) {
          stepBomItems = [];

          // Group equipment phase BOM items by itemId
          const phaseBomByItemId = new Map<string, typeof phase.bomItem>();
          for (const phaseBomItem of phase.bomItem) {
            if (!phaseBomItem.itemId) continue;
            const existing = phaseBomByItemId.get(phaseBomItem.itemId) || [];
            existing.push(phaseBomItem);
            phaseBomByItemId.set(phaseBomItem.itemId, existing);
          }

          // Group RecipeBomItems by itemId
          const recipeBomByItemId = new Map<string, typeof mashingBomItems>();
          for (const recipeBomItem of mashingBomItems) {
            if (!recipeBomItem.item) continue;
            const existing = recipeBomByItemId.get(recipeBomItem.item.id) || [];
            existing.push(recipeBomItem);
            recipeBomByItemId.set(recipeBomItem.item.id, existing);
          }

          // For each equipment phase BOM item, find matching RecipeBomItem
          for (const phaseBomItem of phase.bomItem) {
            if (!phaseBomItem.itemId) continue;

            const phaseItemsForId =
              phaseBomByItemId.get(phaseBomItem.itemId) || [];
            const recipeItemsForId =
              recipeBomByItemId.get(phaseBomItem.itemId) || [];

            if (recipeItemsForId.length === 0) continue;

            let matchingBomItem: (typeof mashingBomItems)[0] | undefined;

            if (phaseItemsForId.length === 1 && recipeItemsForId.length === 1) {
              // Simple case: only one of each, direct match
              matchingBomItem = recipeItemsForId[0];
            } else if (
              phaseItemsForId.length > 1 &&
              recipeItemsForId.length > 1
            ) {
              // Complex case: multiple items with same itemId
              // Match by relative quantity ranking

              // Sort both lists by quantity descending
              const sortedPhaseItems = [...phaseItemsForId].sort(
                (a, b) => (b.quantity || 0) - (a.quantity || 0)
              );
              const sortedRecipeItems = [...recipeItemsForId].sort(
                (a, b) => (b.quantity || 0) - (a.quantity || 0)
              );

              // Find the index of current phase item in sorted list
              const phaseIndex = sortedPhaseItems.findIndex(
                (item) => item.id === phaseBomItem.id
              );

              // Match to the same index in recipe items (if it exists)
              if (phaseIndex >= 0 && phaseIndex < sortedRecipeItems.length) {
                matchingBomItem = sortedRecipeItems[phaseIndex];
              }
            } else {
              // Mismatch in counts - just take the first available recipe item
              matchingBomItem = recipeItemsForId[0];
            }

            // Only add if found and not already in array (prevent duplicates)
            if (
              matchingBomItem &&
              !stepBomItems.some((item) => item.id === matchingBomItem!.id)
            ) {
              stepBomItems.push(matchingBomItem);
            }
          }
        }

        if (phase.name === "GrainAdd") {
          if (USE_CONSOLIDATED_GRAIN_ADD) {
            // Use consolidated GrainAdd step type - grain type will be derived from linked BOM item at runtime
            stepType = EnumMashingProtocolStepStepType.GrainAdd;
          } else {
            // Legacy behavior: determine specific grain type from linked BOM items
            stepType = EnumMashingProtocolStepStepType.Hold; // Default fallback

            // Check linked BOM items to determine specific grain type
            if (stepBomItems.length > 0) {
              for (const bomItem of stepBomItems) {
                const itemGroup = bomItem.item?.itemGroup?.toLowerCase() || "";
                const itemName = bomItem.item?.itemName?.toLowerCase() || "";
                const itemNumber =
                  bomItem.item?.itemNumber?.toLowerCase() || "";

                // Determine grain type from item (check group, name, and number)
                if (
                  itemGroup.includes("corn") ||
                  itemName.includes("corn") ||
                  itemNumber.includes("corn") ||
                  itemGroup.includes("crn") ||
                  itemNumber.includes("cor")
                ) {
                  stepType = EnumMashingProtocolStepStepType.Corn;
                  break;
                } else if (
                  itemGroup.includes("rye") ||
                  itemName.includes("rye") ||
                  itemNumber.includes("rye")
                ) {
                  stepType = EnumMashingProtocolStepStepType.Rye;
                  break;
                } else if (
                  itemGroup.includes("wheat") ||
                  itemName.includes("wheat") ||
                  itemNumber.includes("wheat") ||
                  itemNumber.includes("wht")
                ) {
                  stepType = EnumMashingProtocolStepStepType.Wheat;
                  break;
                } else if (
                  itemGroup.includes("malt") ||
                  itemGroup.includes("barley") ||
                  itemName.includes("malt") ||
                  itemName.includes("barley") ||
                  itemNumber.includes("malt") ||
                  itemNumber.includes("bry") ||
                  itemGroup.includes("bry")
                ) {
                  stepType = EnumMashingProtocolStepStepType.Malt;
                  break;
                }
              }
            }
          }
        } else {
          // For non-GrainAdd phases, use the direct mapping
          stepType =
            PHASE_TO_STEP_TYPE_MAP[phase.name] ||
            EnumMashingProtocolStepStepType.Hold;
        }

        // Only Hold step types should have holdType and temperature/time data
        const isHoldStep = stepType === EnumMashingProtocolStepStepType.Hold;

        // For Hold steps: set temperature based on holdType
        let finalTemp: number | undefined;
        let finalHeatTempSp: number | undefined;
        let finalCoolTempSp: number | undefined;
        let finalHoldType: EnumMashingProtocolStepHoldType | undefined;
        let finalHeatEnabled = false;
        let finalCoolEnabled = false;

        if (isHoldStep) {
          finalHoldType = holdType;
          finalHeatEnabled = holdType === EnumMashingProtocolStepHoldType.Heat;
          finalCoolEnabled = holdType === EnumMashingProtocolStepHoldType.Cool;
          finalTemp = temperatureSetpoint;

          // Set the appropriate temp SP based on holdType
          if (holdType === EnumMashingProtocolStepHoldType.Heat) {
            finalHeatTempSp = temperatureSetpoint;
          } else if (holdType === EnumMashingProtocolStepHoldType.Cool) {
            finalCoolTempSp = temperatureSetpoint;
          }
        }

        // Create mashing protocol step with BOM item connections
        await prisma.mashingProtocolStep.create({
          data: {
            index: stepIndex,
            stepType,
            holdType: finalHoldType,
            temperatureSetpoint: finalTemp,
            stepTime: isHoldStep ? stepTime : undefined,
            heatEnabled: finalHeatEnabled,
            coolEnabled: finalCoolEnabled,
            heatTempSp: finalHeatTempSp,
            coolTempSp: finalCoolTempSp,
            agitatorEnabled: isHoldStep ? agitatorEnabled : false,
            agitatorSpdSp: isHoldStep ? agitatorSpdSp : undefined,
            promptMessage,
            mashingProtocolId: mashingProtocol.id,
            recipeBomItem:
              stepBomItems.length > 0
                ? {
                    connect: stepBomItems.map((item) => ({ id: item.id })),
                  }
                : undefined,
            createdBy: "backfill-script",
            updatedBy: "backfill-script",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

        const bomItemInfo =
          stepBomItems.length > 0
            ? ` [${stepBomItems.length} BOM items linked]`
            : "";
        console.log(
          `      ✅ Created step ${stepIndex}: ${stepType} (${phase.name})${bomItemInfo}`
        );
        stepsCreated++;
        stepIndex++;
      }

      // Link recipe to mashing protocol
      await prisma.recipe.update({
        where: { id: recipe.id },
        data: {
          mashingProtocolId: mashingProtocol.id,
          updatedBy: "backfill-script",
          updatedAt: new Date(),
        },
      });

      console.log(`   ✅ Linked recipe to mashing protocol`);
      recipesLinked++;
    } catch (error) {
      console.error(`   ❌ Error processing recipe ${recipe.Recipe}:`, error);
    }
  }

  console.log("\n📈 Backfill Summary:");
  console.log(`   ✅ Mashing Protocols Created: ${protocolsCreated}`);
  console.log(`   ✅ Mashing Protocol Steps Created: ${stepsCreated}`);
  console.log(`   ✅ Recipes Linked: ${recipesLinked}`);
  console.log(`   ⏭️  Skipped (No Phases): ${skippedNoPhases}`);
  console.log(`   📊 Total Recipes Processed: ${recipes.length}`);
}

async function main() {
  try {
    await backfillMashingProtocols();
    console.log("\n✅ Mashing protocols backfill completed successfully!");
  } catch (error) {
    console.error("❌ Error during backfill:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { backfillMashingProtocols };
