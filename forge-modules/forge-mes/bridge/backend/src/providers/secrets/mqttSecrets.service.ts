import { Injectable, Logger } from "@nestjs/common";
import { SecretsManagerService } from "./secretsManager.service";
import { EnumSecretsNameKey } from "./secretsNameKey.enum";

export interface MqttCredentials {
  username?: string;
  password?: string;
}

export interface MqttCertificates {
  clientCert?: Buffer;
  clientKey?: Buffer;
  caCert?: Buffer;
}

export interface MqttSecrets {
  credentials: MqttCredentials;
  certificates: MqttCertificates;
}

@Injectable()
export class MqttSecretsService {
  private readonly logger = new Logger(MqttSecretsService.name);
  private readonly secretsCache = new Map<string, any>();
  private readonly cacheExpiry = new Map<string, number>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly secretsManager: SecretsManagerService) {}

  /**
   * Get MQTT secrets for a specific broker
   */
  async getMqttSecrets(brokerId: string): Promise<MqttSecrets> {
    this.logger.debug(`Retrieving MQTT secrets for broker ${brokerId}`);

    const [credentials, certificates] = await Promise.all([
      this.getMqttCredentials(brokerId),
      this.getMqttCertificates(brokerId),
    ]);

    return {
      credentials,
      certificates,
    };
  }

  /**
   * Get MQTT credentials for a specific broker
   */
  async getMqttCredentials(brokerId: string): Promise<MqttCredentials> {
    const credentials: MqttCredentials = {};

    try {
      // Try broker-specific credentials first
      const brokerUsername = await this.getCachedSecret(
        `${EnumSecretsNameKey.MqttBrokerUsername}-${brokerId}`
      );
      const brokerPassword = await this.getCachedSecret(
        `${EnumSecretsNameKey.MqttBrokerPassword}-${brokerId}`
      );

      if (brokerUsername && brokerPassword) {
        credentials.username = brokerUsername;
        credentials.password = brokerPassword;
        this.logger.debug(`Using broker-specific credentials for ${brokerId}`);
        return credentials;
      }

      // Fall back to global MQTT credentials
      const globalUsername = await this.getCachedSecret(
        EnumSecretsNameKey.MqttUsername
      );
      const globalPassword = await this.getCachedSecret(
        EnumSecretsNameKey.MqttPassword
      );

      if (globalUsername && globalPassword) {
        credentials.username = globalUsername;
        credentials.password = globalPassword;
        this.logger.debug(`Using global MQTT credentials for ${brokerId}`);
      } else {
        this.logger.warn(`No MQTT credentials found for broker ${brokerId}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to retrieve MQTT credentials for broker ${brokerId}`,
        error
      );
    }

    return credentials;
  }

  /**
   * Get MQTT certificates for a specific broker
   */
  async getMqttCertificates(brokerId: string): Promise<MqttCertificates> {
    const certificates: MqttCertificates = {};

    try {
      // Try broker-specific certificates first
      const brokerClientCert = await this.getCachedSecret(
        `${EnumSecretsNameKey.MqttBrokerClientCert}-${brokerId}`
      );
      const brokerClientKey = await this.getCachedSecret(
        `${EnumSecretsNameKey.MqttBrokerClientKey}-${brokerId}`
      );
      const brokerCaCert = await this.getCachedSecret(
        `${EnumSecretsNameKey.MqttBrokerCaCert}-${brokerId}`
      );

      if (brokerClientCert || brokerClientKey || brokerCaCert) {
        if (brokerClientCert)
          certificates.clientCert = Buffer.from(brokerClientCert, "utf8");
        if (brokerClientKey)
          certificates.clientKey = Buffer.from(brokerClientKey, "utf8");
        if (brokerCaCert)
          certificates.caCert = Buffer.from(brokerCaCert, "utf8");
        this.logger.debug(`Using broker-specific certificates for ${brokerId}`);
        return certificates;
      }

      // Fall back to global MQTT certificates
      const globalClientCert = await this.getCachedSecret(
        EnumSecretsNameKey.MqttClientCertificate
      );
      const globalClientKey = await this.getCachedSecret(
        EnumSecretsNameKey.MqttClientPrivateKey
      );
      const globalCaCert = await this.getCachedSecret(
        EnumSecretsNameKey.MqttCaCertificate
      );

      if (globalClientCert)
        certificates.clientCert = Buffer.from(globalClientCert, "utf8");
      if (globalClientKey)
        certificates.clientKey = Buffer.from(globalClientKey, "utf8");
      if (globalCaCert) certificates.caCert = Buffer.from(globalCaCert, "utf8");

      if (globalClientCert || globalClientKey || globalCaCert) {
        this.logger.debug(`Using global MQTT certificates for ${brokerId}`);
      } else {
        this.logger.debug(`No MQTT certificates found for broker ${brokerId}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to retrieve MQTT certificates for broker ${brokerId}`,
        error
      );
    }

    return certificates;
  }

  /**
   * Get a secret with caching
   */
  private async getCachedSecret(key: string): Promise<string | null> {
    const now = Date.now();
    const cacheKey = key;

    // Check if we have a valid cached value
    if (this.secretsCache.has(cacheKey)) {
      const expiry = this.cacheExpiry.get(cacheKey) || 0;
      if (now < expiry) {
        return this.secretsCache.get(cacheKey);
      }
    }

    try {
      // Try to get the secret from the secrets manager
      const secret = await this.secretsManager.getSecret<string>(
        key as EnumSecretsNameKey
      );

      // Cache the result (even if null)
      this.secretsCache.set(cacheKey, secret);
      this.cacheExpiry.set(cacheKey, now + this.CACHE_TTL);

      return secret;
    } catch (error) {
      this.logger.warn(
        `Failed to retrieve secret ${key}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }

  /**
   * Clear the secrets cache
   */
  clearCache(): void {
    this.secretsCache.clear();
    this.cacheExpiry.clear();
    this.logger.debug("MQTT secrets cache cleared");
  }

  /**
   * Clear cache for a specific broker
   */
  clearBrokerCache(brokerId: string): void {
    const keysToRemove: string[] = [];

    for (const key of this.secretsCache.keys()) {
      if (key.includes(brokerId)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      this.secretsCache.delete(key);
      this.cacheExpiry.delete(key);
    });

    this.logger.debug(`Cleared MQTT secrets cache for broker ${brokerId}`);
  }

  /**
   * Check if secrets are available for a broker
   */
  async hasSecretsForBroker(brokerId: string): Promise<boolean> {
    const secrets = await this.getMqttSecrets(brokerId);
    return !!(secrets.credentials.username || secrets.certificates.clientCert);
  }

  /**
   * Validate that required secrets are available for TLS
   */
  async validateTlsSecrets(
    brokerId: string
  ): Promise<{ valid: boolean; missing: string[] }> {
    const certificates = await this.getMqttCertificates(brokerId);
    const missing: string[] = [];

    if (!certificates.clientCert) missing.push("client certificate");
    if (!certificates.clientKey) missing.push("client private key");
    if (!certificates.caCert) missing.push("CA certificate");

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Validate that required secrets are available for authentication
   */
  async validateAuthSecrets(
    brokerId: string
  ): Promise<{ valid: boolean; missing: string[] }> {
    const credentials = await this.getMqttCredentials(brokerId);
    const missing: string[] = [];

    if (!credentials.username) missing.push("username");
    if (!credentials.password) missing.push("password");

    return {
      valid: missing.length === 0,
      missing,
    };
  }
}
