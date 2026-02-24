import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

// Configure environment variables
dotenv.config();

// Keys to verify
const ENZYME_CONFIG_KEYS = [
  "ENZYME_METRIC_TON_DIVISOR",
  "ENZYME_CACHE_TTL_MINUTES",
  "ENZYME_CALCULATION_PRECISION",
  "ENZYME_CITRIC_EXCLUSION_ENABLED",
];

// Run the verification
async function verifyEnzymeConfigs() {
  console.log("=== VERIFYING ENZYME SYSTEM CONFIGURATIONS ===");

  const prisma = new PrismaClient();

  try {
    // Retrieve all system configurations with enzyme keys
    const configs = await prisma.systemConfiguration.findMany({
      where: {
        configKey: {
          in: ENZYME_CONFIG_KEYS,
        },
      },
    });

    // Check if all expected keys are present
    const foundKeys = configs.map((config) => config.configKey);
    const missingKeys = ENZYME_CONFIG_KEYS.filter(
      (key) => !foundKeys.includes(key)
    );

    if (missingKeys.length > 0) {
      console.log("❌ Missing configuration keys:", missingKeys);
    } else {
      console.log("✅ All required configuration keys found");
    }

    // Print current configuration values
    console.log("\nCurrent enzyme system configurations:");
    console.log("-----------------------------------");

    configs.forEach((config) => {
      console.log(
        `${config.configKey}: ${config.configValue} (${config.dataType})`
      );
      console.log(`   Description: ${config.description}`);
      console.log(`   Active: ${config.active}`);
      console.log(`   Created by: ${config.createdBy}`);
      console.log(`   Created at: ${config.createdAt}`);
      console.log("-----------------------------------");
    });

    console.log(
      `\nFound ${configs.length} of ${ENZYME_CONFIG_KEYS.length} expected configurations`
    );
  } catch (error) {
    console.error("❌ Error verifying enzyme system configurations:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the verification if this file is executed directly
if (require.main === module) {
  verifyEnzymeConfigs()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Unexpected error:", error);
      process.exit(1);
    });
}
