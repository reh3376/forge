import { Get, HttpStatus, Res } from "@nestjs/common";
import { Response } from "express";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { HealthService } from "../health.service";
import { SystemHealth, HealthCheckResult } from "./health.service.base";

@ApiTags("health")
export class HealthControllerBase {
  constructor(protected readonly healthService: HealthService) {}

  @Get("live")
  @ApiOperation({ summary: "Simple liveness check" })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: "Service is alive",
  })
  healthLive(@Res() response: Response): Response<void> {
    return response.status(HttpStatus.NO_CONTENT).send();
  }

  @Get("ready")
  @ApiOperation({ summary: "Readiness check that verifies DB connection" })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: "Service is ready",
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "Service is not ready",
  })
  async healthReady(@Res() response: Response): Promise<Response<void>> {
    const dbConnection = await this.healthService.isDbReady();
    if (!dbConnection) {
      return response.status(HttpStatus.NOT_FOUND).send();
    }
    return response.status(HttpStatus.NO_CONTENT).send();
  }

  @Get("db")
  @ApiOperation({ summary: "Detailed database health check" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Database health status",
  })
  async getDatabaseHealth(): Promise<HealthCheckResult> {
    return this.healthService.getDbHealth();
  }

  @Get("api")
  @ApiOperation({ summary: "API service health status" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "API health status",
  })
  getApiHealth(): HealthCheckResult {
    return this.healthService.getApiHealth();
  }

  @Get()
  @ApiOperation({ summary: "Complete system health check" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Complete system health status",
  })
  async getHealth(): Promise<SystemHealth> {
    return this.healthService.getCompleteHealth();
  }
}
