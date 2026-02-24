#!/usr/bin/env node

import { Command } from "commander";
import { PrismaClient } from "@prisma/client";
import { SeedOrchestrator } from "./orchestrator";
import { SeedVerifier } from "./utils/verifier";
import { createSeedConfig, SEED_PRIORITIES } from "./config";
import { loadSeedModules } from "./modules";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

const program = new Command();

program
  .name("seed-manager")
  .description("Comprehensive database seeding and management tool")
  .version("1.0.0");

// Global options
program
  .option(
    "-e, --env <environment>",
    "Environment (development, staging, production)",
    "development"
  )
  .option("-v, --verbose", "Enable verbose logging")
  .option("--no-transactions", "Disable transaction mode")
  .option("--no-validation", "Disable validation checks")
  .option("--no-status-tracking", "Disable status tracking")
  .option("--force", "Skip existing data checks and force re-seeding");

// Seed all command
program
  .command("all")
  .description("Run all enabled seed modules")
  .action(async (options, command) => {
    const globalOpts = command.parent?.opts() || {};
    await runAllSeeds(globalOpts);
  });

// Seed specific modules command
program
  .command("modules <modules...>")
  .description("Run specific seed modules (space-separated)")
  .action(async (modules, options, command) => {
    const globalOpts = command.parent?.opts() || {};
    await runSpecificModules(modules, globalOpts);
  });

// List available modules command
program
  .command("list")
  .description("List all available seed modules")
  .action(async (options, command) => {
    await listModules();
  });

// Verify data command
program
  .command("verify")
  .description("Run data verification checks")
  .option("-c, --check <checkName>", "Run specific verification check")
  .action(async (options, command) => {
    const globalOpts = command.parent?.opts() || {};
    await verifyData(options.check, globalOpts);
  });

// Status command
program
  .command("status")
  .description("Show seed execution status")
  .action(async (options, command) => {
    const globalOpts = command.parent?.opts() || {};
    await showStatus(globalOpts);
  });

// Reset command
program
  .command("reset [modules...]")
  .description("Reset seed status for modules (all if none specified)")
  .action(async (modules, options, command) => {
    const globalOpts = command.parent?.opts() || {};
    await resetModules(modules, globalOpts);
  });

// Interactive mode command
program
  .command("interactive")
  .alias("i")
  .description("Run in interactive mode")
  .action(async (options, command) => {
    const globalOpts = command.parent?.opts() || {};
    await runInteractive(globalOpts);
  });

async function createOrchestrator(options: any): Promise<SeedOrchestrator> {
  const config = createSeedConfig({
    environment: options.env,
    enableTransactions: options.transactions !== false,
    enableValidation: options.validation !== false,
    enableStatusTracking: options.statusTracking !== false,
    skipExistingData: !options.force,
    logLevel: options.verbose ? "debug" : "info",
  });

  const orchestrator = new SeedOrchestrator(config);
  await orchestrator.initialize();

  // Load and register seed modules
  const modules = await loadSeedModules();
  orchestrator.registerModules(modules);

  return orchestrator;
}

async function runAllSeeds(options: any): Promise<void> {
  console.log("🌱 Starting comprehensive database seeding...\n");

  const orchestrator = await createOrchestrator(options);

  try {
    const result = await orchestrator.executeAll();

    if (result.success) {
      console.log("\n✅ All seed modules completed successfully!");
      process.exit(0);
    } else {
      console.log(
        "\n❌ Some seed modules failed. Check the logs above for details."
      );
      process.exit(1);
    }
  } catch (error) {
    console.error(
      "❌ Seed execution failed:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  } finally {
    await orchestrator.cleanup();
  }
}

async function runSpecificModules(
  moduleNames: string[],
  options: any
): Promise<void> {
  console.log(`🌱 Starting seeding for modules: ${moduleNames.join(", ")}\n`);

  const orchestrator = await createOrchestrator(options);

  try {
    const result = await orchestrator.executeModules(moduleNames);

    if (result.success) {
      console.log("\n✅ Selected seed modules completed successfully!");
      process.exit(0);
    } else {
      console.log(
        "\n❌ Some seed modules failed. Check the logs above for details."
      );
      process.exit(1);
    }
  } catch (error) {
    console.error(
      "❌ Seed execution failed:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  } finally {
    await orchestrator.cleanup();
  }
}

async function listModules(): Promise<void> {
  console.log("📋 Available Seed Modules:\n");

  try {
    const modules = await loadSeedModules();

    if (modules.length === 0) {
      console.log("No seed modules found.");
      return;
    }

    // Group by priority
    const groupedModules = modules.reduce((acc, module) => {
      const priorityName =
        Object.keys(SEED_PRIORITIES).find(
          (key) =>
            SEED_PRIORITIES[key as keyof typeof SEED_PRIORITIES] ===
            module.priority
        ) || `PRIORITY_${module.priority}`;

      if (!acc[priorityName]) {
        acc[priorityName] = [];
      }
      acc[priorityName].push(module);
      return acc;
    }, {} as Record<string, typeof modules>);

    Object.entries(groupedModules)
      .sort(([, a], [, b]) => a[0].priority - b[0].priority)
      .forEach(([priorityName, priorityModules]) => {
        console.log(`\n${priorityName}:`);
        priorityModules.forEach((module) => {
          const status = module.enabled ? "✅" : "❌";
          const deps =
            module.dependencies.length > 0
              ? ` (depends on: ${module.dependencies.join(", ")})`
              : "";
          console.log(
            `  ${status} ${module.name} - ${module.description}${deps}`
          );
        });
      });
  } catch (error) {
    console.error(
      "❌ Failed to load modules:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}

async function verifyData(checkName?: string, options?: any): Promise<void> {
  console.log("🔍 Running data verification...\n");

  const client = new PrismaClient();
  const verifier = new SeedVerifier(client);

  try {
    let result;

    if (checkName) {
      console.log(`Running specific check: ${checkName}`);
      result = await verifier.runCheck(checkName);
    } else {
      result = await verifier.runAllChecks();
    }

    if (result.valid) {
      console.log("\n✅ All verification checks passed!");
      process.exit(0);
    } else {
      console.log("\n❌ Verification failed. See errors above.");
      process.exit(1);
    }
  } catch (error) {
    console.error(
      "❌ Verification failed:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  } finally {
    await client.$disconnect();
  }
}

async function showStatus(options: any): Promise<void> {
  console.log("📊 Seed Execution Status:\n");

  const orchestrator = await createOrchestrator(options);

  try {
    const status = await orchestrator.getStatus();

    if (status.message) {
      console.log(status.message);
      return;
    }

    // Show summary
    console.log("Summary:");
    console.log(`  Total: ${status.summary.total}`);
    console.log(`  Completed: ${status.summary.completed} ✅`);
    console.log(
      `  Failed: ${status.summary.failed} ${
        status.summary.failed > 0 ? "❌" : ""
      }`
    );
    console.log(`  Running: ${status.summary.running} 🔄`);
    console.log(`  Pending: ${status.summary.pending} ⏳`);

    // Show detailed status
    if (status.modules && status.modules.length > 0) {
      console.log("\nModule Status:");
      status.modules.forEach((module: any) => {
        const statusIcon =
          (
            {
              completed: "✅",
              failed: "❌",
              running: "🔄",
              pending: "⏳",
            } as any
          )[module.status] || "❓";

        const executionTime = module.execution_time_ms
          ? ` (${module.execution_time_ms}ms)`
          : "";
        console.log(`  ${statusIcon} ${module.module_name}${executionTime}`);

        if (module.error_message) {
          console.log(`     Error: ${module.error_message}`);
        }
      });
    }

    console.log(`\nRegistered Modules: ${status.registeredModules.join(", ")}`);
  } catch (error) {
    console.error(
      "❌ Failed to get status:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  } finally {
    await orchestrator.cleanup();
  }
}

async function resetModules(
  moduleNames: string[] = [],
  options: any
): Promise<void> {
  const orchestrator = await createOrchestrator(options);

  try {
    if (moduleNames.length > 0) {
      console.log(`🔄 Resetting status for modules: ${moduleNames.join(", ")}`);
      await orchestrator.reset(moduleNames);
    } else {
      console.log("🔄 Resetting all seed module statuses");
      await orchestrator.reset();
    }

    console.log("✅ Reset completed successfully!");
  } catch (error) {
    console.error(
      "❌ Reset failed:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  } finally {
    await orchestrator.cleanup();
  }
}

async function runInteractive(options: any): Promise<void> {
  const readline = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (question: string): Promise<string> => {
    return new Promise((resolve) => readline.question(question, resolve));
  };

  console.log("🚀 Interactive Seed Manager\n");
  console.log("Available commands:");
  console.log("  1. Run all seeds");
  console.log("  2. Run specific modules");
  console.log("  3. List modules");
  console.log("  4. Verify data");
  console.log("  5. Show status");
  console.log("  6. Reset modules");
  console.log("  0. Exit\n");

  while (true) {
    try {
      const choice = await ask("Select option (0-6): ");

      switch (choice) {
        case "1":
          readline.close();
          await runAllSeeds(options);
          return;

        case "2":
          const modules = await ask("Enter module names (space-separated): ");
          readline.close();
          await runSpecificModules(modules.split(" ").filter(Boolean), options);
          return;

        case "3":
          await listModules();
          continue;

        case "4":
          const check = await ask(
            "Enter check name (or press Enter for all): "
          );
          readline.close();
          await verifyData(check || undefined, options);
          return;

        case "5":
          await showStatus(options);
          continue;

        case "6":
          const resetModulesInput = await ask(
            "Enter module names to reset (or press Enter for all): "
          );
          readline.close();
          await resetModules(
            resetModulesInput
              ? resetModulesInput.split(" ").filter(Boolean)
              : [],
            options
          );
          return;

        case "0":
          console.log("👋 Goodbye!");
          readline.close();
          return;

        default:
          console.log("Invalid option. Please choose 0-6.");
      }
    } catch (error) {
      console.error(
        "❌ Error:",
        error instanceof Error ? error.message : error
      );
      readline.close();
      process.exit(1);
    }
  }
}

// Error handling
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  process.exit(1);
});

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.help();
}
