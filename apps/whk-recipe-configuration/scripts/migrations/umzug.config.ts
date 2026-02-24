import { Umzug, SequelizeStorage } from "umzug";
import { PrismaClient } from "@prisma/client";
import * as path from "path";
import * as fs from "fs";

// Initialize Prisma client
const prisma = new PrismaClient();

// Custom storage adapter for Prisma
class PrismaStorage {
  private prisma: PrismaClient;
  private tableName: string;

  constructor(prisma: PrismaClient, tableName = "migration_meta") {
    this.prisma = prisma;
    this.tableName = tableName;
  }

  async logMigration(params: { name: string }): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO migration_meta (name, executed_at) 
      VALUES (${params.name}, NOW())
      ON CONFLICT (name) DO NOTHING
    `;
  }

  async unlogMigration(params: { name: string }): Promise<void> {
    await this.prisma.$executeRaw`
      DELETE FROM migration_meta WHERE name = ${params.name}
    `;
  }

  async executed(): Promise<string[]> {
    const result = await this.prisma.$queryRaw<{ name: string }[]>`
      SELECT name FROM migration_meta ORDER BY executed_at ASC
    `;
    return result.map((row) => row.name);
  }
}

// Create umzug instance
export const umzug = new Umzug({
  migrations: {
    glob: path.join(__dirname, "*.migration.{js,ts}"),
    resolve: ({ name, path: migrationPath }) => {
      // Handle both .ts and .js files
      if (!migrationPath) {
        throw new Error(`Migration path is undefined for migration: ${name}`);
      }
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const migration = require(migrationPath);
      return {
        name,
        up: async () => migration.up({ prisma }),
        down: async () => migration.down({ prisma }),
      };
    },
  },
  context: { prisma },
  storage: new PrismaStorage(prisma),
  logger: console,
});

// Export types for migrations
export type Migration = typeof umzug._types.migration;
export type MigrationParams = {
  prisma: PrismaClient;
};

// Initialize migration tracking table
export async function initializeMigrationTable(): Promise<void> {
  try {
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS migration_meta (
        name VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log("Migration tracking table initialized");
  } catch (error) {
    console.error("Failed to initialize migration table:", error);
    throw error;
  }
}

// Cleanup function
export async function cleanup(): Promise<void> {
  await prisma.$disconnect();
}
