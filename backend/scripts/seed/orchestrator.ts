import { PrismaClient } from "@prisma/client";
import { SeedConfig, SeedModule, SeedResult, createSeedConfig } from "./config";
import { SeedLogger } from "./utils/logger";
import { SeedStatusTracker } from "./utils/status-tracker";
import { getDatabaseConnectionInfo } from "./utils/db-info";

export class SeedOrchestrator {
  private client: PrismaClient;
  private config: SeedConfig;
  private logger: SeedLogger;
  private statusTracker: SeedStatusTracker;
  private modules: Map<string, SeedModule> = new Map();
  private executionOrder: string[] = [];

  constructor(config?: Partial<SeedConfig>) {
    this.config = createSeedConfig(config);
    this.logger = new SeedLogger(this.config);
    this.client = new PrismaClient();
    this.statusTracker = new SeedStatusTracker(this.client);
  }

  async initialize(): Promise<void> {
    this.logger.info("orchestrator", "Initializing seed orchestrator");

    // Log database connection information
    const dbInfo = getDatabaseConnectionInfo();
    this.logger.info("orchestrator", `Database: ${dbInfo.formattedInfo}`);

    if (this.config.enableStatusTracking) {
      await this.statusTracker.initializeStatusTable();
      this.logger.debug(
        "orchestrator",
        "Seed status tracking table initialized"
      );
    }

    this.logger.info("orchestrator", `Environment: ${this.config.environment}`);
    this.logger.info(
      "orchestrator",
      `Transaction mode: ${
        this.config.enableTransactions ? "enabled" : "disabled"
      }`
    );
    this.logger.info(
      "orchestrator",
      `Validation: ${this.config.enableValidation ? "enabled" : "disabled"}`
    );
  }

  registerModule(module: SeedModule): void {
    this.modules.set(module.name, module);
    this.logger.debug("orchestrator", `Registered module: ${module.name}`);
  }

  registerModules(modules: SeedModule[]): void {
    modules.forEach((module) => this.registerModule(module));
  }

  private calculateExecutionOrder(): void {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];

    const visit = (moduleName: string): void => {
      if (visiting.has(moduleName)) {
        throw new Error(
          `Circular dependency detected involving module: ${moduleName}`
        );
      }

      if (visited.has(moduleName)) {
        return;
      }

      const module = this.modules.get(moduleName);
      if (!module) {
        throw new Error(`Module not found: ${moduleName}`);
      }

      visiting.add(moduleName);

      // Visit dependencies first
      module.dependencies.forEach((dep) => {
        if (!this.modules.has(dep)) {
          throw new Error(
            `Dependency not found: ${dep} (required by ${moduleName})`
          );
        }
        visit(dep);
      });

      visiting.delete(moduleName);
      visited.add(moduleName);
      order.push(moduleName);
    };

    // Sort modules by priority first, then resolve dependencies
    const moduleArray = Array.from(this.modules.values())
      .filter((m) => m.enabled)
      .sort((a, b) => a.priority - b.priority);

    moduleArray.forEach((module) => {
      if (!visited.has(module.name)) {
        visit(module.name);
      }
    });

    this.executionOrder = order;
    this.logger.info("orchestrator", `Execution order: ${order.join(" → ")}`);
  }

  async executeModule(moduleName: string): Promise<SeedResult> {
    const module = this.modules.get(moduleName);
    if (!module) {
      throw new Error(`Module not found: ${moduleName}`);
    }

    this.logger.info(moduleName, `Starting seed execution`);
    const startTime = Date.now();

    // Check if already seeded and skip if configured to do so
    if (this.config.skipExistingData && this.config.enableStatusTracking) {
      const hasBeenSeeded = await this.statusTracker.hasBeenSeeded(moduleName);
      if (hasBeenSeeded) {
        this.logger.info(moduleName, "Already seeded, skipping");
        return {
          success: true,
          message: "Skipped - already seeded",
          recordsCreated: 0,
          recordsUpdated: 0,
          errors: [],
          warnings: [],
          executionTimeMs: 0,
        };
      }
    }

    let statusId: string | undefined;

    try {
      // Start tracking
      if (this.config.enableStatusTracking) {
        statusId = await this.statusTracker.startSeed(moduleName);
      }

      let result: SeedResult;

      if (this.config.enableTransactions) {
        // Execute in transaction
        result = await this.client.$transaction(async (tx) => {
          return await module.runner(tx as PrismaClient, this.config);
        });
      } else {
        // Execute without transaction
        result = await module.runner(this.client, this.config);
      }

      result.executionTimeMs = Date.now() - startTime;

      // Run validation if enabled
      if (this.config.enableValidation && module.validator) {
        this.logger.debug(moduleName, "Running validation");
        const validation = await module.validator(this.client);

        if (!validation.valid) {
          result.errors.push(...validation.errors);
          result.warnings.push(...validation.warnings);
          result.success = false;
          result.message = `Validation failed: ${validation.errors.join(", ")}`;
        } else {
          this.logger.debug(
            moduleName,
            `Validation passed (${validation.recordsValidated} records)`
          );
        }
      }

      // Complete tracking
      if (this.config.enableStatusTracking && statusId) {
        await this.statusTracker.completeSeed(statusId, result);
      }

      if (result.success) {
        this.logger.success(
          moduleName,
          `Completed successfully - Created: ${result.recordsCreated}, Updated: ${result.recordsUpdated}`
        );
      } else {
        this.logger.failure(moduleName, `Failed: ${result.message}`);
      }

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const result: SeedResult = {
        success: false,
        message: `Execution failed: ${errorMessage}`,
        recordsCreated: 0,
        recordsUpdated: 0,
        errors: [errorMessage],
        warnings: [],
        executionTimeMs: Date.now() - startTime,
      };

      // Complete tracking with error
      if (this.config.enableStatusTracking && statusId) {
        await this.statusTracker.completeSeed(statusId, result);
      }

      this.logger.failure(moduleName, errorMessage);
      return result;
    }
  }

  async executeAll(): Promise<{
    success: boolean;
    results: Map<string, SeedResult>;
  }> {
    this.logger.info("orchestrator", "Starting full seed execution");

    this.calculateExecutionOrder();

    const results = new Map<string, SeedResult>();
    let successful = 0;
    let failed = 0;

    for (let i = 0; i < this.executionOrder.length; i++) {
      const moduleName = this.executionOrder[i];
      this.logger.progress(
        "orchestrator",
        i + 1,
        this.executionOrder.length,
        `Executing ${moduleName}`
      );

      const result = await this.executeModule(moduleName);
      results.set(moduleName, result);

      if (result.success) {
        successful++;
      } else {
        failed++;

        // Stop execution on failure if in strict mode
        if (!this.config.enableTransactions) {
          this.logger.error(
            "orchestrator",
            `Stopping execution due to failure in ${moduleName}`
          );
          break;
        }
      }
    }

    const overallSuccess = failed === 0;
    this.logger.summary(this.executionOrder.length, successful, failed);

    if (overallSuccess) {
      this.logger.success(
        "orchestrator",
        "All seed modules completed successfully"
      );
    } else {
      this.logger.failure("orchestrator", `${failed} module(s) failed`);
    }

    return {
      success: overallSuccess,
      results,
    };
  }

  async executeModules(
    moduleNames: string[]
  ): Promise<{ success: boolean; results: Map<string, SeedResult> }> {
    this.logger.info(
      "orchestrator",
      `Starting partial seed execution: ${moduleNames.join(", ")}`
    );

    // Validate all modules exist
    for (const moduleName of moduleNames) {
      if (!this.modules.has(moduleName)) {
        throw new Error(`Module not found: ${moduleName}`);
      }
    }

    // Create temporary orchestrator with only selected modules
    const tempModules = new Map<string, SeedModule>();
    const selectedWithDeps = new Set<string>(moduleNames);

    // Add dependencies
    const addDependencies = (moduleName: string) => {
      const module = this.modules.get(moduleName);
      if (module) {
        module.dependencies.forEach((dep) => {
          if (!selectedWithDeps.has(dep)) {
            selectedWithDeps.add(dep);
            addDependencies(dep);
          }
        });
      }
    };

    moduleNames.forEach(addDependencies);

    // Copy selected modules
    selectedWithDeps.forEach((name) => {
      const module = this.modules.get(name);
      if (module) {
        tempModules.set(name, module);
      }
    });

    const originalModules = this.modules;
    this.modules = tempModules;

    try {
      const result = await this.executeAll();
      return result;
    } finally {
      this.modules = originalModules;
    }
  }

  async getStatus(): Promise<any> {
    if (!this.config.enableStatusTracking) {
      return { message: "Status tracking is disabled" };
    }

    const statuses = await this.statusTracker.getAllSeedStatuses();
    const summary = await this.statusTracker.getSeedSummary();

    return {
      summary,
      modules: statuses,
      registeredModules: Array.from(this.modules.keys()),
    };
  }

  async reset(moduleNames?: string[]): Promise<void> {
    if (!this.config.enableStatusTracking) {
      this.logger.warn(
        "orchestrator",
        "Status tracking is disabled, cannot reset"
      );
      return;
    }

    if (moduleNames) {
      for (const moduleName of moduleNames) {
        await this.statusTracker.resetSeedStatus(moduleName);
        this.logger.info(
          "orchestrator",
          `Reset status for module: ${moduleName}`
        );
      }
    } else {
      await this.statusTracker.clearAllSeedStatuses();
      this.logger.info("orchestrator", "Reset all seed statuses");
    }
  }

  async cleanup(): Promise<void> {
    this.logger.debug("orchestrator", "Cleaning up resources");
    await this.client.$disconnect();
  }
}
