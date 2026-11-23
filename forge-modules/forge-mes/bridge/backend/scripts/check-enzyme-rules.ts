#!/usr/bin/env ts-node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkEnzymeRules() {
  console.log("🔍 Checking Enzyme Calculation Rules...\n");

  try {
    // Get all enzyme configurations with their calculation rules
    const enzymeConfigs = await prisma.enzymeConfiguration.findMany({
      include: {
        item: {
          select: {
            itemName: true,
            itemNumber: true,
          },
        },
        calculationRules: true,
      },
      orderBy: {
        item: {
          itemName: "asc",
        },
      },
    });

    console.log(`📦 Found ${enzymeConfigs.length} enzyme configurations:\n`);

    let configsWithRules = 0;
    let configsWithoutRules = 0;
    let totalRules = 0;

    for (const config of enzymeConfigs) {
      console.log(`🧪 ${config.item.itemName} (${config.category})`);
      console.log(`   Configuration ID: ${config.id}`);
      console.log(`   Dose: ${config.dosePerMetricTon} kg/MT`);

      if (config.calculationRules.length > 0) {
        console.log(
          `   ✅ Calculation Rules: ${config.calculationRules.length}`
        );
        configsWithRules++;
        totalRules += config.calculationRules.length;

        config.calculationRules.forEach((rule, index) => {
          console.log(
            `      Rule ${index + 1}: ${rule.calculationMethod} | Grain: ${
              rule.grainType || "ALL"
            } | Multiplier: ${rule.multiplier}`
          );
        });
      } else {
        console.log(`   ❌ Calculation Rules: NONE`);
        configsWithoutRules++;
      }

      console.log("");
    }

    // Summary
    console.log("=== CALCULATION RULES SUMMARY ===");
    console.log(`✅ Configurations with rules: ${configsWithRules}`);
    console.log(`❌ Configurations without rules: ${configsWithoutRules}`);
    console.log(`📊 Total calculation rules: ${totalRules}`);
    console.log(`📊 Total enzyme configurations: ${enzymeConfigs.length}`);

    if (configsWithoutRules > 0) {
      console.log("\n⚠️  Configurations missing calculation rules:");
      enzymeConfigs
        .filter((config) => config.calculationRules.length === 0)
        .forEach((config) => {
          console.log(`   - ${config.item.itemName} (${config.category})`);
        });
    }
  } catch (error) {
    console.error("❌ Check failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run check
checkEnzymeRules();
