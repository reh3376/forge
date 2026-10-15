#!/usr/bin/env ts-node

/**
 * Robust Database Seeding Script
 *
 * This script replaces the existing seedDevelopment.ts with a more robust,
 * error-resistant, and comprehensive seeding approach.
 *
 * Features:
 * - Transaction-based seeding with rollback on failure
 * - Detailed logging and progress tracking
 * - Data validation before and after seeding
 * - Modular seed execution with dependency management
 * - Status tracking and recovery from partial failures
 */

import * as dotenv from "dotenv";
import { Salt, parseSalt } from "../src/auth/password.service";
import { hash } from "bcrypt";
import { SeedOrchestrator } from "./orchestrator";
import { createSeedConfig } from "./config";
import { loadSeedModules } from "./modules";

// Load environment variables
dotenv.config();

interface SeedUserConfig {
  username: string;
  password: string;
  roles: string[];
}

async function createAdminUser(
  orchestrator: SeedOrchestrator,
  userConfig: SeedUserConfig,
  salt: Salt
): Promise<void> {
  console.log("🔐 Creating admin user...");

  try {
    // We'll add this directly to avoid circular dependencies
    const { PrismaClient } = await import("@prisma/client");
    const client = new PrismaClient();

    const hashedPassword = await hash(userConfig.password, salt);

    await client.user.upsert({
      where: { username: userConfig.username },
      update: {
        password: hashedPassword,
        roles: userConfig.roles,
        updatedAt: new Date(),
      },
      create: {
        id: "admin-user-001",
        username: userConfig.username,
        password: hashedPassword,
        roles: userConfig.roles,
        updatedAt: new Date(),
      },
    });

    console.log(
      `✅ Admin user '${userConfig.username}' created/updated successfully`
    );
    await client.$disconnect();
  } catch (error) {
    console.error("❌ Failed to create admin user:", error);
    throw error;
  }
}

async function main() {
  console.log("🌱 Starting Robust Database Seeding\n");
  console.log("=====================================");

  // Validate environment variables
  const { BCRYPT_SALT } = process.env;
  if (!BCRYPT_SALT) {
    throw new Error("BCRYPT_SALT environment variable must be defined");
  }

  const salt = parseSalt(BCRYPT_SALT);
  const environment = process.env.NODE_ENV || "development";

  console.log(`Environment: ${environment}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  // Configure seeding options
  const seedConfig = createSeedConfig({
    environment: environment as any,
    enableTransactions: true,
    enableValidation: true,
    enableStatusTracking: true,
    skipExistingData: true, // Skip existing data by default
    logLevel: (process.env.SEED_LOG_LEVEL as any) || "info",
  });

  const orchestrator = new SeedOrchestrator(seedConfig);

  try {
    // Initialize the orchestrator
    await orchestrator.initialize();

    // Load and register all seed modules
    console.log("📦 Loading seed modules...");
    const modules = await loadSeedModules();
    orchestrator.registerModules(modules);
    console.log(`   Loaded ${modules.length} seed modules\n`);

    // Create admin user first (required for most seed operations)
    const userConfig: SeedUserConfig = {
      username: process.env.ADMIN_USERNAME || "admin",
      password: process.env.ADMIN_PASSWORD || "admin",
      roles: ["user", "admin"],
    };

    await createAdminUser(orchestrator, userConfig, salt);
    console.log();

    // Execute all seed modules
    console.log("🚀 Starting comprehensive seed execution...\n");
    const startTime = Date.now();

    const result = await orchestrator.executeAll();

    const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);

    if (result.success) {
      console.log("\n🎉 DATABASE SEEDING COMPLETED SUCCESSFULLY!");
      console.log(`   Total execution time: ${executionTime}s`);

      // Show final status
      console.log("\n📊 Final Status:");
      const status = await orchestrator.getStatus();
      if (status.summary) {
        console.log(`   Modules completed: ${status.summary.completed}`);
        console.log(`   Modules failed: ${status.summary.failed}`);
        console.log(`   Total modules: ${status.summary.total}`);
      }

      // Run final verification
      console.log("\n🔍 Running final verification...");
      const { SeedVerifier } = await import("./utils/verifier");
      const { PrismaClient } = await import("@prisma/client");

      const client = new PrismaClient();
      const verifier = new SeedVerifier(client);
      const verification = await verifier.runAllChecks();

      if (verification.valid) {
        console.log("✅ All verification checks passed!");
      } else {
        console.log("⚠️  Some verification warnings (non-critical):");
        verification.warnings.forEach((warning) =>
          console.log(`   • ${warning}`)
        );
        if (verification.errors.length > 0) {
          console.log("❌ Critical verification errors:");
          verification.errors.forEach((error) => console.log(`   • ${error}`));
        }
      }

      await client.$disconnect();

      console.log("\n🎯 Next Steps:");
      console.log("   • Review seed status with: npm run seed:status");
      console.log("   • Run verification with: npm run seed:verify");
      console.log("   • Use interactive mode with: npm run seed:interactive");
      console.log("   • View available commands with: npm run seed -- --help");
    } else {
      console.log("\n❌ DATABASE SEEDING FAILED");
      console.log(`   Execution time: ${executionTime}s`);
      console.log("\nFailed modules:");

      result.results.forEach((moduleResult, moduleName) => {
        if (!moduleResult.success) {
          console.log(`   • ${moduleName}: ${moduleResult.message}`);
          if (moduleResult.errors.length > 0) {
            moduleResult.errors.forEach((error) => {
              console.log(`     - ${error}`);
            });
          }
        }
      });

      console.log("\n🔧 Troubleshooting:");
      console.log("   • Check error messages above");
      console.log("   • Verify database connectivity");
      console.log("   • Review seed module dependencies");
      console.log(
        "   • Run individual modules: npm run seed modules <module-name>"
      );
      console.log(
        "   • Reset and retry: npm run seed reset && npm run seed:all"
      );

      process.exit(1);
    }
  } catch (error) {
    console.error("\n💥 CRITICAL ERROR DURING SEEDING:");
    console.error(error instanceof Error ? error.message : error);
    console.error("\nStack trace:");
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }

    console.log("\n🆘 Recovery Options:");
    console.log("   • Check database connectivity");
    console.log("   • Verify environment variables");
    console.log("   • Review Prisma schema compatibility");
    console.log("   • Check for conflicting migrations");
    console.log("   • Contact system administrator if issues persist");

    process.exit(1);
  } finally {
    // Always cleanup
    await orchestrator.cleanup();
  }
}

// Error handling for uncaught exceptions
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Promise Rejection:", reason);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  process.exit(1);
});

// Graceful shutdown handling
process.on("SIGINT", () => {
  console.log("\n🛑 Seed process interrupted by user");
  process.exit(130); // Standard exit code for Ctrl+C
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Seed process terminated");
  process.exit(143); // Standard exit code for SIGTERM
});

// Run the main function if this script is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
