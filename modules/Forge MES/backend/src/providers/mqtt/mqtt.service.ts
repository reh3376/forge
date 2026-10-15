import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { connect, MqttClient, IClientOptions } from "mqtt";
import { Subject, BehaviorSubject, Observable } from "rxjs";
import { PrismaService } from "../../prisma/prisma.service";
import { UnsBrokerConfiguration } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { MqttSecretsService } from "../secrets/mqttSecrets.service";

export interface MqttMessage {
  topic: string;
  payload: Buffer;
  timestamp: Date;
  brokerId?: string;
}

export interface MqttConnectionStatus {
  brokerId: string;
  connected: boolean;
  error?: string;
  timestamp: Date;
  authMethod?: string;
  tlsEnabled?: boolean;
}

export interface MqttEvent {
  type:
    | "message"
    | "connect"
    | "disconnect"
    | "error"
    | "reconnect"
    | "auth_success"
    | "auth_failure";
  data: MqttMessage | MqttConnectionStatus | Error | AuthenticationEvent;
  brokerId?: string;
}

export interface TlsConfiguration {
  ca?: Buffer | Buffer[];
  cert?: Buffer;
  key?: Buffer;
  rejectUnauthorized?: boolean;
  servername?: string;
}

export interface AuthenticationEvent {
  brokerId: string;
  authMethod: "certificate" | "username_password" | "hybrid";
  success: boolean;
  timestamp: Date;
  error?: string;
  clientId?: string;
}

export interface TopicACL {
  pattern: string;
  permissions: ("read" | "write" | "subscribe" | "publish")[];
  roles?: string[];
  description?: string;
}

export interface AuthenticationConfig {
  requireClientCertificate: boolean;
  requireUsernamePassword: boolean;
  allowAnonymous: boolean;
  topicACLs: TopicACL[];
  maxAuthRetries: number;
  authTimeoutMs: number;
}

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private static instance: MqttService;
  private readonly logger = new Logger(MqttService.name);

  // MQTT clients for each broker configuration
  private clients = new Map<string, MqttClient>();

  // RxJS Subjects for event broadcasting
  private eventSubject = new Subject<MqttEvent>();
  private connectionStatusSubject = new BehaviorSubject<Map<string, boolean>>(
    new Map()
  );

  // Configuration cache
  private brokerConfigurations = new Map<string, UnsBrokerConfiguration>();

  // Hot-reload mechanism properties
  private configurationTimestamps = new Map<string, Date>();
  private hotReloadInterval: NodeJS.Timeout | null = null;
  private readonly HOT_RELOAD_CHECK_INTERVAL = 30000; // 30 seconds
  private isHotReloadEnabled = true;

  // TLS certificate cache
  private tlsConfigurations = new Map<string, TlsConfiguration>();

  // Authentication configuration cache
  private authConfigurations = new Map<string, AuthenticationConfig>();

  // Authentication event tracking
  private authEventSubject = new Subject<AuthenticationEvent>();

  // Default authentication configuration
  private readonly defaultAuthConfig: AuthenticationConfig = {
    requireClientCertificate: false,
    requireUsernamePassword: true,
    allowAnonymous: false,
    topicACLs: [
      {
        pattern: "#",
        permissions: ["read", "write", "subscribe", "publish"],
        description: "Default allow-all ACL",
      },
    ],
    maxAuthRetries: 3,
    authTimeoutMs: 10000,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly mqttSecretsService: MqttSecretsService
  ) {
    // Implement singleton pattern
    if (MqttService.instance) {
      return MqttService.instance;
    }
    MqttService.instance = this;
  }

  async onModuleInit() {
    this.logger.log("Initializing MQTT Service...");
    await this.loadConfigurationsFromDatabase();
    await this.connectToAllBrokers();

    // Start hot-reload mechanism
    if (this.isHotReloadEnabled) {
      this.startHotReloadWatcher();
    }
  }

  async onModuleDestroy() {
    this.logger.log("Destroying MQTT Service...");

    // Stop hot-reload mechanism
    this.stopHotReloadWatcher();

    await this.disconnectFromAllBrokers();
    this.eventSubject.complete();
    this.connectionStatusSubject.complete();
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): MqttService {
    if (!MqttService.instance) {
      throw new Error(
        "MqttService not initialized. Use dependency injection instead."
      );
    }
    return MqttService.instance;
  }

  /**
   * Load broker configurations from database
   */
  async loadConfigurationsFromDatabase(): Promise<void> {
    try {
      this.logger.log("Loading MQTT broker configurations from database...");

      // Note: UnsBrokerConfiguration doesn't have an isActive field, so we load all
      const configurations =
        await this.prisma.unsBrokerConfiguration.findMany();

      this.brokerConfigurations.clear();
      configurations.forEach((config) => {
        this.brokerConfigurations.set(config.id, config);
        // Track configuration timestamps for hot-reload
        this.configurationTimestamps.set(config.id, config.updatedAt);
      });

      this.logger.log(`Loaded ${configurations.length} broker configurations`);
    } catch (error) {
      this.logger.error(
        "Failed to load broker configurations from database",
        error
      );
      throw error;
    }
  }

  /**
   * Connect to all configured brokers
   */
  async connectToAllBrokers(): Promise<void> {
    const connectionPromises = Array.from(
      this.brokerConfigurations.values()
    ).map((config) => this.connectToBroker(config));

    await Promise.allSettled(connectionPromises);
  }

  /**
   * Load TLS configuration for a broker
   */
  private async loadTlsConfiguration(
    config: UnsBrokerConfiguration
  ): Promise<TlsConfiguration | null> {
    if (!config.tls) {
      return null;
    }

    try {
      const tlsConfig: TlsConfiguration = {
        rejectUnauthorized: config.validateCertificate ?? true,
        servername: config.host, // Use hostname for SNI
      };

      // First, try to get certificates from secrets management
      const certificates = await this.mqttSecretsService.getMqttCertificates(
        config.id
      );

      if (
        certificates.clientCert ||
        certificates.clientKey ||
        certificates.caCert
      ) {
        this.logger.log(
          `Using certificates from secrets management for broker ${config.host}`
        );

        if (certificates.caCert) {
          tlsConfig.ca = certificates.caCert;
          this.logger.debug(
            `Loaded CA certificate from secrets for broker ${config.host}`
          );
        }

        if (certificates.clientCert) {
          tlsConfig.cert = certificates.clientCert;
          this.logger.debug(
            `Loaded client certificate from secrets for broker ${config.host}`
          );
        }

        if (certificates.clientKey) {
          tlsConfig.key = certificates.clientKey;
          this.logger.debug(
            `Loaded client private key from secrets for broker ${config.host}`
          );
        }
      } else {
        // Fall back to file system certificates if no secrets are available
        this.logger.debug(
          `No certificates found in secrets management for broker ${config.host}, falling back to file system`
        );

        // Define certificate paths based on broker ID
        const certDir = process.env.MQTT_CERT_DIR || "/app/certs/mqtt";
        const caPath = path.join(certDir, `${config.id}-ca.crt`);
        const certPath = path.join(certDir, `${config.id}-client.crt`);
        const keyPath = path.join(certDir, `${config.id}-client.key`);

        // Load CA certificate if exists
        if (fs.existsSync(caPath)) {
          tlsConfig.ca = fs.readFileSync(caPath);
          this.logger.log(
            `Loaded CA certificate from file system for broker ${config.host}`
          );
        } else {
          this.logger.warn(
            `CA certificate not found at ${caPath} for broker ${config.host}`
          );
        }

        // Load client certificate if exists
        if (fs.existsSync(certPath)) {
          tlsConfig.cert = fs.readFileSync(certPath);
          this.logger.log(
            `Loaded client certificate from file system for broker ${config.host}`
          );
        } else {
          this.logger.warn(
            `Client certificate not found at ${certPath} for broker ${config.host}`
          );
        }

        // Load client private key if exists
        if (fs.existsSync(keyPath)) {
          tlsConfig.key = fs.readFileSync(keyPath);
          this.logger.log(
            `Loaded client private key from file system for broker ${config.host}`
          );
        } else {
          this.logger.warn(
            `Client private key not found at ${keyPath} for broker ${config.host}`
          );
        }
      }

      // Cache the TLS configuration
      this.tlsConfigurations.set(config.id, tlsConfig);

      return tlsConfig;
    } catch (error) {
      this.logger.error(
        `Failed to load TLS configuration for broker ${config.host}`,
        error
      );
      throw error;
    }
  }

  /**
   * Load and validate authentication configuration for a broker
   */
  private loadAuthenticationConfiguration(
    config: UnsBrokerConfiguration
  ): AuthenticationConfig {
    // Check if we have cached auth config
    if (this.authConfigurations.has(config.id)) {
      return this.authConfigurations.get(config.id)!;
    }

    // Create authentication configuration based on broker settings
    const authConfig: AuthenticationConfig = {
      requireClientCertificate: !!(config.tls && config.validateCertificate),
      requireUsernamePassword: !!(config.username && config.password),
      allowAnonymous: !config.username && !config.password && !config.tls,
      topicACLs: this.loadTopicACLs(config),
      maxAuthRetries: 3,
      authTimeoutMs: 10000,
    };

    // Cache the configuration
    this.authConfigurations.set(config.id, authConfig);

    this.logger.debug(
      `Authentication configuration for broker ${config.host}:`,
      {
        requireClientCertificate: authConfig.requireClientCertificate,
        requireUsernamePassword: authConfig.requireUsernamePassword,
        allowAnonymous: authConfig.allowAnonymous,
        aclRulesCount: authConfig.topicACLs.length,
      }
    );

    return authConfig;
  }

  /**
   * Load topic ACL rules for a broker
   */
  private loadTopicACLs(config: UnsBrokerConfiguration): TopicACL[] {
    const acls: TopicACL[] = [];

    // Default ACL based on broker configuration
    if (config.baseTopicPath && config.baseTopicPath !== "#") {
      acls.push({
        pattern: config.baseTopicPath,
        permissions: ["read", "write", "subscribe", "publish"],
        description: "Base topic path access",
      });
    }

    // Add ACLs for subscription topics
    if (config.subscriptions) {
      try {
        const subscriptions = Array.isArray(config.subscriptions)
          ? config.subscriptions
          : JSON.parse(config.subscriptions as string);

        if (Array.isArray(subscriptions)) {
          subscriptions.forEach((topic: string) => {
            acls.push({
              pattern: topic,
              permissions: ["read", "subscribe"],
              description: `Subscription topic: ${topic}`,
            });
          });
        }
      } catch (error) {
        this.logger.warn(
          `Failed to parse subscriptions for ACL generation: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // If no specific ACLs, use default allow-all
    if (acls.length === 0) {
      acls.push(...this.defaultAuthConfig.topicACLs);
    }

    return acls;
  }

  /**
   * Validate authentication for a broker connection
   */
  private async validateAuthentication(
    config: UnsBrokerConfiguration,
    tlsConfig: TlsConfiguration | null
  ): Promise<AuthenticationEvent> {
    const authConfig = this.loadAuthenticationConfiguration(config);
    const timestamp = new Date();

    let authMethod: "certificate" | "username_password" | "hybrid" =
      "username_password";
    let success = false;
    let error: string | undefined;

    try {
      // Determine authentication method
      const hasCertAuth = tlsConfig && (tlsConfig.cert || tlsConfig.key);
      const hasUserAuth = config.username && config.password;

      if (hasCertAuth && hasUserAuth) {
        authMethod = "hybrid";
      } else if (hasCertAuth) {
        authMethod = "certificate";
      } else if (hasUserAuth) {
        authMethod = "username_password";
      }

      // Validate authentication requirements
      if (authConfig.requireClientCertificate && !hasCertAuth) {
        throw new Error(
          "Client certificate authentication required but not configured"
        );
      }

      if (authConfig.requireUsernamePassword && !hasUserAuth) {
        throw new Error(
          "Username/password authentication required but not configured"
        );
      }

      if (!authConfig.allowAnonymous && !hasCertAuth && !hasUserAuth) {
        throw new Error(
          "Anonymous connections not allowed and no authentication configured"
        );
      }

      // Additional certificate validation
      if (hasCertAuth && tlsConfig) {
        if (!tlsConfig.cert) {
          throw new Error("Client certificate file not found or invalid");
        }
        if (!tlsConfig.key) {
          throw new Error("Client private key file not found or invalid");
        }
        if (authConfig.requireClientCertificate && !tlsConfig.ca) {
          this.logger.warn(
            `CA certificate not found for broker ${config.host}, certificate validation may fail`
          );
        }
      }

      success = true;
      this.logger.log(
        `Authentication validation successful for broker ${config.host} using ${authMethod}`
      );
    } catch (validationError) {
      error =
        validationError instanceof Error
          ? validationError.message
          : String(validationError);
      success = false;
      this.logger.error(
        `Authentication validation failed for broker ${config.host}: ${error}`
      );
    }

    const authEvent: AuthenticationEvent = {
      brokerId: config.id,
      authMethod,
      success,
      timestamp,
      error,
      clientId: `whk-mes-${config.id}-${timestamp.getTime()}`,
    };

    // Emit authentication event
    this.authEventSubject.next(authEvent);
    this.emitEvent({
      type: success ? "auth_success" : "auth_failure",
      data: authEvent,
      brokerId: config.id,
    });

    return authEvent;
  }

  /**
   * Check if a topic is allowed based on ACL rules
   */
  private isTopicAllowed(
    brokerId: string,
    topic: string,
    permission: "read" | "write" | "subscribe" | "publish"
  ): boolean {
    const authConfig = this.authConfigurations.get(brokerId);
    if (!authConfig) {
      this.logger.warn(
        `No authentication configuration found for broker ${brokerId}, allowing topic access`
      );
      return true;
    }

    // Check each ACL rule
    for (const acl of authConfig.topicACLs) {
      if (
        this.matchesTopicPattern(topic, acl.pattern) &&
        acl.permissions.includes(permission)
      ) {
        this.logger.debug(
          `Topic ${topic} allowed for ${permission} by ACL rule: ${acl.pattern}`
        );
        return true;
      }
    }

    this.logger.warn(
      `Topic ${topic} denied for ${permission} - no matching ACL rule found`
    );
    return false;
  }

  /**
   * Check if a topic matches a pattern (supports MQTT wildcards)
   */
  private matchesTopicPattern(topic: string, pattern: string): boolean {
    // Handle exact match
    if (topic === pattern) {
      return true;
    }

    // Handle wildcard patterns
    if (pattern === "#") {
      return true; // Matches everything
    }

    // Convert MQTT pattern to regex
    const regexPattern = pattern
      .replace(/\+/g, "[^/]+") // + matches single level
      .replace(/#$/, ".*"); // # at end matches multiple levels

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(topic);
  }

  /**
   * Get authentication events observable
   */
  getAuthenticationEventObservable(): Observable<AuthenticationEvent> {
    return this.authEventSubject.asObservable();
  }

  /**
   * Get authentication configuration for a broker
   */
  getAuthenticationConfiguration(
    brokerId: string
  ): AuthenticationConfig | undefined {
    return this.authConfigurations.get(brokerId);
  }

  /**
   * Update authentication configuration for a broker
   */
  updateAuthenticationConfiguration(
    brokerId: string,
    authConfig: Partial<AuthenticationConfig>
  ): void {
    const currentConfig =
      this.authConfigurations.get(brokerId) || this.defaultAuthConfig;
    const updatedConfig = { ...currentConfig, ...authConfig };
    this.authConfigurations.set(brokerId, updatedConfig);

    this.logger.log(
      `Updated authentication configuration for broker ${brokerId}`
    );
  }

  /**
   * Connect to a specific broker
   */
  async connectToBroker(config: UnsBrokerConfiguration): Promise<void> {
    try {
      // Determine the appropriate port and protocol based on TLS configuration
      const useTls = config.tls ?? false;
      const defaultPort = useTls ? 8883 : 1883;
      const port = config.port || defaultPort;
      const protocol = useTls ? "mqtts" : "mqtt";

      this.logger.log(
        `Connecting to MQTT broker: ${config.host}:${port} (TLS: ${useTls})`
      );

      // Disconnect existing client if any
      if (this.clients.has(config.id)) {
        await this.disconnectFromBroker(config.id);
      }

      // Load TLS configuration if needed
      let tlsConfig: TlsConfiguration | null = null;
      if (useTls) {
        tlsConfig = await this.loadTlsConfiguration(config);
      }

      // Validate authentication before connecting
      const authEvent = await this.validateAuthentication(config, tlsConfig);
      if (!authEvent.success) {
        throw new Error(`Authentication validation failed: ${authEvent.error}`);
      }

      // Get credentials from secrets management, falling back to database values
      const secretCredentials =
        await this.mqttSecretsService.getMqttCredentials(config.id);
      const username =
        secretCredentials.username || config.username || undefined;
      const password =
        secretCredentials.password || config.password || undefined;

      // Log credential source for debugging
      if (secretCredentials.username) {
        this.logger.debug(
          `Using username from secrets management for broker ${config.host}`
        );
      } else if (config.username) {
        this.logger.debug(
          `Using username from database configuration for broker ${config.host}`
        );
      }

      const clientOptions: IClientOptions = {
        host: config.host,
        port: port,
        protocol: protocol as any,
        username,
        password,
        clientId: authEvent.clientId || `whk-mes-${config.id}-${Date.now()}`,
        clean: true,
        keepalive: 60,
        connectTimeout: 30000,
        reconnectPeriod: 5000,
        // TLS-specific options
        ...(tlsConfig && {
          ca: tlsConfig.ca,
          cert: tlsConfig.cert,
          key: tlsConfig.key,
          rejectUnauthorized: tlsConfig.rejectUnauthorized,
          servername: tlsConfig.servername,
        }),
      };

      // Log connection attempt details (without sensitive data)
      this.logger.debug(`Connection options for ${config.host}:`, {
        host: clientOptions.host,
        port: clientOptions.port,
        protocol: clientOptions.protocol,
        username: clientOptions.username ? "[SET]" : "[NOT SET]",
        password: clientOptions.password ? "[SET]" : "[NOT SET]",
        tls: useTls,
        authMethod: authEvent.authMethod,
        rejectUnauthorized: tlsConfig?.rejectUnauthorized,
        hasCaCert: !!tlsConfig?.ca,
        hasClientCert: !!tlsConfig?.cert,
        hasClientKey: !!tlsConfig?.key,
      });

      const client = connect(clientOptions);

      // Set up event handlers
      this.setupClientEventHandlers(client, config, authEvent.authMethod);

      // Store client
      this.clients.set(config.id, client);
    } catch (error) {
      this.logger.error(`Failed to connect to broker ${config.host}`, error);
      this.emitEvent({
        type: "error",
        data: error as Error,
        brokerId: config.id,
      });
    }
  }

  /**
   * Set up event handlers for MQTT client
   */
  private setupClientEventHandlers(
    client: MqttClient,
    config: UnsBrokerConfiguration,
    authMethod: string
  ): void {
    client.on("connect", () => {
      this.logger.log(
        `Connected to MQTT broker: ${config.host} using ${authMethod} authentication`
      );
      this.updateConnectionStatus(config.id, true);
      this.emitEvent({
        type: "connect",
        data: {
          brokerId: config.id,
          connected: true,
          timestamp: new Date(),
          authMethod,
          tlsEnabled: config.tls ?? false,
        },
        brokerId: config.id,
      });

      // Subscribe to configured topics with ACL validation
      this.subscribeToConfiguredTopics(client, config);
    });

    client.on("disconnect", () => {
      this.logger.warn(`Disconnected from MQTT broker: ${config.host}`);
      this.updateConnectionStatus(config.id, false);
      this.emitEvent({
        type: "disconnect",
        data: {
          brokerId: config.id,
          connected: false,
          timestamp: new Date(),
          authMethod,
          tlsEnabled: config.tls ?? false,
        },
        brokerId: config.id,
      });
    });

    client.on("error", (error) => {
      this.logger.error(`MQTT client error for broker ${config.host}`, error);
      this.updateConnectionStatus(config.id, false, error.message);
      this.emitEvent({
        type: "error",
        data: error,
        brokerId: config.id,
      });
    });

    client.on("reconnect", () => {
      this.logger.log(`Reconnecting to MQTT broker: ${config.host}`);
      this.emitEvent({
        type: "reconnect",
        data: {
          brokerId: config.id,
          connected: false,
          timestamp: new Date(),
          authMethod,
          tlsEnabled: config.tls ?? false,
        },
        brokerId: config.id,
      });
    });

    client.on("message", (topic, payload) => {
      // Validate ACL for message reading
      if (!this.isTopicAllowed(config.id, topic, "read")) {
        this.logger.warn(
          `Message received on unauthorized topic ${topic} from broker ${config.host}`
        );
        return;
      }

      this.logger.debug(
        `Received message on topic ${topic} from broker ${config.host}`
      );
      this.emitEvent({
        type: "message",
        data: {
          topic,
          payload,
          timestamp: new Date(),
          brokerId: config.id,
        },
        brokerId: config.id,
      });
    });
  }

  /**
   * Subscribe to configured topics for a broker
   */
  private subscribeToConfiguredTopics(
    client: MqttClient,
    config: UnsBrokerConfiguration
  ): void {
    // Subscribe to base topic path if configured
    if (config.baseTopicPath && config.baseTopicPath !== "#") {
      // Validate ACL for base topic subscription
      if (!this.isTopicAllowed(config.id, config.baseTopicPath, "subscribe")) {
        this.logger.warn(
          `Base topic ${config.baseTopicPath} subscription denied by ACL rules for broker ${config.host}`
        );
      } else {
        client.subscribe(config.baseTopicPath, (error) => {
          if (error) {
            this.logger.error(
              `Failed to subscribe to base topic ${config.baseTopicPath} on broker ${config.host}`,
              error
            );
          } else {
            this.logger.log(
              `Subscribed to base topic ${config.baseTopicPath} on broker ${config.host}`
            );
          }
        });
      }
    }

    // Subscribe to additional topics from subscriptions field if configured
    if (config.subscriptions) {
      try {
        const subscriptions = Array.isArray(config.subscriptions)
          ? config.subscriptions
          : JSON.parse(config.subscriptions as string);

        if (Array.isArray(subscriptions)) {
          subscriptions.forEach((topic: string) => {
            // Validate ACL for each subscription topic
            if (!this.isTopicAllowed(config.id, topic, "subscribe")) {
              this.logger.warn(
                `Subscription topic ${topic} denied by ACL rules for broker ${config.host}`
              );
            } else {
              client.subscribe(topic, (error) => {
                if (error) {
                  this.logger.error(
                    `Failed to subscribe to topic ${topic} on broker ${config.host}`,
                    error
                  );
                } else {
                  this.logger.log(
                    `Subscribed to topic ${topic} on broker ${config.host}`
                  );
                }
              });
            }
          });
        }
      } catch (error) {
        this.logger.error(
          `Failed to parse subscriptions for broker ${config.host}`,
          error
        );
      }
    }
  }

  /**
   * Disconnect from a specific broker
   */
  async disconnectFromBroker(brokerId: string): Promise<void> {
    const client = this.clients.get(brokerId);
    if (client) {
      return new Promise((resolve) => {
        client.end(false, {}, () => {
          this.clients.delete(brokerId);
          this.updateConnectionStatus(brokerId, false);
          this.logger.log(`Disconnected from broker ${brokerId}`);
          resolve();
        });
      });
    }
  }

  /**
   * Disconnect from all brokers
   */
  async disconnectFromAllBrokers(): Promise<void> {
    const disconnectionPromises = Array.from(this.clients.keys()).map(
      (brokerId) => this.disconnectFromBroker(brokerId)
    );

    await Promise.allSettled(disconnectionPromises);
  }

  /**
   * Publish a message to a specific broker
   */
  async publish(
    brokerId: string,
    topic: string,
    message: string | Buffer,
    options?: any
  ): Promise<void> {
    const client = this.clients.get(brokerId);
    if (!client || !client.connected) {
      throw new Error(`Broker ${brokerId} is not connected`);
    }

    // Validate ACL for publishing
    if (!this.isTopicAllowed(brokerId, topic, "publish")) {
      throw new Error(
        `Publishing to topic ${topic} is not allowed by ACL rules`
      );
    }

    return new Promise((resolve, reject) => {
      client.publish(topic, message, options, (error) => {
        if (error) {
          this.logger.error(
            `Failed to publish message to topic ${topic} on broker ${brokerId}`,
            error
          );
          reject(error);
        } else {
          this.logger.debug(
            `Published message to topic ${topic} on broker ${brokerId}`
          );

          // Emit WebSocket event for published message
          this.emitEvent({
            type: "message",
            brokerId,
            data: {
              topic,
              payload: Buffer.isBuffer(message)
                ? message
                : Buffer.from(message),
              timestamp: new Date(),
              brokerId,
            },
          });

          resolve();
        }
      });
    });
  }

  /**
   * Subscribe to a topic on a specific broker
   */
  async subscribe(
    brokerId: string,
    topic: string,
    options?: any
  ): Promise<void> {
    const client = this.clients.get(brokerId);
    if (!client || !client.connected) {
      throw new Error(`Broker ${brokerId} is not connected`);
    }

    // Validate ACL for subscribing
    if (!this.isTopicAllowed(brokerId, topic, "subscribe")) {
      throw new Error(
        `Subscribing to topic ${topic} is not allowed by ACL rules`
      );
    }

    return new Promise((resolve, reject) => {
      client.subscribe(topic, options, (error) => {
        if (error) {
          this.logger.error(
            `Failed to subscribe to topic ${topic} on broker ${brokerId}`,
            error
          );
          reject(error);
        } else {
          this.logger.log(`Subscribed to topic ${topic} on broker ${brokerId}`);
          resolve();
        }
      });
    });
  }

  /**
   * Unsubscribe from a topic on a specific broker
   */
  async unsubscribe(brokerId: string, topic: string): Promise<void> {
    const client = this.clients.get(brokerId);
    if (!client || !client.connected) {
      throw new Error(`Broker ${brokerId} is not connected`);
    }

    return new Promise((resolve, reject) => {
      client.unsubscribe(topic, (error) => {
        if (error) {
          this.logger.error(
            `Failed to unsubscribe from topic ${topic} on broker ${brokerId}`,
            error
          );
          reject(error);
        } else {
          this.logger.log(
            `Unsubscribed from topic ${topic} on broker ${brokerId}`
          );
          resolve();
        }
      });
    });
  }

  /**
   * Get observable for MQTT events
   */
  getEventObservable(): Observable<MqttEvent> {
    return this.eventSubject.asObservable();
  }

  /**
   * Get observable for connection status
   */
  getConnectionStatusObservable(): Observable<Map<string, boolean>> {
    return this.connectionStatusSubject.asObservable();
  }

  /**
   * Get current connection status for all brokers
   */
  getConnectionStatus(): Map<string, boolean> {
    return new Map(this.connectionStatusSubject.value);
  }

  /**
   * Check if a specific broker is connected
   */
  isBrokerConnected(brokerId: string): boolean {
    return this.connectionStatusSubject.value.get(brokerId) || false;
  }

  /**
   * Get list of connected broker IDs
   */
  getConnectedBrokers(): string[] {
    return Array.from(this.connectionStatusSubject.value.entries())
      .filter(([, connected]) => connected)
      .map(([brokerId]) => brokerId);
  }

  /**
   * Get broker configuration by ID
   */
  getBrokerConfiguration(brokerId: string): UnsBrokerConfiguration | undefined {
    return this.brokerConfigurations.get(brokerId);
  }

  /**
   * Get all broker configurations
   */
  getAllBrokerConfigurations(): UnsBrokerConfiguration[] {
    return Array.from(this.brokerConfigurations.values());
  }

  /**
   * Reload configurations from database and reconnect
   */
  async reloadConfigurations(): Promise<void> {
    this.logger.log("Reloading MQTT broker configurations...");

    // Disconnect from all current brokers
    await this.disconnectFromAllBrokers();

    // Reload configurations
    await this.loadConfigurationsFromDatabase();

    // Reconnect to all brokers
    await this.connectToAllBrokers();

    this.logger.log("MQTT broker configurations reloaded successfully");
  }

  /**
   * Update connection status for a broker
   */
  private updateConnectionStatus(
    brokerId: string,
    connected: boolean,
    error?: string
  ): void {
    const currentStatus = new Map(this.connectionStatusSubject.value);
    currentStatus.set(brokerId, connected);
    this.connectionStatusSubject.next(currentStatus);
  }

  /**
   * Emit an event to subscribers
   */
  private emitEvent(event: MqttEvent): void {
    this.eventSubject.next(event);
  }

  // Hot-reload mechanism methods
  private startHotReloadWatcher(): void {
    if (this.hotReloadInterval) {
      clearInterval(this.hotReloadInterval);
    }
    this.hotReloadInterval = setInterval(
      () => this.checkConfigurations(),
      this.HOT_RELOAD_CHECK_INTERVAL
    );
  }

  private stopHotReloadWatcher(): void {
    if (this.hotReloadInterval) {
      clearInterval(this.hotReloadInterval);
    }
  }

  private async checkConfigurations(): Promise<void> {
    try {
      this.logger.debug("Checking for MQTT configuration changes...");

      // Get current configurations from database
      const currentConfigurations =
        await this.prisma.unsBrokerConfiguration.findMany();

      let hasChanges = false;
      const newConfigIds = new Set(
        currentConfigurations.map((config) => config.id)
      );
      const existingConfigIds = new Set(this.configurationTimestamps.keys());

      // Check for new configurations
      for (const config of currentConfigurations) {
        const lastKnownTimestamp = this.configurationTimestamps.get(config.id);

        if (!lastKnownTimestamp || config.updatedAt > lastKnownTimestamp) {
          this.logger.log(
            `Configuration change detected for broker: ${config.host} (ID: ${config.id})`
          );
          hasChanges = true;
          break;
        }
      }

      // Check for deleted configurations
      for (const existingId of existingConfigIds) {
        if (!newConfigIds.has(existingId)) {
          this.logger.log(
            `Configuration deletion detected for broker ID: ${existingId}`
          );
          hasChanges = true;
          break;
        }
      }

      if (hasChanges) {
        this.logger.log(
          "Configuration changes detected, triggering hot-reload..."
        );
        await this.reloadConfigurations();

        // Emit hot-reload event
        this.emitEvent({
          type: "reconnect",
          data: {
            brokerId: "all",
            connected: true,
            timestamp: new Date(),
          },
        });
      }
    } catch (error) {
      this.logger.error("Error checking configuration changes", error);
    }
  }

  /**
   * Enable or disable hot-reload functionality
   */
  setHotReloadEnabled(enabled: boolean): void {
    this.isHotReloadEnabled = enabled;

    if (enabled && !this.hotReloadInterval) {
      this.startHotReloadWatcher();
      this.logger.log("Hot-reload mechanism enabled");
    } else if (!enabled && this.hotReloadInterval) {
      this.stopHotReloadWatcher();
      this.logger.log("Hot-reload mechanism disabled");
    }
  }

  /**
   * Get hot-reload status
   */
  isHotReloadActive(): boolean {
    return this.isHotReloadEnabled && this.hotReloadInterval !== null;
  }

  /**
   * Manually trigger configuration check
   */
  async triggerConfigurationCheck(): Promise<void> {
    await this.checkConfigurations();
  }

  /**
   * Clear secrets cache for all brokers
   */
  clearSecretsCache(): void {
    this.mqttSecretsService.clearCache();
    this.logger.log("Cleared MQTT secrets cache for all brokers");
  }

  /**
   * Clear secrets cache for a specific broker
   */
  clearBrokerSecretsCache(brokerId: string): void {
    this.mqttSecretsService.clearBrokerCache(brokerId);
    this.logger.log(`Cleared MQTT secrets cache for broker ${brokerId}`);
  }

  /**
   * Validate secrets availability for a broker
   */
  async validateBrokerSecrets(brokerId: string): Promise<{
    hasSecrets: boolean;
    tlsValidation: { valid: boolean; missing: string[] };
    authValidation: { valid: boolean; missing: string[] };
  }> {
    const hasSecrets = await this.mqttSecretsService.hasSecretsForBroker(
      brokerId
    );
    const tlsValidation = await this.mqttSecretsService.validateTlsSecrets(
      brokerId
    );
    const authValidation = await this.mqttSecretsService.validateAuthSecrets(
      brokerId
    );

    return {
      hasSecrets,
      tlsValidation,
      authValidation,
    };
  }

  /**
   * Reload secrets and reconnect to a specific broker
   */
  async reloadBrokerSecrets(brokerId: string): Promise<void> {
    this.logger.log(`Reloading secrets for broker ${brokerId}...`);

    // Clear secrets cache for this broker
    this.clearBrokerSecretsCache(brokerId);

    // Get broker configuration
    const config = this.brokerConfigurations.get(brokerId);
    if (!config) {
      throw new Error(`Broker configuration not found for ID: ${brokerId}`);
    }

    // Disconnect and reconnect
    await this.disconnectFromBroker(brokerId);
    await this.connectToBroker(config);

    this.logger.log(
      `Successfully reloaded secrets and reconnected broker ${brokerId}`
    );
  }

  /**
   * Get secrets management status for all brokers
   */
  async getSecretsStatus(): Promise<
    Map<
      string,
      {
        brokerId: string;
        brokerHost: string;
        hasSecrets: boolean;
        tlsValid: boolean;
        authValid: boolean;
        connected: boolean;
      }
    >
  > {
    const status = new Map();

    for (const [brokerId, config] of this.brokerConfigurations) {
      const validation = await this.validateBrokerSecrets(brokerId);
      const connected = this.isBrokerConnected(brokerId);

      status.set(brokerId, {
        brokerId,
        brokerHost: config.host,
        hasSecrets: validation.hasSecrets,
        tlsValid: validation.tlsValidation.valid,
        authValid: validation.authValidation.valid,
        connected,
      });
    }

    return status;
  }
}
