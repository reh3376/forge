#!/usr/bin/env ts-node

import { PrismaClient } from "@prisma/client";
import { EnzymeItemValidator } from "../src/enzymeConfiguration/utils/enzyme-item-validator";

const prisma = new PrismaClient();

async function verifyEnzymeMigration() {
  console.log("🔍 Verifying Enzyme Migration Results...\n");

  try {
    // Get all enzyme items
    const enzymeItems = await prisma.item.findMany({
      where: {
        itemGroup: "ENZ",
      },
      include: {
        EnzymeConfiguration: true,
      },
      orderBy: {
        itemNumber: "asc",
      },
    });

    console.log(`📦 Found ${enzymeItems.length} enzyme items:\n`);

    let validCount = 0;
    let invalidCount = 0;

    for (const item of enzymeItems) {
      console.log(`🧪 ${item.itemName}`);
      console.log(`   Item Number: ${item.itemNumber}`);
      console.log(`   ERP ID: ${item.erpId}`);

      // Validate item number format
      const itemValidation = EnzymeItemValidator.validateItemNumber(
        item.itemNumber
      );
      const erpValidation = EnzymeItemValidator.validateErpId(item.erpId);

      if (itemValidation.isValid && erpValidation.isValid) {
        console.log(`   ✅ Format: VALID`);
        validCount++;

        // Check for random patterns
        try {
          EnzymeItemValidator.ensureNotRandomlyGenerated(item.itemNumber);
          EnzymeItemValidator.ensureNotRandomlyGenerated(item.erpId);
          console.log(`   🔒 Random Check: PASSED`);
        } catch (error: any) {
          console.log(`   ❌ Random Check: FAILED - ${error.message}`);
          invalidCount++;
        }
      } else {
        console.log(`   ❌ Format: INVALID`);
        if (itemValidation.errors.length > 0) {
          console.log(
            `      Item Number Errors: ${itemValidation.errors.join(", ")}`
          );
        }
        if (erpValidation.errors.length > 0) {
          console.log(
            `      ERP ID Errors: ${erpValidation.errors.join(", ")}`
          );
        }
        invalidCount++;
      }

      // Check enzyme configuration
      if (item.EnzymeConfiguration) {
        const config = item.EnzymeConfiguration;
        console.log(
          `   ⚙️  Configuration: ${config.category} | Dose: ${config.dosePerMetricTon} kg/MT`
        );
      } else {
        console.log(`   ⚠️  Configuration: MISSING`);
      }

      console.log("");
    }

    // Summary
    console.log("=== VERIFICATION SUMMARY ===");
    console.log(`✅ Valid enzyme items: ${validCount}`);
    console.log(`❌ Invalid enzyme items: ${invalidCount}`);
    console.log(`📊 Total enzyme items: ${enzymeItems.length}`);

    if (invalidCount === 0) {
      console.log("🎉 All enzyme items follow standardized format!");
      console.log("🔒 No random patterns detected!");
    } else {
      console.log("⚠️  Some enzyme items need attention.");
    }

    // Check for any non-standard patterns
    console.log("\n🔍 Checking for non-standard patterns...");
    const nonStandardItems = await prisma.$queryRaw<any[]>`
      SELECT "itemNumber", "erpId", "itemName" 
      FROM "Item" 
      WHERE "itemGroup" = 'ENZ' 
      AND (
        "itemNumber" !~ '^ENZ-[A-Z]{3}[0-9]{2}-Enzyme \\(.+\\)$' 
        OR "erpId" !~ '^ENZ-[A-Z]{3}[0-9]{2}-ERP$'
      )
    `;

    if (nonStandardItems.length === 0) {
      console.log("✅ All enzyme items follow the standard format pattern!");
    } else {
      console.log(
        `❌ Found ${nonStandardItems.length} items with non-standard patterns:`
      );
      nonStandardItems.forEach((item) => {
        console.log(
          `   - ${item.itemName}: ${item.itemNumber} (${item.erpId})`
        );
      });
    }
  } catch (error) {
    console.error("❌ Verification failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run verification
verifyEnzymeMigration();
