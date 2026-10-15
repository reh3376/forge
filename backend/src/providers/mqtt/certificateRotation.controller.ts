import { Controller, Get, Post, Param, Body, UseGuards } from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import {
  CertificateRotationService,
  CertificateStatus,
  RotationConfig,
} from "./certificateRotation.service";
import { JwtAuthGuard } from "../../auth/jwt/jwtAuth.guard";
import { ACGuard, UseRoles } from "nest-access-control";

@ApiTags("Certificate Rotation")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ACGuard)
@Controller("certificate-rotation")
export class CertificateRotationController {
  constructor(
    private readonly certificateRotationService: CertificateRotationService
  ) {}

  @Get("health")
  @ApiOperation({ summary: "Get certificate rotation service health status" })
  @ApiResponse({
    status: 200,
    description: "Health status retrieved successfully",
  })
  @UseRoles({
    resource: "CertificateRotation",
    action: "read",
    possession: "any",
  })
  async getHealthStatus() {
    const statuses =
      this.certificateRotationService.getCurrentCertificateStatuses();
    const criticalCount = statuses.filter(
      (s) => s.rotationStatus === "critical"
    ).length;
    const failedCount = statuses.filter(
      (s) => s.rotationStatus === "failed"
    ).length;
    const warningCount = statuses.filter(
      (s) => s.rotationStatus === "warning"
    ).length;

    return {
      status:
        failedCount > 0
          ? "unhealthy"
          : criticalCount > 0
          ? "degraded"
          : "healthy",
      totalCertificates: statuses.length,
      healthyCertificates: statuses.filter(
        (s) => s.rotationStatus === "healthy"
      ).length,
      warningCertificates: warningCount,
      criticalCertificates: criticalCount,
      failedCertificates: failedCount,
      lastCheck: new Date().toISOString(),
    };
  }

  @Get("status")
  @ApiOperation({ summary: "Get all certificate statuses" })
  @ApiResponse({
    status: 200,
    description: "Certificate statuses retrieved successfully",
  })
  @UseRoles({
    resource: "CertificateRotation",
    action: "read",
    possession: "any",
  })
  async getCertificateStatuses(): Promise<CertificateStatus[]> {
    return this.certificateRotationService.getCurrentCertificateStatuses();
  }

  @Get("status/:brokerId")
  @ApiOperation({ summary: "Get certificate status for a specific broker" })
  @ApiResponse({
    status: 200,
    description: "Broker certificate status retrieved successfully",
  })
  @UseRoles({
    resource: "CertificateRotation",
    action: "read",
    possession: "any",
  })
  async getBrokerCertificateStatus(
    @Param("brokerId") brokerId: string
  ): Promise<CertificateStatus[]> {
    return this.certificateRotationService.checkBrokerCertificates(brokerId);
  }

  @Post("check")
  @ApiOperation({
    summary: "Manually trigger certificate check for all brokers",
  })
  @ApiResponse({
    status: 200,
    description: "Certificate check completed successfully",
  })
  @UseRoles({
    resource: "CertificateRotation",
    action: "update",
    possession: "any",
  })
  async triggerCertificateCheck(): Promise<CertificateStatus[]> {
    return this.certificateRotationService.checkAllCertificates();
  }

  @Post("rotate/:brokerId/:certificateType")
  @ApiOperation({
    summary:
      "Force certificate rotation for a specific broker and certificate type",
  })
  @ApiResponse({
    status: 200,
    description: "Certificate rotation initiated successfully",
  })
  @UseRoles({
    resource: "CertificateRotation",
    action: "update",
    possession: "any",
  })
  async forceRotateCertificate(
    @Param("brokerId") brokerId: string,
    @Param("certificateType") certificateType: "client" | "ca"
  ): Promise<{ success: boolean; message: string }> {
    const success =
      await this.certificateRotationService.forceRotateCertificate(
        brokerId,
        certificateType
      );
    return {
      success,
      message: success
        ? `Certificate rotation initiated for ${brokerId} ${certificateType} certificate`
        : `Failed to initiate certificate rotation for ${brokerId} ${certificateType} certificate`,
    };
  }

  @Get("config")
  @ApiOperation({ summary: "Get certificate rotation configuration" })
  @ApiResponse({
    status: 200,
    description: "Configuration retrieved successfully",
  })
  @UseRoles({
    resource: "CertificateRotation",
    action: "read",
    possession: "any",
  })
  async getRotationConfig(): Promise<RotationConfig> {
    return this.certificateRotationService.getRotationConfig();
  }

  @Post("config")
  @ApiOperation({ summary: "Update certificate rotation configuration" })
  @ApiResponse({
    status: 200,
    description: "Configuration updated successfully",
  })
  @UseRoles({
    resource: "CertificateRotation",
    action: "update",
    possession: "any",
  })
  async updateRotationConfig(
    @Body() config: Partial<RotationConfig>
  ): Promise<{ success: boolean; message: string }> {
    try {
      this.certificateRotationService.updateRotationConfig(config);
      return {
        success: true,
        message: "Certificate rotation configuration updated successfully",
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to update configuration: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }
}
