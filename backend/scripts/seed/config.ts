import { PrismaClient } from "@prisma/client";

export interface SeedConfig {
  environment: "development" | "production" | "staging";
  skipExistingData: boolean;
  enableTransactions: boolean;
  enableValidation: boolean;
  enableStatusTracking: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
  batchSize: number;
}

export interface SeedModule {
  name: string;
  description: string;
  dependencies: string[];
  priority: number;
  enabled: boolean;
  runner: (client: PrismaClient, config: SeedConfig) => Promise<SeedResult>;
  validator?: (client: PrismaClient) => Promise<ValidationResult>;
}

export interface SeedResult {
  success: boolean;
  message: string;
  recordsCreated: number;
  recordsUpdated: number;
  errors: string[];
  warnings: string[];
  executionTimeMs: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  recordsValidated: number;
}

export const DEFAULT_SEED_CONFIG: SeedConfig = {
  environment: (process.env.NODE_ENV as any) || "development",
  skipExistingData: true,
  enableTransactions: true,
  enableValidation: true,
  enableStatusTracking: true,
  logLevel: "info",
  batchSize: 100,
};

export const SEED_PRIORITIES = {
  CORE_CONFIG: 1,
  VENDORS_CUSTOMERS: 2,
  ITEMS: 3,
  RECIPES: 4,
  PROTOCOLS: 5,
  SCHEDULING: 6,
  TESTING: 7,
  VALIDATION: 8,
};

export function createSeedConfig(
  overrides: Partial<SeedConfig> = {}
): SeedConfig {
  return {
    ...DEFAULT_SEED_CONFIG,
    ...overrides,
  };
}
