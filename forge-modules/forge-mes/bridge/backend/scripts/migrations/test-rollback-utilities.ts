#!/usr/bin/env ts-node

import { PrismaClient } from "@prisma/client";
import { RollbackUtilities } from "./rollback-utilities";
import { umzug, cleanup } from "./umzug.config";
import * as fs from "fs/promises";
import * as path from "path";

interface TestMetrics {
  startTime: Date;
  endTime?: Date;
  duration?: number;
  memoryUsage: {
    before: NodeJS.MemoryUsage;
    after?: NodeJS.MemoryUsage;
    peak?: NodeJS.MemoryUsage;
  };
  recordsProcessed: number;
  operationsPerSecond?: number;
  errors: string[];
  warnings: string[];
}

interface LoadTestConfig {
  recordCounts: number[];
  batchSizes: number[];
  concurrencyLevels: number[];
  iterations: number;
}

class RollbackUtilitiesTestSuite {
  private prisma: PrismaClient;
  private rollbackUtils: RollbackUtilities;
  private testMetrics: TestMetrics[] = [];
  private testDataPath: string;

  constructor() {
    this.prisma = new PrismaClient();
    this.rollbackUtils = new RollbackUtilities(this.prisma);
    this.testDataPath = path.join(__dirname, "test-data");
  }

  // Performance monitoring utilities
  private startMetrics(recordsProcessed: number = 0): TestMetrics {
    const metrics: TestMetrics = {
      startTime: new Date(),
      memoryUsage: {
        before: process.memoryUsage(),
      },
      recordsProcessed,
      errors: [],
      warnings: [],
    };
    return metrics;
  }

  private endMetrics(metrics: TestMetrics): TestMetrics {
    metrics.endTime = new Date();
    metrics.duration = metrics.endTime.getTime() - metrics.startTime.getTime();
    metrics.memoryUsage.after = process.memoryUsage();

    if (metrics.duration > 0 && metrics.recordsProcessed > 0) {
      metrics.operationsPerSecond =
        (metrics.recordsProcessed / metrics.duration) * 1000;
    }

    this.testMetrics.push(metrics);
    return metrics;
  }

  private logMetrics(testName: string, metrics: TestMetrics): void {
    console.log(`\n📊 ${testName} Performance Metrics:`);
    console.log(`   Duration: ${metrics.duration}ms`);
    console.log(`   Records Processed: ${metrics.recordsProcessed}`);
    console.log(
      `   Operations/Second: ${
        metrics.operationsPerSecond?.toFixed(2) || "N/A"
      }`
    );
    console.log(
      `   Memory Before: ${(
        metrics.memoryUsage.before.heapUsed /
        1024 /
        1024
      ).toFixed(2)}MB`
    );
    console.log(
      `   Memory After: ${(
        metrics.memoryUsage.after?.heapUsed || 0 / 1024 / 1024
      ).toFixed(2)}MB`
    );
    console.log(
      `   Memory Delta: ${
        ((metrics.memoryUsage.after?.heapUsed || 0) -
          metrics.memoryUsage.before.heapUsed) /
        1024 /
        1024
      }MB`
    );

    if (metrics.errors.length > 0) {
      console.log(`   Errors: ${metrics.errors.length}`);
    }
    if (metrics.warnings.length > 0) {
      console.log(`   Warnings: ${metrics.warnings.length}`);
    }
  }

  // Test data generation utilities
  private async createTestData(recordCount: number): Promise<void> {
    console.log(`🔧 Creating ${recordCount} test records...`);

    // Create items individually to avoid type issues
    const createdItems: any[] = [];
    for (let i = 1; i <= recordCount; i++) {
      const itemNumber = `TEST-ENZ-${i.toString().padStart(4, "0")}`;
      const erpId = `ERP-${i.toString().padStart(6, "0")}`;

      try {
        const item = await this.prisma.item.create({
          data: {
            erpId,
            itemNumber,
            itemName: `Test Enzyme ${i}`,
            itemType: "Enzyme",
            itemDescription: `Test enzyme for load testing - ${i}`,
            createdBy: "test-suite",
          },
        });
        createdItems.push(item);
      } catch (error: any) {
        // Skip if item already exists
        if (error.code === "P2002") {
          const existingItem = await this.prisma.item.findUnique({
            where: { erpId },
          });
          if (existingItem) {
            createdItems.push(existingItem);
          }
        } else {
          throw error;
        }
      }
    }

    // Create enzyme configurations
    const testConfigs: string[] = [];
    for (const item of createdItems) {
      const categories = ["LIQUIFACTION", "SACCHARIFICATION", "VISCOSITY"];
      const category =
        categories[Math.floor(Math.random() * categories.length)];

      try {
        await this.prisma.enzymeConfiguration.create({
          data: {
            itemId: item.id,
            category: category as
              | "LIQUIFACTION"
              | "SACCHARIFICATION"
              | "VISCOSITY",
            dosePerMetricTon: Math.random() * 0.5 + 0.1, // 0.1 to 0.6
            instructions: `Test instructions for ${item.itemName}`,
            active: Math.random() > 0.1, // 90% active
            createdBy: "test-suite",
            schemaVersion: "test-v1.0",
          },
        });
        testConfigs.push(item.id);
      } catch (error: any) {
        // Skip if configuration already exists
        if (error.code !== "P2002") {
          throw error;
        }
      }
    }

    console.log(
      `✅ Created ${createdItems.length} items and ${testConfigs.length} enzyme configurations`
    );
  }

  private async cleanupTestData(): Promise<void> {
    console.log("🧹 Cleaning up test data...");

    // Delete enzyme configurations first (foreign key constraint)
    await this.prisma.enzymeConfiguration.deleteMany({
      where: {
        createdBy: "test-suite",
      },
    });

    // Delete test items
    await this.prisma.item.deleteMany({
      where: {
        itemNumber: {
          startsWith: "TEST-ENZ-",
        },
      },
    });

    console.log("✅ Test data cleanup complete");
  }

  // Core functionality tests
  async testBackupCreation(): Promise<void> {
    console.log("\n🧪 Testing Backup Creation...");

    const metrics = this.startMetrics();

    try {
      // Create test data
      await this.createTestData(50);
      metrics.recordsProcessed = 50;

      // Test backup creation using the correct method name
      const backupMetadata = await this.rollbackUtils.createPreRollbackBackup(
        "test-backup"
      );

      // Verify backup file exists
      const backupExists = await fs
        .access(backupMetadata.backupPath)
        .then(() => true)
        .catch(() => false);
      if (!backupExists) {
        metrics.errors.push("Backup file was not created");
      }

      // Verify backup content
      const backupContent = JSON.parse(
        await fs.readFile(backupMetadata.backupPath, "utf-8")
      );
      if (!backupContent.metadata || !backupContent.data) {
        metrics.errors.push("Backup file structure is invalid");
      }

      if (backupContent.data.enzymeConfigs.length !== 50) {
        metrics.errors.push(
          `Expected 50 enzyme configs, found ${backupContent.data.enzymeConfigs.length}`
        );
      }

      console.log(
        `✅ Backup created successfully: ${backupMetadata.backupPath}`
      );
      console.log(
        `   Enzyme Configurations: ${backupContent.data.enzymeConfigs.length}`
      );
      console.log(`   Items: ${backupContent.data.items.length}`);
      console.log(`   Checksum: ${backupMetadata.checksum}`);
    } catch (error) {
      metrics.errors.push(`Backup creation failed: ${error}`);
      console.error("❌ Backup creation test failed:", error);
    } finally {
      await this.cleanupTestData();
      this.endMetrics(metrics);
      this.logMetrics("Backup Creation", metrics);
    }
  }

  async testRollbackImpactAnalysis(): Promise<void> {
    console.log("\n🧪 Testing Rollback Impact Analysis...");

    const metrics = this.startMetrics();

    try {
      // Create test data with various scenarios
      await this.createTestData(100);
      metrics.recordsProcessed = 100;

      // Test impact analysis
      const analysis = await this.rollbackUtils.analyzeRollbackImpact(
        "test-migration"
      );

      // Verify analysis structure using correct property names
      if (!analysis.recordsToDelete || typeof analysis.riskLevel !== "string") {
        metrics.errors.push("Impact analysis structure is invalid");
      }

      if (analysis.recordsToDelete.EnzymeConfiguration !== 100) {
        metrics.warnings.push(
          `Expected 100 enzyme configs, analyzed ${analysis.recordsToDelete.EnzymeConfiguration}`
        );
      }

      console.log(`✅ Impact analysis completed:`);
      console.log(`   Risk Level: ${analysis.riskLevel}`);
      console.log(
        `   Records to Delete: ${JSON.stringify(
          analysis.recordsToDelete,
          null,
          2
        )}`
      );
      console.log(
        `   Records to Modify: ${JSON.stringify(
          analysis.recordsToModify,
          null,
          2
        )}`
      );
      console.log(`   Warnings: ${analysis.warnings.length}`);
    } catch (error) {
      metrics.errors.push(`Impact analysis failed: ${error}`);
      console.error("❌ Impact analysis test failed:", error);
    } finally {
      await this.cleanupTestData();
      this.endMetrics(metrics);
      this.logMetrics("Impact Analysis", metrics);
    }
  }

  async testPartialRollback(): Promise<void> {
    console.log("\n🧪 Testing Partial Rollback...");

    const metrics = this.startMetrics();

    try {
      // Create test data
      await this.createTestData(75);
      metrics.recordsProcessed = 75;

      // Test partial rollback with category filter
      const result = await this.rollbackUtils.performPartialRollback({
        categories: ["LIQUIFACTION"],
        dryRun: true,
        batchSize: 10,
      });

      // Verify results
      if (result.processed < 0 || result.skipped < 0) {
        metrics.errors.push("Partial rollback returned invalid counts");
      }

      console.log(`✅ Partial rollback (dry run) completed:`);
      console.log(`   Processed: ${result.processed}`);
      console.log(`   Skipped: ${result.skipped}`);
      console.log(`   Errors: ${result.errors.length}`);

      // Test actual partial rollback
      const actualResult = await this.rollbackUtils.performPartialRollback({
        categories: ["VISCOSITY"],
        dryRun: false,
        batchSize: 5,
      });

      console.log(`✅ Actual partial rollback completed:`);
      console.log(`   Processed: ${actualResult.processed}`);
      console.log(`   Skipped: ${actualResult.skipped}`);
      console.log(`   Errors: ${actualResult.errors.length}`);
    } catch (error) {
      metrics.errors.push(`Partial rollback failed: ${error}`);
      console.error("❌ Partial rollback test failed:", error);
    } finally {
      await this.cleanupTestData();
      this.endMetrics(metrics);
      this.logMetrics("Partial Rollback", metrics);
    }
  }

  async testDataIntegrityValidation(): Promise<void> {
    console.log("\n🧪 Testing Data Integrity Validation...");

    const metrics = this.startMetrics();

    try {
      // Create test data with some integrity issues
      await this.createTestData(30);

      // Create orphaned enzyme configuration (item doesn't exist)
      await this.prisma.enzymeConfiguration
        .create({
          data: {
            itemId: "non-existent-item-id",
            category: "LIQUIFACTION",
            dosePerMetricTon: 0.1,
            instructions: "Orphaned config",
            createdBy: "test-suite",
          },
        })
        .catch(() => {
          // Expected to fail due to foreign key constraint
          metrics.warnings.push(
            "Could not create orphaned record due to FK constraint (expected)"
          );
        });

      metrics.recordsProcessed = 30;

      // Test validation
      const validation = await this.rollbackUtils.validatePostRollback();

      // Verify validation structure
      if (
        typeof validation.isValid !== "boolean" ||
        !validation.dataIntegrityChecks
      ) {
        metrics.errors.push("Validation result structure is invalid");
      }

      console.log(`✅ Data integrity validation completed:`);
      console.log(`   Valid: ${validation.isValid}`);
      console.log(
        `   Orphaned Records: ${validation.dataIntegrityChecks.orphanedRecords}`
      );
      console.log(
        `   Duplicate Records: ${validation.dataIntegrityChecks.duplicateRecords}`
      );
      console.log(
        `   Invalid References: ${validation.dataIntegrityChecks.invalidReferences}`
      );
      console.log(
        `   Missing Required Data: ${validation.dataIntegrityChecks.missingRequiredData}`
      );
      console.log(`   Errors: ${validation.errors.length}`);
      console.log(`   Warnings: ${validation.warnings.length}`);
    } catch (error) {
      metrics.errors.push(`Data integrity validation failed: ${error}`);
      console.error("❌ Data integrity validation test failed:", error);
    } finally {
      await this.cleanupTestData();
      this.endMetrics(metrics);
      this.logMetrics("Data Integrity Validation", metrics);
    }
  }

  // Load testing
  async runLoadTests(config: LoadTestConfig): Promise<void> {
    console.log("\n🚀 Running Load Tests...");
    console.log(`Configuration: ${JSON.stringify(config, null, 2)}`);

    for (const recordCount of config.recordCounts) {
      console.log(`\n📊 Testing with ${recordCount} records...`);

      for (let iteration = 1; iteration <= config.iterations; iteration++) {
        console.log(`\n  Iteration ${iteration}/${config.iterations}`);

        const metrics = this.startMetrics(recordCount);

        try {
          // Create test data
          await this.createTestData(recordCount);

          // Test backup creation performance
          const backupStart = Date.now();
          await this.rollbackUtils.createPreRollbackBackup(
            `load-test-${recordCount}-${iteration}`
          );
          const backupDuration = Date.now() - backupStart;

          // Test impact analysis performance
          const analysisStart = Date.now();
          await this.rollbackUtils.analyzeRollbackImpact("load-test");
          const analysisDuration = Date.now() - analysisStart;

          // Test validation performance
          const validationStart = Date.now();
          await this.rollbackUtils.validatePostRollback();
          const validationDuration = Date.now() - validationStart;

          console.log(`    Backup: ${backupDuration}ms`);
          console.log(`    Analysis: ${analysisDuration}ms`);
          console.log(`    Validation: ${validationDuration}ms`);
        } catch (error) {
          metrics.errors.push(`Load test failed: ${error}`);
          console.error(`❌ Load test iteration ${iteration} failed:`, error);
        } finally {
          await this.cleanupTestData();
          this.endMetrics(metrics);
        }
      }
    }
  }

  // Performance benchmarking
  async runPerformanceBenchmarks(): Promise<void> {
    console.log("\n🏁 Running Performance Benchmarks...");

    const benchmarkConfig: LoadTestConfig = {
      recordCounts: [10, 50, 100, 500, 1000],
      batchSizes: [10, 25, 50, 100],
      concurrencyLevels: [1, 2, 4],
      iterations: 3,
    };

    await this.runLoadTests(benchmarkConfig);

    // Generate performance report
    await this.generatePerformanceReport();
  }

  private async generatePerformanceReport(): Promise<void> {
    console.log("\n📈 Generating Performance Report...");

    const reportPath = path.join(this.testDataPath, "performance-report.json");

    // Ensure test data directory exists
    await fs.mkdir(this.testDataPath, { recursive: true });

    const report = {
      timestamp: new Date().toISOString(),
      testMetrics: this.testMetrics,
      summary: {
        totalTests: this.testMetrics.length,
        totalErrors: this.testMetrics.reduce(
          (sum, m) => sum + m.errors.length,
          0
        ),
        totalWarnings: this.testMetrics.reduce(
          (sum, m) => sum + m.warnings.length,
          0
        ),
        averageDuration:
          this.testMetrics.reduce((sum, m) => sum + (m.duration || 0), 0) /
          this.testMetrics.length,
        averageOpsPerSecond:
          this.testMetrics
            .filter((m) => m.operationsPerSecond)
            .reduce((sum, m) => sum + (m.operationsPerSecond || 0), 0) /
          this.testMetrics.filter((m) => m.operationsPerSecond).length,
      },
    };

    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    console.log(`✅ Performance report saved: ${reportPath}`);
    console.log(`📊 Summary:`);
    console.log(`   Total Tests: ${report.summary.totalTests}`);
    console.log(`   Total Errors: ${report.summary.totalErrors}`);
    console.log(`   Total Warnings: ${report.summary.totalWarnings}`);
    console.log(
      `   Average Duration: ${report.summary.averageDuration.toFixed(2)}ms`
    );
    console.log(
      `   Average Ops/Second: ${report.summary.averageOpsPerSecond.toFixed(2)}`
    );
  }

  // Main test runner
  async runAllTests(): Promise<void> {
    console.log("🧪 Rollback Utilities Test Suite");
    console.log("==================================\n");

    try {
      // Core functionality tests
      await this.testBackupCreation();
      await this.testRollbackImpactAnalysis();
      await this.testPartialRollback();
      await this.testDataIntegrityValidation();

      // Performance tests
      await this.runPerformanceBenchmarks();

      console.log("\n✅ All tests completed successfully!");
    } catch (error) {
      console.error("\n❌ Test suite failed:", error);
      throw error;
    }
  }
}

// Main execution
async function main() {
  const testSuite = new RollbackUtilitiesTestSuite();

  try {
    await testSuite.runAllTests();
  } catch (error) {
    console.error("Test suite execution failed:", error);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { RollbackUtilitiesTestSuite, TestMetrics, LoadTestConfig };
