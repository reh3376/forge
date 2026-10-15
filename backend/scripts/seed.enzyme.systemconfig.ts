import { PrismaClient } from "@prisma/client";
import { Logger } from "@nestjs/common";

/**
 * Seed system configuration values related to enzyme dosing
 * This script initializes system configuration values needed by the enzyme dosing service
 */
export async function seedEnzymeSystemConfigurations(client?: PrismaClient) {
  const logger = new Logger("EnzymeSystemConfigSeeder");
  const prisma = client || new PrismaClient();
  const shouldDisconnect = !client;

  try {
    logger.log("Seeding enzyme system configurations...");

    // Configuration values to seed
    const configurations = [
      {
        configKey: "ENZYME_METRIC_TON_DIVISOR",
        configValue: "2205",
        description:
          "Divisor to convert pounds to metric tons for enzyme dosing calculations",
        dataType: "number",
        createdBy: "system-seeder",
      },
      {
        configKey: "ENZYME_CACHE_TTL_MINUTES",
        configValue: "60",
        description: "Time to live for enzyme configuration cache in minutes",
        dataType: "number",
        createdBy: "system-seeder",
      },
      {
        configKey: "ENZYME_CALCULATION_PRECISION",
        configValue: "3",
        description: "Decimal precision for enzyme calculations",
        dataType: "number",
        createdBy: "system-seeder",
      },
      {
        configKey: "ENZYME_CITRIC_EXCLUSION_ENABLED",
        configValue: "true",
        description:
          "Whether to exclude citric acid from enzyme dosing calculations",
        dataType: "boolean",
        createdBy: "system-seeder",
      },
    ];

    // Upsert each configuration (create if doesn't exist, update if it does)
    for (const config of configurations) {
      await prisma.systemConfiguration.upsert({
        where: { configKey: config.configKey },
        update: {
          configValue: config.configValue,
          description: config.description,
          dataType: config.dataType,
          updatedBy: "system-seeder",
        },
        create: {
          ...config,
          active: true,
        },
      });

      logger.log(
        `Upserted system configuration: ${config.configKey} = ${config.configValue}`
      );
    }

    logger.log("Enzyme system configurations seeded successfully");
  } catch (error) {
    logger.error("Error seeding enzyme system configurations:", error);
    throw error;
  } finally {
    if (shouldDisconnect) {
      await prisma.$disconnect();
    }
  }
}

// Allow running directly from CLI
if (require.main === module) {
  seedEnzymeSystemConfigurations()
    .then(() => {
      console.log("Enzyme system configurations seeded successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Error seeding enzyme system configurations:", error);
      process.exit(1);
    });
}
