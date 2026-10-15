import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export interface HealthCheckResult {
  status: "up" | "down";
  details?: Record<string, any>;
  timestamp: string;
}

export interface SystemHealth {
  status: "ok" | "error";
  database: HealthCheckResult;
  api: HealthCheckResult;
  uptime: number;
  memory: {
    used: number;
    total: number;
  };
}

@Injectable()
export class HealthServiceBase {
  private startTime: number;

  constructor(protected readonly prisma: PrismaService) {
    this.startTime = Date.now();
  }

  async isDbReady(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      return false;
    }
  }

  async getDbHealth(): Promise<HealthCheckResult> {
    try {
      const startTime = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      const responseTime = Date.now() - startTime;

      return {
        status: "up",
        details: {
          responseTime: `${responseTime}ms`,
          connection: "active",
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        status: "down",
        details: {
          error: error.message || "Unknown error",
          code: error.code || "UNKNOWN",
        },
        timestamp: new Date().toISOString(),
      };
    }
  }

  getApiHealth(): HealthCheckResult {
    return {
      status: "up",
      details: {
        version: process.env.npm_package_version || "unknown",
        environment: process.env.NODE_ENV || "development",
      },
      timestamp: new Date().toISOString(),
    };
  }

  getSystemHealth(): SystemHealth {
    const dbHealthPromise = this.getDbHealth();
    const apiHealth = this.getApiHealth();

    return {
      status: "ok",
      database: dbHealthPromise as any, // Will be replaced with actual result when used
      api: apiHealth,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      },
    };
  }

  async getCompleteHealth(): Promise<SystemHealth> {
    const systemHealth = this.getSystemHealth();
    systemHealth.database = await this.getDbHealth();

    // Update overall status if any component is down
    if (systemHealth.database.status === "down") {
      systemHealth.status = "error";
    }

    return systemHealth;
  }
}
