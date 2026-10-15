import { Injectable, Logger, Inject } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  Prisma,
  SystemConfiguration as PrismaSystemConfiguration,
} from "@prisma/client";
import { Cache } from "cache-manager";
import { CACHE_MANAGER } from "@nestjs/cache-manager";

@Injectable()
export class SystemConfigurationService {
  private readonly logger = new Logger(SystemConfigurationService.name);
  private readonly CACHE_TTL = 300; // 5 minutes in seconds
  private readonly CACHE_PREFIX = "system_config:";

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache
  ) {}

  /**
   * Get all system configurations
   */
  async findMany(
    args?: Prisma.SystemConfigurationFindManyArgs
  ): Promise<PrismaSystemConfiguration[]> {
    const cacheKey = `${this.CACHE_PREFIX}findMany:${JSON.stringify(args)}`;

    let configurations = await this.cacheManager.get<
      PrismaSystemConfiguration[]
    >(cacheKey);

    if (!configurations) {
      configurations = await this.prisma.systemConfiguration.findMany(args);
      await this.cacheManager.set(cacheKey, configurations, this.CACHE_TTL);
      this.logger.debug(`Cached system configurations with key: ${cacheKey}`);
    }

    return configurations;
  }

  /**
   * Get a single system configuration by unique identifier
   */
  async findUnique(
    args: Prisma.SystemConfigurationFindUniqueArgs
  ): Promise<PrismaSystemConfiguration | null> {
    const cacheKey = `${this.CACHE_PREFIX}findUnique:${JSON.stringify(args)}`;

    let configuration =
      await this.cacheManager.get<PrismaSystemConfiguration | null>(cacheKey);

    if (configuration === undefined) {
      configuration = await this.prisma.systemConfiguration.findUnique(args);
      await this.cacheManager.set(cacheKey, configuration, this.CACHE_TTL);
      this.logger.debug(`Cached system configuration with key: ${cacheKey}`);
    }

    return configuration;
  }

  /**
   * Get configuration by key
   */
  async getByKey(configKey: string): Promise<PrismaSystemConfiguration | null> {
    const cacheKey = `${this.CACHE_PREFIX}key:${configKey}`;

    let configuration =
      await this.cacheManager.get<PrismaSystemConfiguration | null>(cacheKey);

    if (configuration === undefined) {
      configuration = await this.prisma.systemConfiguration.findUnique({
        where: { configKey },
      });
      await this.cacheManager.set(cacheKey, configuration, this.CACHE_TTL);
      this.logger.debug(`Cached system configuration by key: ${configKey}`);
    }

    return configuration;
  }

  /**
   * Create a new system configuration
   */
  async create(
    args: Prisma.SystemConfigurationCreateArgs
  ): Promise<PrismaSystemConfiguration> {
    const configuration = await this.prisma.systemConfiguration.create(args);

    // Invalidate relevant caches
    await this.invalidateCache();

    this.logger.log(`Created system configuration: ${configuration.configKey}`);
    return configuration;
  }

  /**
   * Update an existing system configuration
   */
  async update(
    args: Prisma.SystemConfigurationUpdateArgs
  ): Promise<PrismaSystemConfiguration> {
    const configuration = await this.prisma.systemConfiguration.update(args);

    // Invalidate relevant caches
    await this.invalidateCache();

    this.logger.log(`Updated system configuration: ${configuration.configKey}`);
    return configuration;
  }

  /**
   * Delete a system configuration
   */
  async delete(
    args: Prisma.SystemConfigurationDeleteArgs
  ): Promise<PrismaSystemConfiguration> {
    const configuration = await this.prisma.systemConfiguration.delete(args);

    // Invalidate relevant caches
    await this.invalidateCache();

    this.logger.log(`Deleted system configuration: ${configuration.configKey}`);
    return configuration;
  }

  /**
   * Count system configurations
   */
  async count(
    args?: Omit<Prisma.SystemConfigurationCountArgs, "select">
  ): Promise<number> {
    return this.prisma.systemConfiguration.count(args);
  }

  /**
   * Upsert a system configuration (create or update)
   */
  async upsert(
    args: Prisma.SystemConfigurationUpsertArgs
  ): Promise<PrismaSystemConfiguration> {
    const configuration = await this.prisma.systemConfiguration.upsert(args);

    // Invalidate relevant caches
    await this.invalidateCache();

    this.logger.log(
      `Upserted system configuration: ${configuration.configKey}`
    );
    return configuration;
  }

  // Type-safe configuration access methods

  /**
   * Get a typed configuration value by key
   * @param configKey The configuration key to retrieve
   * @returns The typed configuration value or null if not found
   * @example
   * const metricTonDivisor = await service.getConfig<number>('METRIC_TON_DIVISOR');
   * const citricExclusionEnabled = await service.getConfig<boolean>('CITRIC_EXCLUSION_ENABLED');
   */
  async getConfig<T>(configKey: string): Promise<T | null> {
    const configuration = await this.getByKey(configKey);

    if (!configuration || !configuration.active) {
      return null;
    }

    try {
      return this.parseConfigValue<T>(
        configuration.configValue,
        configuration.dataType
      );
    } catch (error) {
      this.logger.error(
        `Failed to parse configuration value for key ${configKey}:`,
        error
      );
      return null;
    }
  }

  /**
   * Get a typed configuration value with a default fallback
   * @param configKey The configuration key to retrieve
   * @param defaultValue The default value to return if configuration is not found or invalid
   * @returns The typed configuration value or the default value
   * @example
   * const metricTonDivisor = await service.getConfigOrDefault<number>('METRIC_TON_DIVISOR', 1000);
   */
  async getConfigOrDefault<T>(configKey: string, defaultValue: T): Promise<T> {
    const value = await this.getConfig<T>(configKey);
    return value !== null ? value : defaultValue;
  }

  /**
   * Update an existing configuration with type safety
   * @param configKey The configuration key to update
   * @param value The new value to set
   * @param updatedBy The user making the update
   * @returns The updated configuration
   * @example
   * await service.updateConfig<number>('METRIC_TON_DIVISOR', 1200, 'user123');
   */
  async updateConfig<T>(
    configKey: string,
    value: T,
    updatedBy: string
  ): Promise<PrismaSystemConfiguration> {
    const dataType = this.inferDataType(value);
    const configValue = this.serializeConfigValue(value, dataType);

    return this.update({
      where: { configKey },
      data: {
        configValue,
        dataType,
        updatedBy,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Set (create or update) a configuration with type safety
   * @param configKey The configuration key to set
   * @param value The value to set
   * @param description Optional description for the configuration
   * @param createdBy The user creating/updating the configuration
   * @returns The created or updated configuration
   * @example
   * await service.setConfig<boolean>('CITRIC_EXCLUSION_ENABLED', true, 'Enable citric acid exclusion', 'user123');
   */
  async setConfig<T>(
    configKey: string,
    value: T,
    description: string | undefined,
    createdBy: string
  ): Promise<PrismaSystemConfiguration> {
    const dataType = this.inferDataType(value);
    const configValue = this.serializeConfigValue(value, dataType);

    return this.upsert({
      where: { configKey },
      create: {
        configKey,
        configValue,
        dataType,
        description,
        createdBy,
        active: true,
      },
      update: {
        configValue,
        dataType,
        description,
        updatedBy: createdBy,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Parse a configuration value based on its data type
   */
  private parseConfigValue<T>(configValue: string, dataType: string): T {
    switch (dataType) {
      case "string":
        return configValue as T;
      case "number": {
        const numValue = Number(configValue);
        if (isNaN(numValue)) {
          throw new Error(`Invalid number value: ${configValue}`);
        }
        return numValue as T;
      }
      case "boolean":
        if (configValue === "true") return true as T;
        if (configValue === "false") return false as T;
        throw new Error(`Invalid boolean value: ${configValue}`);
      case "json":
        try {
          return JSON.parse(configValue) as T;
        } catch (error) {
          throw new Error(`Invalid JSON value: ${configValue}`);
        }
      default:
        // Default to string for unknown types
        return configValue as T;
    }
  }

  /**
   * Serialize a value for storage based on its inferred type
   */
  private serializeConfigValue<T>(value: T, dataType: string): string {
    switch (dataType) {
      case "string":
        return String(value);
      case "number":
        return String(value);
      case "boolean":
        return String(value);
      case "json":
        return JSON.stringify(value);
      default:
        return String(value);
    }
  }

  /**
   * Infer the data type from a value
   */
  private inferDataType<T>(value: T): string {
    if (typeof value === "string") return "string";
    if (typeof value === "number") return "number";
    if (typeof value === "boolean") return "boolean";
    if (typeof value === "object" && value !== null) return "json";
    return "string"; // Default fallback
  }

  /**
   * Invalidate all system configuration caches
   */
  private async invalidateCache(): Promise<void> {
    try {
      // Get all cache keys that start with our prefix
      const keys = await this.cacheManager.store.keys(`${this.CACHE_PREFIX}*`);

      // Delete all matching keys
      for (const key of keys) {
        await this.cacheManager.del(key);
      }

      this.logger.debug(
        `Invalidated ${keys.length} system configuration cache entries`
      );
    } catch (error) {
      this.logger.error("Failed to invalidate cache:", error);
    }
  }

  /**
   * Refresh cache for a specific configuration key
   */
  async refreshCache(configKey: string): Promise<void> {
    const cacheKey = `${this.CACHE_PREFIX}key:${configKey}`;
    await this.cacheManager.del(cacheKey);

    // Reload from database
    await this.getByKey(configKey);

    this.logger.debug(`Refreshed cache for configuration key: ${configKey}`);
  }
}
