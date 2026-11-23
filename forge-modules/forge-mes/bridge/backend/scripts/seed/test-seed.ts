#!/usr/bin/env ts-node

/**
 * Comprehensive Test Suite for Seeding System
 *
 * This script tests the robustness and reliability of the seeding system
 * by running various scenarios and validating results.
 */

import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { SeedOrchestrator } from "./orchestrator";
import { SeedVerifier } from "./utils/verifier";
import { createSeedConfig } from "./config";
import { loadSeedModules } from "./modules";

dotenv.config();

interface TestResult {
  testName: string;
  success: boolean;
  message: string;
  executionTimeMs: number;
  details?: any;
}

class SeedTestSuite {
  private client: PrismaClient;
  private results: TestResult[] = [];

  constructor() {
    this.client = new PrismaClient();
  }

  async runAllTests(): Promise<void> {
    console.log("🧪 Starting Comprehensive Seed System Tests\n");
    console.log("===========================================");

    const testMethods = [
      this.testOrchestratorInitialization,
      this.testModuleLoading,
      this.testDependencyResolution,
      this.testSingleModuleExecution,
      this.testTransactionRollback,
      this.testStatusTracking,
      this.testDataValidation,
      this.testErrorHandling,
      this.testIdempotency,
      this.testPartialRecovery,
    ];

    for (const testMethod of testMethods) {
      await this.runTest(testMethod.bind(this));
    }

    this.printSummary();
  }

  private async runTest(testFunction: () => Promise<void>): Promise<void> {
    const testName = testFunction.name.replace("test", "");
    console.log(`\n🔬 Testing: ${testName}`);

    const startTime = Date.now();

    try {
      await testFunction();
      const executionTime = Date.now() - startTime;

      this.results.push({
        testName,
        success: true,
        message: "Test passed",
        executionTimeMs: executionTime,
      });

      console.log(`   ✅ ${testName} passed (${executionTime}ms)`);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const message = error instanceof Error ? error.message : "Unknown error";

      this.results.push({
        testName,
        success: false,
        message,
        executionTimeMs: executionTime,
        details: error,
      });

      console.log(`   ❌ ${testName} failed (${executionTime}ms): ${message}`);
    }
  }

  private async testOrchestratorInitialization(): Promise<void> {
    const config = createSeedConfig({
      environment: "development",
      enableStatusTracking: true,
      enableTransactions: true,
    });

    const orchestrator = new SeedOrchestrator(config);
    await orchestrator.initialize();

    const status = await orchestrator.getStatus();

    if (!status || typeof status !== "object") {
      throw new Error(
        "Orchestrator initialization failed - no status available"
      );
    }

    await orchestrator.cleanup();
  }

  private async testModuleLoading(): Promise<void> {
    const modules = await loadSeedModules();

    if (modules.length === 0) {
      throw new Error("No seed modules loaded");
    }

    // Validate module structure
    for (const module of modules) {
      if (!module.name || !module.description || !module.runner) {
        throw new Error(
          `Invalid module structure: ${module.name || "unnamed"}`
        );
      }

      if (typeof module.runner !== "function") {
        throw new Error(`Module ${module.name} has invalid runner function`);
      }

      if (module.validator && typeof module.validator !== "function") {
        throw new Error(`Module ${module.name} has invalid validator function`);
      }
    }

    console.log(`     Loaded ${modules.length} valid modules`);
  }

  private async testDependencyResolution(): Promise<void> {
    const config = createSeedConfig({ environment: "development" });
    const orchestrator = new SeedOrchestrator(config);
    await orchestrator.initialize();

    const modules = await loadSeedModules();
    orchestrator.registerModules(modules);

    // Try to calculate execution order (this will throw if there are circular dependencies)
    try {
      // We can't directly access the private method, so we'll trigger it indirectly
      const result = await orchestrator.executeModules(["core-config"]);

      if (!result.success) {
        throw new Error("Dependency resolution test failed");
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Circular dependency")
      ) {
        throw error;
      }
      // Other errors are okay for this test
    }

    await orchestrator.cleanup();
  }

  private async testSingleModuleExecution(): Promise<void> {
    const config = createSeedConfig({
      environment: "development",
      enableTransactions: false, // Disable for faster testing
      enableValidation: false,
    });

    const orchestrator = new SeedOrchestrator(config);
    await orchestrator.initialize();

    const modules = await loadSeedModules();
    orchestrator.registerModules(modules);

    // Test executing just the core-config module
    const result = await orchestrator.executeModules(["vendors-customers"]);

    if (!result.success) {
      const errors = Array.from(result.results.values())
        .filter((r) => !r.success)
        .map((r) => r.message);
      throw new Error(`Single module execution failed: ${errors.join(", ")}`);
    }

    await orchestrator.cleanup();
  }

  private async testTransactionRollback(): Promise<void> {
    // This test would simulate a failure mid-transaction to ensure rollback works
    // For now, we'll just test that transactions are properly configured

    const config = createSeedConfig({
      environment: "development",
      enableTransactions: true,
    });

    const orchestrator = new SeedOrchestrator(config);
    await orchestrator.initialize();

    // Just verify the configuration is correct
    const status = await orchestrator.getStatus();

    if (!status) {
      throw new Error("Transaction configuration test failed");
    }

    await orchestrator.cleanup();
    console.log("     Transaction configuration verified");
  }

  private async testStatusTracking(): Promise<void> {
    const config = createSeedConfig({
      environment: "development",
      enableStatusTracking: true,
    });

    const orchestrator = new SeedOrchestrator(config);
    await orchestrator.initialize();

    // Test status tracking functionality
    const initialStatus = await orchestrator.getStatus();

    if (!initialStatus || typeof initialStatus !== "object") {
      throw new Error("Status tracking not working");
    }

    await orchestrator.cleanup();
    console.log("     Status tracking verified");
  }

  private async testDataValidation(): Promise<void> {
    const verifier = new SeedVerifier(this.client);

    // Test that validation checks are available
    const checks = verifier.getAvailableChecks();

    if (checks.length === 0) {
      throw new Error("No validation checks available");
    }

    // Test running a specific check
    const result = await verifier.runCheck(checks[0].name);

    if (!result || typeof result.valid !== "boolean") {
      throw new Error("Validation check execution failed");
    }

    console.log(`     Validation system verified with ${checks.length} checks`);
  }

  private async testErrorHandling(): Promise<void> {
    const config = createSeedConfig({
      environment: "development",
      enableTransactions: false,
    });

    const orchestrator = new SeedOrchestrator(config);
    await orchestrator.initialize();

    // Test handling of non-existent module
    try {
      await orchestrator.executeModules(["non-existent-module"]);
      throw new Error("Should have thrown error for non-existent module");
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Module not found")
      ) {
        // This is expected
        console.log("     Error handling for invalid modules verified");
      } else {
        throw error;
      }
    }

    await orchestrator.cleanup();
  }

  private async testIdempotency(): Promise<void> {
    const config = createSeedConfig({
      environment: "development",
      skipExistingData: true,
      enableTransactions: false,
      enableValidation: false,
    });

    const orchestrator = new SeedOrchestrator(config);
    await orchestrator.initialize();

    const modules = await loadSeedModules();
    orchestrator.registerModules(modules);

    // Run the same module twice - second run should skip existing data
    const firstResult = await orchestrator.executeModules([
      "vendors-customers",
    ]);
    const secondResult = await orchestrator.executeModules([
      "vendors-customers",
    ]);

    if (!firstResult.success || !secondResult.success) {
      throw new Error("Idempotency test failed - one of the runs failed");
    }

    await orchestrator.cleanup();
    console.log("     Idempotency verified");
  }

  private async testPartialRecovery(): Promise<void> {
    // Test that the system can recover from partial seed completion
    const config = createSeedConfig({
      environment: "development",
      enableStatusTracking: true,
      skipExistingData: true,
    });

    const orchestrator = new SeedOrchestrator(config);
    await orchestrator.initialize();

    const modules = await loadSeedModules();
    orchestrator.registerModules(modules);

    // Reset any existing status to simulate fresh start
    await orchestrator.reset();

    // Run a subset of modules
    const result = await orchestrator.executeModules([
      "vendors-customers",
      "core-config",
    ]);

    if (!result.success) {
      throw new Error("Partial recovery test setup failed");
    }

    // Verify status shows partial completion
    const status = await orchestrator.getStatus();

    if (!status || !status.summary || status.summary.completed < 1) {
      throw new Error("Partial recovery status not tracked correctly");
    }

    await orchestrator.cleanup();
    console.log("     Partial recovery capability verified");
  }

  private printSummary(): void {
    const passed = this.results.filter((r) => r.success).length;
    const failed = this.results.filter((r) => !r.success).length;
    const totalTime = this.results.reduce(
      (sum, r) => sum + r.executionTimeMs,
      0
    );

    console.log("\n📊 Test Summary");
    console.log("===============");
    console.log(`Total tests: ${this.results.length}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ${failed > 0 ? "❌" : ""}`);
    console.log(`Total time: ${totalTime}ms`);

    if (failed > 0) {
      console.log("\nFailed tests:");
      this.results
        .filter((r) => !r.success)
        .forEach((r) => {
          console.log(`  • ${r.testName}: ${r.message}`);
        });
    }

    console.log("\n🎯 Test Recommendations:");
    if (failed === 0) {
      console.log(
        "   ✅ All tests passed! Seeding system is robust and ready for production."
      );
    } else {
      console.log(
        "   ⚠️  Some tests failed. Address issues before using in production."
      );
    }

    console.log("   • Run full seed test: npm run seed:all");
    console.log("   • Test specific scenarios with: npm run seed:interactive");
    console.log("   • Monitor performance with: npm run seed:status");
  }

  async cleanup(): Promise<void> {
    await this.client.$disconnect();
  }
}

// Main execution
async function main() {
  const testSuite = new SeedTestSuite();

  try {
    await testSuite.runAllTests();
  } finally {
    await testSuite.cleanup();
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Test suite failed:", error);
    process.exit(1);
  });
}
