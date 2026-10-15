#!/usr/bin/env ts-node

import { PrismaClient } from "@prisma/client";
import * as fs from "fs/promises";
import * as path from "path";

interface TestDataScenario {
  name: string;
  description: string;
  itemCount: number;
  enzymeConfigCount: number;
  includeEdgeCases: boolean;
  includeInvalidData: boolean;
}

interface GeneratedTestData {
  scenario: TestDataScenario;
  items: any[];
  enzymeConfigs: any[];
  edgeCases: string[];
  validationIssues: string[];
  generationTime: number;
}

class TestDataGenerator {
  private prisma: PrismaClient;
  private testDataPath: string;
  private generatedScenarios: GeneratedTestData[] = [];

  constructor() {
    this.prisma = new PrismaClient();
    this.testDataPath = path.join(__dirname, "test-data");
  }

  // Generate realistic enzyme names and descriptions
  private generateEnzymeData(index: number): {
    name: string;
    description: string;
    category: string;
  } {
    const enzymeTypes = [
      {
        name: "Termamyl",
        description: "Alpha amylase enzyme for liquefaction",
        category: "LIQUIFACTION",
      },
      {
        name: "Saczyme",
        description: "Glucoamylase enzyme for saccharification",
        category: "SACCHARIFICATION",
      },
      {
        name: "Viscoferm",
        description: "Beta glucanase enzyme for viscosity reduction",
        category: "VISCOSITY",
      },
      {
        name: "Liquozyme",
        description: "Pullulanase enzyme for liquefaction",
        category: "LIQUIFACTION",
      },
      {
        name: "Alphalase",
        description: "Thermostable alpha amylase",
        category: "LIQUIFACTION",
      },
      {
        name: "Diazyme",
        description: "Multi-enzyme complex for saccharification",
        category: "SACCHARIFICATION",
      },
      {
        name: "Laminex",
        description: "Xylanase enzyme for viscosity control",
        category: "VISCOSITY",
      },
      {
        name: "Amylex",
        description: "High-temperature alpha amylase",
        category: "LIQUIFACTION",
      },
    ];

    const baseEnzyme = enzymeTypes[index % enzymeTypes.length];
    const variant = Math.floor(index / enzymeTypes.length) + 1;

    return {
      name: `${baseEnzyme.name} ${variant}X`,
      description: `${baseEnzyme.description} - Variant ${variant}`,
      category: baseEnzyme.category,
    };
  }

  // Generate test items with various patterns
  private generateTestItems(scenario: TestDataScenario): any[] {
    const items = [];

    for (let i = 1; i <= scenario.itemCount; i++) {
      const enzymeData = this.generateEnzymeData(i);
      const itemNumber = `TEST-ENZ-${scenario.name.toUpperCase()}-${i
        .toString()
        .padStart(4, "0")}`;
      const erpId = `ERP-${scenario.name.toUpperCase()}-${i
        .toString()
        .padStart(6, "0")}`;

      const item = {
        erpId,
        itemNumber,
        itemName: enzymeData.name,
        itemType: "Enzyme",
        itemDescription: enzymeData.description,
        createdBy: `test-generator-${scenario.name}`,
        active: true,
        itemRevision: 1,
        schemaVersion: "test-v1.0",
      };

      // Add edge cases if requested
      if (scenario.includeEdgeCases) {
        if (i % 10 === 0) {
          // Every 10th item has special characteristics
          item.itemName = `${enzymeData.name} (Special Edition)`;
          item.itemDescription = `${enzymeData.description} - Special formulation with extended shelf life`;
        }

        if (i % 15 === 0) {
          // Every 15th item is inactive
          item.active = false;
        }

        if (i % 20 === 0) {
          // Every 20th item has a different revision
          item.itemRevision = 2;
        }
      }

      items.push(item);
    }

    return items;
  }

  // Generate enzyme configurations with realistic dosing data
  private generateEnzymeConfigs(
    items: any[],
    scenario: TestDataScenario
  ): any[] {
    const configs = [];
    const edgeCases: string[] = [];
    const validationIssues: string[] = [];

    for (
      let i = 0;
      i < Math.min(items.length, scenario.enzymeConfigCount);
      i++
    ) {
      const item = items[i];
      const enzymeData = this.generateEnzymeData(i + 1);

      // Realistic dosing ranges based on category
      let doseRange = { min: 0.1, max: 0.5 };
      let instructions = "Add during mashing process";

      switch (enzymeData.category) {
        case "LIQUIFACTION":
          doseRange = { min: 0.1, max: 0.3 };
          instructions = "Add with water/backset before grain addition";
          break;
        case "SACCHARIFICATION":
          doseRange = { min: 0.3, max: 0.8 };
          instructions = "Add at 152°F during temperature crash";
          break;
        case "VISCOSITY":
          doseRange = { min: 0.05, max: 0.2 };
          instructions = "Add with grain during mashing";
          break;
      }

      const config = {
        itemId: item.id || `temp-id-${i}`, // Will be updated after item creation
        category: enzymeData.category,
        dosePerMetricTon:
          Math.random() * (doseRange.max - doseRange.min) + doseRange.min,
        instructions,
        active: item.active,
        createdBy: `test-generator-${scenario.name}`,
        schemaVersion: "test-v1.0",
      };

      // Add edge cases if requested
      if (scenario.includeEdgeCases) {
        if (i % 12 === 0) {
          // Very high dose (edge case)
          config.dosePerMetricTon = 2.0;
          edgeCases.push(
            `High dose configuration for ${item.itemName}: ${config.dosePerMetricTon}`
          );
        }

        if (i % 18 === 0) {
          // Very low dose (edge case)
          config.dosePerMetricTon = 0.01;
          edgeCases.push(
            `Low dose configuration for ${item.itemName}: ${config.dosePerMetricTon}`
          );
        }

        if (i % 25 === 0) {
          // Complex instructions (edge case)
          config.instructions = `Multi-step process: 1) Pre-heat to 85°C, 2) Add ${config.dosePerMetricTon}kg per metric ton, 3) Hold for 30 minutes, 4) Cool to 65°C, 5) Monitor viscosity`;
          edgeCases.push(`Complex instructions for ${item.itemName}`);
        }
      }

      // Add invalid data if requested (for testing validation)
      if (scenario.includeInvalidData) {
        if (i % 30 === 0) {
          // Negative dose (invalid)
          config.dosePerMetricTon = -0.1;
          validationIssues.push(`Invalid negative dose for ${item.itemName}`);
        }

        if (i % 35 === 0) {
          // Empty instructions (invalid)
          config.instructions = "";
          validationIssues.push(`Empty instructions for ${item.itemName}`);
        }
      }

      configs.push(config);
    }

    return configs;
  }

  // Create test data for a specific scenario
  async generateScenarioData(
    scenario: TestDataScenario
  ): Promise<GeneratedTestData> {
    console.log(`\n🔧 Generating test data for scenario: ${scenario.name}`);
    console.log(`   Description: ${scenario.description}`);
    console.log(
      `   Items: ${scenario.itemCount}, Configs: ${scenario.enzymeConfigCount}`
    );

    const startTime = Date.now();
    const edgeCases: string[] = [];
    const validationIssues: string[] = [];

    try {
      // Generate test items
      const items = this.generateTestItems(scenario);

      // Create items in database
      const createdItems = [];
      for (const itemData of items) {
        try {
          const item = await this.prisma.item.create({
            data: itemData,
          });
          createdItems.push(item);
        } catch (error: any) {
          if (error.code === "P2002") {
            // Item already exists, find it
            const existingItem = await this.prisma.item.findUnique({
              where: { erpId: itemData.erpId },
            });
            if (existingItem) {
              createdItems.push(existingItem);
            }
          } else {
            throw error;
          }
        }
      }

      // Generate enzyme configurations
      const configsData = this.generateEnzymeConfigs(createdItems, scenario);

      // Create enzyme configurations in database
      const createdConfigs = [];
      for (const configData of configsData) {
        try {
          const config = await this.prisma.enzymeConfiguration.create({
            data: {
              ...configData,
              itemId: createdItems[configsData.indexOf(configData)].id,
            },
          });
          createdConfigs.push(config);
        } catch (error: any) {
          if (error.code === "P2002") {
            // Configuration already exists, skip
            validationIssues.push(
              `Duplicate configuration for item ${configData.itemId}`
            );
          } else {
            throw error;
          }
        }
      }

      const generationTime = Date.now() - startTime;

      const result: GeneratedTestData = {
        scenario,
        items: createdItems,
        enzymeConfigs: createdConfigs,
        edgeCases,
        validationIssues,
        generationTime,
      };

      this.generatedScenarios.push(result);

      console.log(
        `✅ Generated ${createdItems.length} items and ${createdConfigs.length} configurations`
      );
      console.log(
        `   Edge cases: ${edgeCases.length}, Validation issues: ${validationIssues.length}`
      );
      console.log(`   Generation time: ${generationTime}ms`);

      return result;
    } catch (error) {
      console.error(`❌ Failed to generate scenario data: ${error}`);
      throw error;
    }
  }

  // Cleanup test data for a scenario
  async cleanupScenarioData(scenarioName: string): Promise<void> {
    console.log(`🧹 Cleaning up test data for scenario: ${scenarioName}`);

    try {
      // Delete enzyme configurations first
      const deletedConfigs = await this.prisma.enzymeConfiguration.deleteMany({
        where: {
          createdBy: `test-generator-${scenarioName}`,
        },
      });

      // Delete items
      const deletedItems = await this.prisma.item.deleteMany({
        where: {
          createdBy: `test-generator-${scenarioName}`,
        },
      });

      console.log(
        `✅ Cleaned up ${deletedConfigs.count} configurations and ${deletedItems.count} items`
      );
    } catch (error) {
      console.error(`❌ Failed to cleanup scenario data: ${error}`);
      throw error;
    }
  }

  // Generate predefined test scenarios
  async generatePredefinedScenarios(): Promise<void> {
    const scenarios: TestDataScenario[] = [
      {
        name: "small-dataset",
        description: "Small dataset for quick testing",
        itemCount: 10,
        enzymeConfigCount: 10,
        includeEdgeCases: false,
        includeInvalidData: false,
      },
      {
        name: "medium-dataset",
        description: "Medium dataset with edge cases",
        itemCount: 50,
        enzymeConfigCount: 45,
        includeEdgeCases: true,
        includeInvalidData: false,
      },
      {
        name: "large-dataset",
        description: "Large dataset for performance testing",
        itemCount: 200,
        enzymeConfigCount: 180,
        includeEdgeCases: true,
        includeInvalidData: false,
      },
      {
        name: "validation-test",
        description: "Dataset with validation issues for error testing",
        itemCount: 30,
        enzymeConfigCount: 30,
        includeEdgeCases: true,
        includeInvalidData: true,
      },
      {
        name: "production-like",
        description: "Production-like dataset with realistic data distribution",
        itemCount: 100,
        enzymeConfigCount: 85,
        includeEdgeCases: true,
        includeInvalidData: false,
      },
    ];

    for (const scenario of scenarios) {
      await this.generateScenarioData(scenario);
    }
  }

  // Generate comprehensive test report
  async generateTestDataReport(): Promise<void> {
    console.log("\n📈 Generating Test Data Report...");

    await fs.mkdir(this.testDataPath, { recursive: true });

    const reportPath = path.join(this.testDataPath, "test-data-report.json");

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalScenarios: this.generatedScenarios.length,
        totalItems: this.generatedScenarios.reduce(
          (sum, s) => sum + s.items.length,
          0
        ),
        totalConfigs: this.generatedScenarios.reduce(
          (sum, s) => sum + s.enzymeConfigs.length,
          0
        ),
        totalEdgeCases: this.generatedScenarios.reduce(
          (sum, s) => sum + s.edgeCases.length,
          0
        ),
        totalValidationIssues: this.generatedScenarios.reduce(
          (sum, s) => sum + s.validationIssues.length,
          0
        ),
        totalGenerationTime: this.generatedScenarios.reduce(
          (sum, s) => sum + s.generationTime,
          0
        ),
      },
      scenarios: this.generatedScenarios.map((s) => ({
        name: s.scenario.name,
        description: s.scenario.description,
        itemCount: s.items.length,
        configCount: s.enzymeConfigs.length,
        edgeCaseCount: s.edgeCases.length,
        validationIssueCount: s.validationIssues.length,
        generationTime: s.generationTime,
        edgeCases: s.edgeCases,
        validationIssues: s.validationIssues,
      })),
    };

    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    console.log(`✅ Test data report saved: ${reportPath}`);
    console.log(`📊 Summary:`);
    console.log(`   Total Scenarios: ${report.summary.totalScenarios}`);
    console.log(`   Total Items: ${report.summary.totalItems}`);
    console.log(`   Total Configurations: ${report.summary.totalConfigs}`);
    console.log(`   Total Edge Cases: ${report.summary.totalEdgeCases}`);
    console.log(
      `   Total Validation Issues: ${report.summary.totalValidationIssues}`
    );
    console.log(
      `   Total Generation Time: ${report.summary.totalGenerationTime}ms`
    );
  }

  // Main execution
  async runTestDataGeneration(): Promise<void> {
    console.log("🧪 Test Data Generator");
    console.log("======================\n");

    try {
      await this.generatePredefinedScenarios();
      await this.generateTestDataReport();

      console.log("\n✅ Test data generation completed successfully!");
    } catch (error) {
      console.error("\n❌ Test data generation failed:", error);
      throw error;
    }
  }

  // Cleanup all test data
  async cleanupAllTestData(): Promise<void> {
    console.log("\n🧹 Cleaning up all test data...");

    try {
      for (const scenario of this.generatedScenarios) {
        await this.cleanupScenarioData(scenario.scenario.name);
      }

      console.log("✅ All test data cleaned up successfully!");
    } catch (error) {
      console.error("❌ Failed to cleanup test data:", error);
      throw error;
    }
  }
}

// Main execution
async function main() {
  const generator = new TestDataGenerator();

  try {
    const action = process.argv[2] || "generate";

    switch (action) {
      case "generate":
        await generator.runTestDataGeneration();
        break;
      case "cleanup":
        await generator.cleanupAllTestData();
        break;
      default:
        console.log("Usage: ts-node test-data-generator.ts [generate|cleanup]");
        process.exit(1);
    }
  } catch (error) {
    console.error("Test data generator execution failed:", error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { TestDataGenerator, TestDataScenario, GeneratedTestData };
