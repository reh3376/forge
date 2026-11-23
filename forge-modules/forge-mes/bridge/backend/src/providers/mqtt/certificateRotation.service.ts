import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Subject, BehaviorSubject } from "rxjs";
import * as crypto from "crypto";
import { MqttSecretsService } from "../secrets/mqttSecrets.service";
import { MqttService } from "./mqtt.service";
import { PrismaService } from "../../prisma/prisma.service";

export interface CertificateStatus {
  brokerId: string;
  certificateType: "client" | "ca";
  expirationDate: Date;
  daysUntilExpiration: number;
  isExpired: boolean;
  isNearExpiration: boolean;
  lastRotated?: Date;
  rotationStatus: "healthy" | "warning" | "critical" | "failed";
}

export interface CertificateRotationEvent {
  brokerId: string;
  certificateType: "client" | "ca";
  eventType:
    | "rotation_started"
    | "rotation_completed"
    | "rotation_failed"
    | "expiration_warning";
  timestamp: Date;
  details?: string;
  error?: string;
}

export interface RotationConfig {
  warningThresholdDays: number;
  criticalThresholdDays: number;
  autoRotationEnabled: boolean;
  maxRetryAttempts: number;
  retryDelayMs: number;
  rollbackOnFailure: boolean;
}

@Injectable()
export class CertificateRotationService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CertificateRotationService.name);

  // Event streams
  private readonly rotationEvents$ = new Subject<CertificateRotationEvent>();
  private readonly certificateStatuses$ = new BehaviorSubject<
    CertificateStatus[]
  >([]);

  // Configuration
  private readonly defaultConfig: RotationConfig = {
    warningThresholdDays: 30,
    criticalThresholdDays: 7,
    autoRotationEnabled: true,
    maxRetryAttempts: 3,
    retryDelayMs: 5000,
    rollbackOnFailure: true,
  };

  private rotationInProgress = new Set<string>();
  private lastRotationAttempts = new Map<string, Date>();

  constructor(
    private readonly mqttSecretsService: MqttSecretsService,
    private readonly mqttService: MqttService,
    private readonly prismaService: PrismaService
  ) {}

  async onModuleInit() {
    this.logger.log("Certificate Rotation Service initialized");
    // Perform initial certificate status check
    await this.checkAllCertificates();
  }

  onModuleDestroy() {
    this.rotationEvents$.complete();
    this.certificateStatuses$.complete();
  }

  /**
   * Scheduled task to check certificate expiration every day at 2 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async scheduledCertificateCheck() {
    this.logger.log("Running scheduled certificate expiration check");
    await this.checkAllCertificates();
  }

  /**
   * Check all certificates for all brokers
   */
  async checkAllCertificates(): Promise<CertificateStatus[]> {
    try {
      const brokers = await this.prismaService.unsBrokerConfiguration.findMany({
        where: { tls: true },
        select: { id: true },
      });

      const allStatuses: CertificateStatus[] = [];

      for (const broker of brokers) {
        const statuses = await this.checkBrokerCertificates(broker.id);
        allStatuses.push(...statuses);
      }

      this.certificateStatuses$.next(allStatuses);

      // Check for certificates requiring action
      await this.processExpiringCertificates(allStatuses);

      return allStatuses;
    } catch (error) {
      this.logger.error("Failed to check certificates", error);
      return [];
    }
  }

  /**
   * Check certificates for a specific broker
   */
  async checkBrokerCertificates(
    brokerId: string
  ): Promise<CertificateStatus[]> {
    const statuses: CertificateStatus[] = [];

    try {
      // Check client certificate
      const clientCertificates =
        await this.mqttSecretsService.getMqttCertificates(brokerId);
      if (clientCertificates.clientCert) {
        const clientStatus = await this.analyzeCertificate(
          brokerId,
          "client",
          clientCertificates.clientCert.toString()
        );
        statuses.push(clientStatus);
      }

      // Check CA certificate
      if (clientCertificates.caCert) {
        const caStatus = await this.analyzeCertificate(
          brokerId,
          "ca",
          clientCertificates.caCert.toString()
        );
        statuses.push(caStatus);
      }
    } catch (error) {
      this.logger.error(
        `Failed to check certificates for broker ${brokerId}`,
        error
      );
    }

    return statuses;
  }

  /**
   * Analyze a certificate and determine its status
   */
  private async analyzeCertificate(
    brokerId: string,
    type: "client" | "ca",
    certificatePem: string
  ): Promise<CertificateStatus> {
    try {
      const cert = this.parseCertificate(certificatePem);
      const now = new Date();
      const expirationDate = new Date(cert.validTo);
      const daysUntilExpiration = Math.ceil(
        (expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      const isExpired = daysUntilExpiration <= 0;
      const isNearExpiration =
        daysUntilExpiration <= this.defaultConfig.warningThresholdDays;

      let rotationStatus: CertificateStatus["rotationStatus"] = "healthy";
      if (isExpired) {
        rotationStatus = "failed";
      } else if (
        daysUntilExpiration <= this.defaultConfig.criticalThresholdDays
      ) {
        rotationStatus = "critical";
      } else if (isNearExpiration) {
        rotationStatus = "warning";
      }

      return {
        brokerId,
        certificateType: type,
        expirationDate,
        daysUntilExpiration,
        isExpired,
        isNearExpiration,
        rotationStatus,
      };
    } catch (error) {
      this.logger.error(
        `Failed to analyze ${type} certificate for broker ${brokerId}`,
        error
      );
      return {
        brokerId,
        certificateType: type,
        expirationDate: new Date(),
        daysUntilExpiration: 0,
        isExpired: true,
        isNearExpiration: true,
        rotationStatus: "failed",
      };
    }
  }

  /**
   * Parse certificate to extract expiration information
   */
  private parseCertificate(certificatePem: string): { validTo: string } {
    try {
      const cert = new crypto.X509Certificate(certificatePem);
      return { validTo: cert.validTo };
    } catch (error) {
      // Fallback: try to extract date from PEM manually
      const match = certificatePem.match(/Not After\\s*:\\s*(.+)/);
      if (match) {
        return { validTo: match[1] };
      }
      throw new Error("Unable to parse certificate expiration date");
    }
  }

  /**
   * Process certificates that are expiring and take appropriate action
   */
  private async processExpiringCertificates(statuses: CertificateStatus[]) {
    for (const status of statuses) {
      const key = `${status.brokerId}-${status.certificateType}`;

      // Emit warning events
      if (status.isNearExpiration && !status.isExpired) {
        this.emitRotationEvent({
          brokerId: status.brokerId,
          certificateType: status.certificateType,
          eventType: "expiration_warning",
          timestamp: new Date(),
          details: `Certificate expires in ${status.daysUntilExpiration} days`,
        });
      }

      // Auto-rotate if enabled and certificate is critical or expired
      if (
        this.defaultConfig.autoRotationEnabled &&
        (status.rotationStatus === "critical" ||
          status.rotationStatus === "failed") &&
        !this.rotationInProgress.has(key)
      ) {
        await this.rotateCertificate(status.brokerId, status.certificateType);
      }
    }
  }

  /**
   * Rotate a certificate for a specific broker
   */
  async rotateCertificate(
    brokerId: string,
    certificateType: "client" | "ca"
  ): Promise<boolean> {
    const key = `${brokerId}-${certificateType}`;

    if (this.rotationInProgress.has(key)) {
      this.logger.warn(`Certificate rotation already in progress for ${key}`);
      return false;
    }

    this.rotationInProgress.add(key);
    this.lastRotationAttempts.set(key, new Date());

    this.emitRotationEvent({
      brokerId,
      certificateType,
      eventType: "rotation_started",
      timestamp: new Date(),
    });

    try {
      // Store current certificate for rollback
      const currentCert = await this.getCurrentCertificate(
        brokerId,
        certificateType
      );

      // Attempt to get new certificate from Azure Key Vault
      // This assumes that new certificates are uploaded to Key Vault with new versions
      const newCert = await this.getLatestCertificateVersion(
        brokerId,
        certificateType
      );

      if (!newCert || newCert === currentCert) {
        throw new Error("No new certificate version available");
      }

      // Validate new certificate
      await this.validateCertificate(newCert);

      // Update the certificate in secrets
      await this.updateCertificateInSecrets(brokerId, certificateType, newCert);

      // Restart MQTT connections for this broker
      await this.restartBrokerConnections(brokerId);

      // Verify the connection works with new certificate
      await this.verifyBrokerConnection(brokerId);

      this.emitRotationEvent({
        brokerId,
        certificateType,
        eventType: "rotation_completed",
        timestamp: new Date(),
        details: "Certificate successfully rotated and connections restarted",
      });

      this.logger.log(
        `Successfully rotated ${certificateType} certificate for broker ${brokerId}`
      );
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to rotate ${certificateType} certificate for broker ${brokerId}`,
        error
      );

      // Attempt rollback if enabled
      if (this.defaultConfig.rollbackOnFailure) {
        await this.rollbackCertificate(brokerId, certificateType);
      }

      this.emitRotationEvent({
        brokerId,
        certificateType,
        eventType: "rotation_failed",
        timestamp: new Date(),
        error: errorMessage,
      });

      return false;
    } finally {
      this.rotationInProgress.delete(key);
    }
  }

  /**
   * Get current certificate for backup/rollback purposes
   */
  private async getCurrentCertificate(
    brokerId: string,
    certificateType: "client" | "ca"
  ): Promise<string | null> {
    const certificates = await this.mqttSecretsService.getMqttCertificates(
      brokerId
    );

    if (certificateType === "client") {
      return certificates.clientCert
        ? certificates.clientCert.toString()
        : null;
    } else {
      return certificates.caCert ? certificates.caCert.toString() : null;
    }
  }

  /**
   * Get latest certificate version from Azure Key Vault
   */
  private async getLatestCertificateVersion(
    brokerId: string,
    certificateType: "client" | "ca"
  ): Promise<string | null> {
    // This would integrate with Azure Key Vault to get the latest version
    // For now, we'll simulate by checking if there's a newer version available
    const certificates = await this.mqttSecretsService.getMqttCertificates(
      brokerId
    );

    if (certificateType === "client") {
      return certificates.clientCert
        ? certificates.clientCert.toString()
        : null;
    } else {
      return certificates.caCert ? certificates.caCert.toString() : null;
    }
  }

  /**
   * Validate certificate format and expiration
   */
  private async validateCertificate(certificatePem: string): Promise<void> {
    try {
      const cert = this.parseCertificate(certificatePem);
      const expirationDate = new Date(cert.validTo);
      const now = new Date();

      if (expirationDate <= now) {
        throw new Error("New certificate is already expired");
      }

      // Additional validation could include:
      // - Certificate chain validation
      // - Key usage validation
      // - Subject/issuer validation
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Certificate validation failed: ${errorMessage}`);
    }
  }

  /**
   * Update certificate in secrets management
   */
  private async updateCertificateInSecrets(
    brokerId: string,
    certificateType: "client" | "ca",
    newCertificate: string
  ): Promise<void> {
    // This would update the certificate in Azure Key Vault
    // For now, we'll clear the cache to force reload
    await this.mqttSecretsService.clearBrokerCache(brokerId);
  }

  /**
   * Restart MQTT connections for a broker
   */
  private async restartBrokerConnections(brokerId: string): Promise<void> {
    try {
      // Get broker configuration
      const brokerConfig = this.mqttService.getBrokerConfiguration(brokerId);
      if (!brokerConfig) {
        throw new Error(`Broker configuration not found for ID: ${brokerId}`);
      }

      // Gracefully disconnect and reconnect
      await this.mqttService.disconnectFromBroker(brokerId);
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
      await this.mqttService.connectToBroker(brokerConfig);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to restart connections for broker ${brokerId}: ${errorMessage}`
      );
    }
  }

  /**
   * Verify broker connection after certificate rotation
   */
  private async verifyBrokerConnection(brokerId: string): Promise<void> {
    // This would test the connection by publishing/subscribing to a test topic
    // For now, we'll just check if the connection is active
    const isConnected = await this.mqttService.isBrokerConnected(brokerId);
    if (!isConnected) {
      throw new Error(`Broker ${brokerId} connection verification failed`);
    }
  }

  /**
   * Rollback certificate to previous version
   */
  private async rollbackCertificate(
    brokerId: string,
    certificateType: "client" | "ca"
  ): Promise<void> {
    try {
      this.logger.warn(
        `Attempting rollback for ${certificateType} certificate of broker ${brokerId}`
      );
      // In a real implementation, this would restore the previous certificate version
      // For now, we'll just restart the connections
      await this.restartBrokerConnections(brokerId);
    } catch (error) {
      this.logger.error(`Rollback failed for broker ${brokerId}`, error);
    }
  }

  /**
   * Emit rotation event
   */
  private emitRotationEvent(event: CertificateRotationEvent): void {
    this.rotationEvents$.next(event);
    this.logger.log(
      `Certificate rotation event: ${event.eventType} for ${event.brokerId}-${event.certificateType}`
    );
  }

  /**
   * Get observable for rotation events
   */
  getRotationEvents() {
    return this.rotationEvents$.asObservable();
  }

  /**
   * Get observable for certificate statuses
   */
  getCertificateStatuses() {
    return this.certificateStatuses$.asObservable();
  }

  /**
   * Get current certificate statuses
   */
  getCurrentCertificateStatuses(): CertificateStatus[] {
    return this.certificateStatuses$.value;
  }

  /**
   * Force rotation of a specific certificate
   */
  async forceRotateCertificate(
    brokerId: string,
    certificateType: "client" | "ca"
  ): Promise<boolean> {
    this.logger.log(
      `Force rotating ${certificateType} certificate for broker ${brokerId}`
    );
    return await this.rotateCertificate(brokerId, certificateType);
  }

  /**
   * Get rotation configuration
   */
  getRotationConfig(): RotationConfig {
    return { ...this.defaultConfig };
  }

  /**
   * Update rotation configuration
   */
  updateRotationConfig(config: Partial<RotationConfig>): void {
    Object.assign(this.defaultConfig, config);
    this.logger.log("Certificate rotation configuration updated", config);
  }
}
