#!/usr/bin/env ts-node

/**
 * Copy Mashing Protocols by Mash Bill Match
 *
 * For recipes without mashing protocols, finds recipes with matching mash bill
 * compositions and copies their mashing protocol steps.
 *
 * Usage:
 *   npm run migrate:copy-protocols-by-mashbill
 *   or
 *   DB_URL=<connection-string> npx ts-node scripts/seed/copy-mashing-protocols-by-mashbill.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Helper to extract mash bill percentages from recipe name (e.g., "WHK-70-22-00-08-R01" = 70% corn, 22% rye, 0% wheat, 8% malt)
function extractMashBillFromName(
  recipeName: string
): { corn: number; rye: number; wheat: number; malt: number } | null {
  // Pattern: XXX-##-##-##-##-R##
  const match = recipeName.match(/^[A-Z]+-(\d+)-(\d+)-(\d+)-(\d+)-R\d+/);
  if (!match) return null;

  return {
    corn: parseInt(match[1]),
    rye: parseInt(match[2]),
    wheat: parseInt(match[3]),
    malt: parseInt(match[4]),
  };
}

// Helper to check if two mash bills match (exact match)
function mashBillsMatch(
  mb1: { corn: number; rye: number; wheat: number; malt: number },
  mb2: { corn: number; rye: number; wheat: number; malt: number }
): boolean {
  return (
    mb1.corn === mb2.corn &&
    mb1.rye === mb2.rye &&
    mb1.wheat === mb2.wheat &&
    mb1.malt === mb2.malt
  );
}

// Helper to generate protocol name
function generateProtocolName(recipeName: string): string {
  return `${recipeName}-Mashing-Protocol`;
}

async function copyProtocolsByMashBill() {
  console.log("🔄 Starting Mashing Protocol Copy by Mash Bill Match...\n");

  // Get recipes without mashing protocols
  const recipesWithoutProtocols = await prisma.recipe.findMany({
    where: {
      active: true,
      mashingProtocolId: null,
    },
    select: {
      id: true,
      Recipe: true,
      revision: true,
    },
  });

  console.log(
    `📊 Found ${recipesWithoutProtocols.length} recipes without mashing protocols\n`
  );

  // Get recipes WITH mashing protocols (potential donors)
  const recipesWithProtocols = await prisma.recipe.findMany({
    where: {
      active: true,
      mashingProtocolId: { not: null },
    },
    select: {
      id: true,
      Recipe: true,
      mashingProtocolId: true,
      mashingProtocol: {
        include: {
          steps: {
            orderBy: {
              index: "asc",
            },
          },
        },
      },
    },
  });

  console.log(
    `📊 Found ${recipesWithProtocols.length} recipes with mashing protocols (potential donors)\n`
  );

  let protocolsCreated = 0;
  let stepsCreated = 0;
  let recipesLinked = 0;
  let skippedNoMatch = 0;
  let skippedNoMashBill = 0;

  for (const recipe of recipesWithoutProtocols) {
    console.log(`\n🔄 Processing recipe: ${recipe.Recipe} (${recipe.id})`);

    // Extract mash bill from recipe name
    const targetMashBill = extractMashBillFromName(recipe.Recipe);

    if (!targetMashBill) {
      console.log(
        `   ⏭️  Skipped: Could not extract mash bill from recipe name`
      );
      skippedNoMashBill++;
      continue;
    }

    console.log(
      `   Mash Bill: ${targetMashBill.corn}% corn, ${targetMashBill.rye}% rye, ${targetMashBill.wheat}% wheat, ${targetMashBill.malt}% malt`
    );

    // Find a donor recipe with matching mash bill
    let donorRecipe = null;
    for (const potentialDonor of recipesWithProtocols) {
      const donorMashBill = extractMashBillFromName(potentialDonor.Recipe);
      if (donorMashBill && mashBillsMatch(targetMashBill, donorMashBill)) {
        donorRecipe = potentialDonor;
        break;
      }
    }

    if (!donorRecipe) {
      console.log(
        `   ⏭️  Skipped: No matching mash bill found in recipes with protocols`
      );
      skippedNoMatch++;
      continue;
    }

    console.log(`   ✅ Found matching recipe: ${donorRecipe.Recipe}`);
    console.log(
      `   Donor protocol has ${
        donorRecipe.mashingProtocol?.steps.length || 0
      } steps`
    );

    if (
      !donorRecipe.mashingProtocol ||
      donorRecipe.mashingProtocol.steps.length === 0
    ) {
      console.log(`   ⏭️  Skipped: Donor protocol has no steps`);
      skippedNoMatch++;
      continue;
    }

    try {
      // Create new mashing protocol for this recipe
      const protocolName = generateProtocolName(recipe.Recipe);

      const newProtocol = await prisma.mashingProtocol.create({
        data: {
          name: protocolName,
          revision: recipe.revision?.toString() || "1",
          master: false,
          isTemplate: false,
          running: false,
          createdBy: "copy-by-mashbill-script",
          updatedBy: "copy-by-mashbill-script",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      console.log(`   ✅ Created mashing protocol: ${protocolName}`);
      protocolsCreated++;

      // Copy steps from donor protocol
      for (const donorStep of donorRecipe.mashingProtocol.steps) {
        await prisma.mashingProtocolStep.create({
          data: {
            index: donorStep.index,
            stepType: donorStep.stepType,
            holdType: donorStep.holdType,
            temperatureSetpoint: donorStep.temperatureSetpoint,
            stepTime: donorStep.stepTime,
            heatEnabled: donorStep.heatEnabled,
            coolEnabled: donorStep.coolEnabled,
            heatTempSp: donorStep.heatTempSp,
            coolTempSp: donorStep.coolTempSp,
            agitatorEnabled: donorStep.agitatorEnabled,
            agitatorSpdSp: donorStep.agitatorSpdSp,
            promptMessage: donorStep.promptMessage,
            mashingProtocolId: newProtocol.id,
            // Note: We don't copy recipeBomItem links as those are recipe-specific
            createdBy: "copy-by-mashbill-script",
            updatedBy: "copy-by-mashbill-script",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

        console.log(
          `      ✅ Created step ${donorStep.index}: ${donorStep.stepType}`
        );
        stepsCreated++;
      }

      // Link recipe to new mashing protocol
      await prisma.recipe.update({
        where: { id: recipe.id },
        data: {
          mashingProtocolId: newProtocol.id,
          updatedBy: "copy-by-mashbill-script",
          updatedAt: new Date(),
        },
      });

      console.log(`   ✅ Linked recipe to mashing protocol`);
      recipesLinked++;
    } catch (error) {
      console.error(`   ❌ Error processing recipe ${recipe.Recipe}:`, error);
    }
  }

  console.log("\n📈 Copy Summary:");
  console.log(`   ✅ Mashing Protocols Created: ${protocolsCreated}`);
  console.log(`   ✅ Mashing Protocol Steps Created: ${stepsCreated}`);
  console.log(`   ✅ Recipes Linked: ${recipesLinked}`);
  console.log(`   ⏭️  Skipped (No Mash Bill in Name): ${skippedNoMashBill}`);
  console.log(`   ⏭️  Skipped (No Matching Mash Bill): ${skippedNoMatch}`);
  console.log(
    `   📊 Total Recipes Processed: ${recipesWithoutProtocols.length}`
  );
}

async function main() {
  try {
    await copyProtocolsByMashBill();
    console.log(
      "\n✅ Mashing protocol copy by mash bill completed successfully!"
    );
  } catch (error) {
    console.error("❌ Error during copy:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { copyProtocolsByMashBill };
