import { PrismaClient } from "@prisma/client";
import { SeedResult } from "../config";
import { createHash } from "crypto";

export interface SeedStatus {
  id: string;
  moduleName: string;
  version: string;
  checksum: string;
  status: "pending" | "running" | "completed" | "failed";
  recordsCreated: number;
  recordsUpdated: number;
  executionTimeMs: number;
  errorMessage?: string;
  startedAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class SeedStatusTracker {
  private client: PrismaClient;

  constructor(client: PrismaClient) {
    this.client = client;
  }

  async initializeStatusTable(): Promise<void> {
    // Create the seed status table if it doesn't exist
    await this.client.$executeRaw`
      CREATE TABLE IF NOT EXISTS seed_status (
        id VARCHAR(255) PRIMARY KEY,
        module_name VARCHAR(255) NOT NULL,
        version VARCHAR(50) NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        records_created INTEGER DEFAULT 0,
        records_updated INTEGER DEFAULT 0,
        execution_time_ms INTEGER DEFAULT 0,
        error_message TEXT,
        started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `;
  }

  async startSeed(
    moduleName: string,
    version: string = "1.0.0",
    sourceCode?: string
  ): Promise<string> {
    const checksum = this.generateChecksum(moduleName, version, sourceCode);
    const id = this.generateId(moduleName, version);

    await this.client.$executeRaw`
      INSERT INTO seed_status (
        id, module_name, version, checksum, status, started_at
      ) VALUES (
        ${id}, ${moduleName}, ${version}, ${checksum}, 'running', NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        status = 'running',
        started_at = NOW(),
        updated_at = NOW()
    `;

    return id;
  }

  async completeSeed(id: string, result: SeedResult): Promise<void> {
    const status = result.success ? "completed" : "failed";
    const errorMessage =
      result.errors.length > 0 ? result.errors.join("; ") : null;

    await this.client.$executeRaw`
      UPDATE seed_status SET
        status = ${status},
        records_created = ${result.recordsCreated},
        records_updated = ${result.recordsUpdated},
        execution_time_ms = ${result.executionTimeMs},
        error_message = ${errorMessage},
        completed_at = NOW(),
        updated_at = NOW()
      WHERE id = ${id}
    `;
  }

  async getSeedStatus(
    moduleName: string,
    version?: string
  ): Promise<SeedStatus | null> {
    const result = version
      ? await this.client.$queryRaw<SeedStatus[]>`
          SELECT * FROM seed_status 
          WHERE module_name = ${moduleName} AND version = ${version}
          ORDER BY created_at DESC 
          LIMIT 1
        `
      : await this.client.$queryRaw<SeedStatus[]>`
          SELECT * FROM seed_status 
          WHERE module_name = ${moduleName}
          ORDER BY created_at DESC 
          LIMIT 1
        `;

    return result.length > 0 ? result[0] : null;
  }

  async getAllSeedStatuses(): Promise<SeedStatus[]> {
    return await this.client.$queryRaw<SeedStatus[]>`
      SELECT * FROM seed_status 
      ORDER BY module_name, created_at DESC
    `;
  }

  async hasBeenSeeded(
    moduleName: string,
    version?: string,
    sourceCode?: string
  ): Promise<boolean> {
    const status = await this.getSeedStatus(moduleName, version);

    if (!status || status.status !== "completed") {
      return false;
    }

    // If sourceCode is provided, verify checksum hasn't changed
    if (sourceCode) {
      const currentChecksum = this.generateChecksum(
        moduleName,
        version || "1.0.0",
        sourceCode
      );
      return status.checksum === currentChecksum;
    }

    return true;
  }

  async resetSeedStatus(moduleName: string): Promise<void> {
    await this.client.$executeRaw`
      DELETE FROM seed_status WHERE module_name = ${moduleName}
    `;
  }

  async clearAllSeedStatuses(): Promise<void> {
    await this.client.$executeRaw`
      TRUNCATE TABLE seed_status
    `;
  }

  private generateId(moduleName: string, version: string): string {
    return `${moduleName}_${version}_${Date.now()}`;
  }

  private generateChecksum(
    moduleName: string,
    version: string,
    sourceCode?: string
  ): string {
    const content = `${moduleName}:${version}:${sourceCode || ""}`;
    return createHash("sha256").update(content).digest("hex");
  }

  async getSeedSummary(): Promise<{
    total: number;
    completed: number;
    failed: number;
    running: number;
    pending: number;
  }> {
    const result = await this.client.$queryRaw<
      Array<{ status: string; count: number }>
    >`
      SELECT status, COUNT(*) as count 
      FROM seed_status 
      GROUP BY status
    `;

    const summary = {
      total: 0,
      completed: 0,
      failed: 0,
      running: 0,
      pending: 0,
    };

    result.forEach((row) => {
      summary.total += Number(row.count);
      summary[row.status as keyof typeof summary] = Number(row.count);
    });

    return summary;
  }
}
