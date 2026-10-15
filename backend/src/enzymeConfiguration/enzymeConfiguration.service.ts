import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  Prisma,
  EnzymeConfiguration as PrismaEnzymeConfiguration,
  EnumEnzymeCategory,
} from "@prisma/client";
import { CreateEnzymeConfigurationDto } from "./dto/create-enzyme-configuration.dto";
import { UpdateEnzymeConfigurationDto } from "./dto/update-enzyme-configuration.dto";
import { EnzymeConfigurationResponseDto } from "./dto/enzyme-configuration-response.dto";
import { PaginatedResponseDto } from "./dto/pagination.dto";
import { SearchEnzymeConfigurationDto } from "./dto/search-enzyme-configuration.dto";
import {
  BulkCreateEnzymeConfigurationDto,
  BulkCreateResponseDto,
} from "./dto/bulk-create-enzyme-configuration.dto";
import {
  BulkUpdateEnzymeConfigurationDto,
  BulkUpdateResponseDto,
} from "./dto/bulk-update-enzyme-configuration.dto";
import {
  BulkDeleteEnzymeConfigurationDto,
  BulkDeleteResponseDto,
} from "./dto/bulk-delete-enzyme-configuration.dto";
import {
  EnzymeCalculatorInputDto,
  EnzymeCalculatorResponseDto,
  EnzymeCalculationResultDto,
} from "./dto/enzyme-calculator.dto";
import { SecurityUtil } from "./utils/security.util";

@Injectable()
export class EnzymeConfigurationService {
  private readonly logger = new Logger(EnzymeConfigurationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all enzyme configurations
   */
  async findAll(
    args?: Prisma.EnzymeConfigurationFindManyArgs
  ): Promise<EnzymeConfigurationResponseDto[]> {
    try {
      this.logger.log("Fetching all enzyme configurations");

      const configurations = await this.prisma.enzymeConfiguration.findMany({
        ...args,
        include: {
          item: {
            select: {
              id: true,
              itemName: true,
              itemNumber: true,
            },
          },
        },
        orderBy: {
          category: "asc",
        },
      });

      return configurations.map((config) =>
        EnzymeConfigurationResponseDto.fromEntity(config)
      );
    } catch (error) {
      this.logger.error("Failed to fetch enzyme configurations", error);
      throw new BadRequestException("Failed to fetch enzyme configurations");
    }
  }

  /**
   * Get enzyme configurations by category
   */
  async findByCategory(
    category: EnumEnzymeCategory
  ): Promise<EnzymeConfigurationResponseDto[]> {
    try {
      this.logger.log(
        `Fetching enzyme configurations for category: ${category}`
      );

      return this.findAll({
        where: {
          category,
          active: true,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to fetch enzyme configurations for category: ${category}`,
        error
      );
      throw new BadRequestException(
        `Failed to fetch enzyme configurations for category: ${category}`
      );
    }
  }

  /**
   * Get a single enzyme configuration by ID
   */
  async findOne(id: string): Promise<EnzymeConfigurationResponseDto> {
    try {
      // Validate and sanitize ID
      const sanitizedId = SecurityUtil.sanitizeString(id, 50);
      if (!SecurityUtil.isValidCUID(sanitizedId)) {
        throw new BadRequestException("Invalid enzyme configuration ID format");
      }

      this.logger.log(`Fetching enzyme configuration with ID: ${sanitizedId}`);

      const configuration = await this.prisma.enzymeConfiguration.findUnique({
        where: { id: sanitizedId },
        include: {
          item: {
            select: {
              id: true,
              itemName: true,
              itemNumber: true,
            },
          },
          calculationRules: {
            where: { active: true },
          },
        },
      });

      if (!configuration) {
        throw new NotFoundException(
          `Enzyme configuration with ID ${sanitizedId} not found`
        );
      }

      return EnzymeConfigurationResponseDto.fromEntity(configuration);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to fetch enzyme configuration with ID: ${id}`,
        error
      );
      throw new BadRequestException(
        `Failed to fetch enzyme configuration with ID: ${id}`
      );
    }
  }

  /**
   * Get enzyme configuration by item ID
   */
  async findByItemId(
    itemId: string
  ): Promise<EnzymeConfigurationResponseDto | null> {
    try {
      // Validate and sanitize item ID
      const sanitizedItemId = SecurityUtil.sanitizeString(itemId, 50);
      if (!SecurityUtil.isValidCUID(sanitizedItemId)) {
        throw new BadRequestException("Invalid item ID format");
      }

      this.logger.log(
        `Fetching enzyme configuration for item ID: ${sanitizedItemId}`
      );

      const configuration = await this.prisma.enzymeConfiguration.findUnique({
        where: { itemId: sanitizedItemId },
        include: {
          item: {
            select: {
              id: true,
              itemName: true,
              itemNumber: true,
            },
          },
        },
      });

      return configuration
        ? EnzymeConfigurationResponseDto.fromEntity(configuration)
        : null;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(
        `Failed to fetch enzyme configuration for item ID: ${itemId}`,
        error
      );
      throw new BadRequestException(
        `Failed to fetch enzyme configuration for item ID: ${itemId}`
      );
    }
  }

  /**
   * Create a new enzyme configuration
   */
  async create(
    createDto: CreateEnzymeConfigurationDto
  ): Promise<EnzymeConfigurationResponseDto> {
    try {
      // Sanitize and validate inputs
      const sanitizedItemId = SecurityUtil.sanitizeString(createDto.itemId, 50);
      if (!SecurityUtil.isValidCUID(sanitizedItemId)) {
        throw new BadRequestException("Invalid item ID format");
      }

      const sanitizedCreatedBy = SecurityUtil.validateUserId(
        createDto.createdBy
      );
      const sanitizedInstructions = SecurityUtil.sanitizeInstructions(
        createDto.instructions
      );
      const validatedCategory = SecurityUtil.validateEnum(
        createDto.category,
        EnumEnzymeCategory,
        "category"
      );
      const validatedDose = SecurityUtil.validateNumber(
        createDto.dosePerMetricTon,
        0,
        1000
      );

      this.logger.log(
        `Creating enzyme configuration for item: ${sanitizedItemId}`
      );

      // Check if item exists
      const item = await this.prisma.item.findUnique({
        where: { id: sanitizedItemId },
      });

      if (!item) {
        throw new NotFoundException(
          `Item with ID ${sanitizedItemId} not found`
        );
      }

      // Check if configuration already exists for this item
      const existingConfig = await this.prisma.enzymeConfiguration.findUnique({
        where: { itemId: sanitizedItemId },
      });

      if (existingConfig) {
        throw new ConflictException(
          `Enzyme configuration already exists for item ${sanitizedItemId}`
        );
      }

      const configuration = await this.prisma.enzymeConfiguration.create({
        data: {
          itemId: sanitizedItemId,
          category: validatedCategory,
          dosePerMetricTon: validatedDose,
          instructions: sanitizedInstructions,
          createdBy: sanitizedCreatedBy,
          schemaVersion: SecurityUtil.sanitizeString(
            createDto.schemaVersion || "0001-a",
            20
          ),
        },
        include: {
          item: {
            select: {
              id: true,
              itemName: true,
              itemNumber: true,
            },
          },
        },
      });

      this.logger.log(
        `Successfully created enzyme configuration with ID: ${configuration.id}`
      );
      return EnzymeConfigurationResponseDto.fromEntity(configuration);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error("Failed to create enzyme configuration", error);
      throw new BadRequestException("Failed to create enzyme configuration");
    }
  }

  /**
   * Update an enzyme configuration
   */
  async update(
    id: string,
    updateDto: UpdateEnzymeConfigurationDto
  ): Promise<EnzymeConfigurationResponseDto> {
    try {
      // Validate and sanitize ID
      const sanitizedId = SecurityUtil.sanitizeString(id, 50);
      if (!SecurityUtil.isValidCUID(sanitizedId)) {
        throw new BadRequestException("Invalid enzyme configuration ID format");
      }

      this.logger.log(`Updating enzyme configuration with ID: ${sanitizedId}`);

      // Check if configuration exists
      const existingConfig = await this.prisma.enzymeConfiguration.findUnique({
        where: { id: sanitizedId },
      });

      if (!existingConfig) {
        throw new NotFoundException(
          `Enzyme configuration with ID ${sanitizedId} not found`
        );
      }

      // Sanitize and validate update data
      const updateData: any = {};

      if (updateDto.itemId !== undefined) {
        const sanitizedItemId = SecurityUtil.sanitizeString(
          updateDto.itemId,
          50
        );
        if (!SecurityUtil.isValidCUID(sanitizedItemId)) {
          throw new BadRequestException("Invalid item ID format");
        }

        // If itemId is being updated, check if the new item exists and doesn't have a config
        if (sanitizedItemId !== existingConfig.itemId) {
          const item = await this.prisma.item.findUnique({
            where: { id: sanitizedItemId },
          });

          if (!item) {
            throw new NotFoundException(
              `Item with ID ${sanitizedItemId} not found`
            );
          }

          const conflictingConfig =
            await this.prisma.enzymeConfiguration.findUnique({
              where: { itemId: sanitizedItemId },
            });

          if (conflictingConfig) {
            throw new ConflictException(
              `Enzyme configuration already exists for item ${sanitizedItemId}`
            );
          }
        }

        updateData.itemId = sanitizedItemId;
      }

      if (updateDto.category !== undefined) {
        updateData.category = SecurityUtil.validateEnum(
          updateDto.category,
          EnumEnzymeCategory,
          "category"
        );
      }

      if (updateDto.dosePerMetricTon !== undefined) {
        updateData.dosePerMetricTon = SecurityUtil.validateNumber(
          updateDto.dosePerMetricTon,
          0,
          1000
        );
      }

      if (updateDto.instructions !== undefined) {
        updateData.instructions = SecurityUtil.sanitizeInstructions(
          updateDto.instructions
        );
      }

      if (updateDto.schemaVersion !== undefined) {
        updateData.schemaVersion = SecurityUtil.sanitizeString(
          updateDto.schemaVersion,
          20
        );
      }

      if (updateDto.updatedBy !== undefined) {
        updateData.updatedBy = SecurityUtil.validateUserId(updateDto.updatedBy);
      }

      const configuration = await this.prisma.enzymeConfiguration.update({
        where: { id: sanitizedId },
        data: updateData,
        include: {
          item: {
            select: {
              id: true,
              itemName: true,
              itemNumber: true,
            },
          },
        },
      });

      this.logger.log(
        `Successfully updated enzyme configuration with ID: ${sanitizedId}`
      );
      return EnzymeConfigurationResponseDto.fromEntity(configuration);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to update enzyme configuration with ID: ${id}`,
        error
      );
      throw new BadRequestException(
        `Failed to update enzyme configuration with ID: ${id}`
      );
    }
  }

  /**
   * Soft delete an enzyme configuration (set active to false)
   */
  async remove(id: string, updatedBy: string): Promise<void> {
    try {
      // Validate and sanitize inputs
      const sanitizedId = SecurityUtil.sanitizeString(id, 50);
      if (!SecurityUtil.isValidCUID(sanitizedId)) {
        throw new BadRequestException("Invalid enzyme configuration ID format");
      }

      const sanitizedUpdatedBy = SecurityUtil.validateUserId(updatedBy);

      this.logger.log(
        `Soft deleting enzyme configuration with ID: ${sanitizedId}`
      );

      const existingConfig = await this.prisma.enzymeConfiguration.findUnique({
        where: { id: sanitizedId },
      });

      if (!existingConfig) {
        throw new NotFoundException(
          `Enzyme configuration with ID ${sanitizedId} not found`
        );
      }

      await this.prisma.enzymeConfiguration.update({
        where: { id: sanitizedId },
        data: {
          active: false,
          updatedBy: sanitizedUpdatedBy,
        },
      });

      this.logger.log(
        `Successfully soft deleted enzyme configuration with ID: ${sanitizedId}`
      );
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to soft delete enzyme configuration with ID: ${id}`,
        error
      );
      throw new BadRequestException(
        `Failed to soft delete enzyme configuration with ID: ${id}`
      );
    }
  }

  /**
   * Hard delete an enzyme configuration (permanent removal)
   */
  async hardDelete(id: string): Promise<void> {
    try {
      // Validate and sanitize ID
      const sanitizedId = SecurityUtil.sanitizeString(id, 50);
      if (!SecurityUtil.isValidCUID(sanitizedId)) {
        throw new BadRequestException("Invalid enzyme configuration ID format");
      }

      this.logger.log(
        `Hard deleting enzyme configuration with ID: ${sanitizedId}`
      );

      const existingConfig = await this.prisma.enzymeConfiguration.findUnique({
        where: { id: sanitizedId },
      });

      if (!existingConfig) {
        throw new NotFoundException(
          `Enzyme configuration with ID ${sanitizedId} not found`
        );
      }

      await this.prisma.enzymeConfiguration.delete({
        where: { id: sanitizedId },
      });

      this.logger.log(
        `Successfully hard deleted enzyme configuration with ID: ${sanitizedId}`
      );
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to hard delete enzyme configuration with ID: ${id}`,
        error
      );
      throw new BadRequestException(
        `Failed to hard delete enzyme configuration with ID: ${id}`
      );
    }
  }

  /**
   * Get active enzyme configurations optimized for dosing calculations
   */
  async getActiveConfigurationsForDosing(): Promise<
    {
      id: string;
      category: string;
      name: string;
      dosePerMetricTon: number;
      instructions: string;
      itemId: string;
    }[]
  > {
    try {
      this.logger.log(
        "Fetching active enzyme configurations for dosing calculations"
      );

      const configurations = await this.prisma.enzymeConfiguration.findMany({
        where: { active: true },
        include: {
          item: {
            select: {
              itemName: true,
            },
          },
        },
        orderBy: [{ category: "asc" }, { item: { itemName: "asc" } }],
      });

      return configurations.map((config) => ({
        id: config.id,
        category: config.category,
        name: config.item.itemName || "Unknown",
        dosePerMetricTon: config.dosePerMetricTon,
        instructions: config.instructions,
        itemId: config.itemId,
      }));
    } catch (error) {
      this.logger.error(
        "Failed to fetch active enzyme configurations for dosing",
        error
      );
      throw new BadRequestException(
        "Failed to fetch active enzyme configurations for dosing"
      );
    }
  }

  /**
   * Get all enzyme configurations with pagination
   */
  async findAllPaginated(
    page: number = 1,
    limit: number = 10,
    sortBy: string = "createdAt",
    sortOrder: "asc" | "desc" = "desc",
    category?: EnumEnzymeCategory,
    active?: boolean
  ): Promise<PaginatedResponseDto<EnzymeConfigurationResponseDto>> {
    try {
      this.logger.log(
        `Fetching paginated enzyme configurations - Page: ${page}, Limit: ${limit}`
      );

      const where: Prisma.EnzymeConfigurationWhereInput = {};

      if (category) {
        where.category = category;
      }

      if (active !== undefined) {
        where.active = active;
      }

      const skip = (page - 1) * limit;

      // Get total count for pagination metadata
      const total = await this.prisma.enzymeConfiguration.count({ where });

      // Get paginated results
      const configurations = await this.prisma.enzymeConfiguration.findMany({
        where,
        include: {
          item: {
            select: {
              id: true,
              itemName: true,
              itemNumber: true,
            },
          },
        },
        orderBy: {
          [sortBy]: sortOrder,
        },
        skip,
        take: limit,
      });

      const responseData = configurations.map((config) =>
        EnzymeConfigurationResponseDto.fromEntity(config)
      );

      return new PaginatedResponseDto(responseData, page, limit, total);
    } catch (error) {
      this.logger.error(
        "Failed to fetch paginated enzyme configurations",
        error
      );
      throw new BadRequestException(
        "Failed to fetch paginated enzyme configurations"
      );
    }
  }

  /**
   * Search enzyme configurations with advanced filtering
   */
  async search(
    searchDto: SearchEnzymeConfigurationDto,
    page: number = 1,
    limit: number = 10,
    sortBy: string = "createdAt",
    sortOrder: "asc" | "desc" = "desc"
  ): Promise<PaginatedResponseDto<EnzymeConfigurationResponseDto>> {
    try {
      this.logger.log("Searching enzyme configurations with advanced filters");

      const where: Prisma.EnzymeConfigurationWhereInput = {};

      // Basic filters
      if (searchDto.category) {
        where.category = searchDto.category;
      }

      if (searchDto.active !== undefined) {
        where.active = searchDto.active;
      }

      if (searchDto.schemaVersion) {
        where.schemaVersion = searchDto.schemaVersion;
      }

      if (searchDto.createdBy) {
        where.createdBy = {
          contains: searchDto.createdBy,
          mode: "insensitive",
        };
      }

      if (searchDto.updatedBy) {
        where.updatedBy = {
          contains: searchDto.updatedBy,
          mode: "insensitive",
        };
      }

      // Dose range filters
      if (searchDto.minDose !== undefined || searchDto.maxDose !== undefined) {
        where.dosePerMetricTon = {};
        if (searchDto.minDose !== undefined) {
          where.dosePerMetricTon.gte = searchDto.minDose;
        }
        if (searchDto.maxDose !== undefined) {
          where.dosePerMetricTon.lte = searchDto.maxDose;
        }
      }

      // Instructions search
      if (searchDto.instructions) {
        where.instructions = {
          contains: searchDto.instructions,
          mode: "insensitive",
        };
      }

      // Date range filters
      if (searchDto.createdAfter || searchDto.createdBefore) {
        where.createdAt = {};
        if (searchDto.createdAfter) {
          where.createdAt.gte = new Date(searchDto.createdAfter);
        }
        if (searchDto.createdBefore) {
          where.createdAt.lte = new Date(searchDto.createdBefore);
        }
      }

      if (searchDto.updatedAfter || searchDto.updatedBefore) {
        where.updatedAt = {};
        if (searchDto.updatedAfter) {
          where.updatedAt.gte = new Date(searchDto.updatedAfter);
        }
        if (searchDto.updatedBefore) {
          where.updatedAt.lte = new Date(searchDto.updatedBefore);
        }
      }

      // Item-related searches
      if (searchDto.itemName || searchDto.itemNumber) {
        where.item = {};
        if (searchDto.itemName) {
          where.item.itemName = {
            contains: searchDto.itemName,
            mode: "insensitive",
          };
        }
        if (searchDto.itemNumber) {
          where.item.itemNumber = {
            contains: searchDto.itemNumber,
            mode: "insensitive",
          };
        }
      }

      const skip = (page - 1) * limit;

      // Get total count for pagination metadata
      const total = await this.prisma.enzymeConfiguration.count({ where });

      // Get search results
      const configurations = await this.prisma.enzymeConfiguration.findMany({
        where,
        include: {
          item: {
            select: {
              id: true,
              itemName: true,
              itemNumber: true,
            },
          },
        },
        orderBy: {
          [sortBy]: sortOrder,
        },
        skip,
        take: limit,
      });

      const responseData = configurations.map((config) =>
        EnzymeConfigurationResponseDto.fromEntity(config)
      );

      return new PaginatedResponseDto(responseData, page, limit, total);
    } catch (error) {
      this.logger.error("Failed to search enzyme configurations", error);
      throw new BadRequestException("Failed to search enzyme configurations");
    }
  }

  /**
   * Bulk create enzyme configurations
   */
  async bulkCreate(
    bulkCreateDto: BulkCreateEnzymeConfigurationDto
  ): Promise<BulkCreateResponseDto> {
    this.logger.log(
      `Starting bulk create operation for ${bulkCreateDto.configurations.length} configurations`
    );

    const response: BulkCreateResponseDto = {
      created: [],
      failed: [],
      summary: {
        total: bulkCreateDto.configurations.length,
        successful: 0,
        failed: 0,
      },
    };

    // Process each configuration individually to handle partial failures
    for (let i = 0; i < bulkCreateDto.configurations.length; i++) {
      const config = bulkCreateDto.configurations[i];
      try {
        const created = await this.create(config);
        response.created.push(created);
        response.summary.successful++;
      } catch (error) {
        this.logger.warn(`Failed to create configuration at index ${i}`, error);
        response.failed.push({
          index: i,
          data: config,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        response.summary.failed++;
      }
    }

    this.logger.log(
      `Bulk create completed: ${response.summary.successful} successful, ${response.summary.failed} failed`
    );
    return response;
  }

  /**
   * Bulk update enzyme configurations
   */
  async bulkUpdate(
    bulkUpdateDto: BulkUpdateEnzymeConfigurationDto
  ): Promise<BulkUpdateResponseDto> {
    this.logger.log(
      `Starting bulk update operation for ${bulkUpdateDto.updates.length} configurations`
    );

    const response: BulkUpdateResponseDto = {
      updated: [],
      failed: [],
      summary: {
        total: bulkUpdateDto.updates.length,
        successful: 0,
        failed: 0,
      },
    };

    // Process each update individually to handle partial failures
    for (let i = 0; i < bulkUpdateDto.updates.length; i++) {
      const update = bulkUpdateDto.updates[i];
      try {
        const updated = await this.update(update.id, update.data);
        response.updated.push(updated);
        response.summary.successful++;
      } catch (error) {
        this.logger.warn(
          `Failed to update configuration ${update.id} at index ${i}`,
          error
        );
        response.failed.push({
          index: i,
          id: update.id,
          data: update.data,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        response.summary.failed++;
      }
    }

    this.logger.log(
      `Bulk update completed: ${response.summary.successful} successful, ${response.summary.failed} failed`
    );
    return response;
  }

  /**
   * Bulk delete enzyme configurations
   */
  async bulkDelete(
    bulkDeleteDto: BulkDeleteEnzymeConfigurationDto
  ): Promise<BulkDeleteResponseDto> {
    this.logger.log(
      `Starting bulk delete operation for ${bulkDeleteDto.ids.length} configurations`
    );

    const response: BulkDeleteResponseDto = {
      deleted: [],
      failed: [],
      summary: {
        total: bulkDeleteDto.ids.length,
        successful: 0,
        failed: 0,
        deleteType: bulkDeleteDto.hardDelete ? "hard" : "soft",
      },
    };

    // Process each deletion individually to handle partial failures
    for (let i = 0; i < bulkDeleteDto.ids.length; i++) {
      const id = bulkDeleteDto.ids[i];
      try {
        if (bulkDeleteDto.hardDelete) {
          await this.hardDelete(id);
        } else {
          await this.remove(id, bulkDeleteDto.updatedBy);
        }
        response.deleted.push(id);
        response.summary.successful++;
      } catch (error) {
        this.logger.warn(
          `Failed to delete configuration ${id} at index ${i}`,
          error
        );
        response.failed.push({
          index: i,
          id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        response.summary.failed++;
      }
    }

    this.logger.log(
      `Bulk delete completed: ${response.summary.successful} successful, ${response.summary.failed} failed`
    );
    return response;
  }

  // GraphQL-specific methods

  /**
   * Count enzyme configurations for GraphQL meta queries
   */
  async count(args?: { where?: any }): Promise<number> {
    try {
      return await this.prisma.enzymeConfiguration.count({
        where: args?.where,
      });
    } catch (error) {
      this.logger.error("Failed to count enzyme configurations", error);
      throw new BadRequestException("Failed to count enzyme configurations");
    }
  }

  /**
   * Find many enzyme configurations for GraphQL queries
   */
  async enzymeConfigurations(args?: {
    where?: any;
    skip?: number;
    take?: number;
    orderBy?: any;
  }): Promise<any[]> {
    try {
      const configurations = await this.prisma.enzymeConfiguration.findMany({
        ...args,
        include: {
          item: {
            select: {
              id: true,
              itemName: true,
              itemNumber: true,
            },
          },
        },
      });

      return configurations;
    } catch (error) {
      this.logger.error(
        "Failed to fetch enzyme configurations for GraphQL",
        error
      );
      throw new BadRequestException("Failed to fetch enzyme configurations");
    }
  }

  /**
   * Find unique enzyme configuration for GraphQL queries
   */
  async enzymeConfiguration(args: { where: any }): Promise<any | null> {
    try {
      const configuration = await this.prisma.enzymeConfiguration.findUnique({
        where: args.where,
        include: {
          item: {
            select: {
              id: true,
              itemName: true,
              itemNumber: true,
            },
          },
        },
      });

      return configuration;
    } catch (error) {
      this.logger.error(
        "Failed to fetch enzyme configuration for GraphQL",
        error
      );
      throw new BadRequestException("Failed to fetch enzyme configuration");
    }
  }

  /**
   * Create enzyme configuration for GraphQL mutations
   */
  async createEnzymeConfiguration(args: { data: any }): Promise<any> {
    try {
      const configuration = await this.prisma.enzymeConfiguration.create({
        data: args.data,
        include: {
          item: {
            select: {
              id: true,
              itemName: true,
              itemNumber: true,
            },
          },
        },
      });

      return configuration;
    } catch (error) {
      this.logger.error(
        "Failed to create enzyme configuration for GraphQL",
        error
      );
      throw new BadRequestException("Failed to create enzyme configuration");
    }
  }

  /**
   * Update enzyme configuration for GraphQL mutations
   */
  async updateEnzymeConfiguration(args: {
    where: any;
    data: any;
  }): Promise<any | null> {
    try {
      const configuration = await this.prisma.enzymeConfiguration.update({
        where: args.where,
        data: args.data,
        include: {
          item: {
            select: {
              id: true,
              itemName: true,
              itemNumber: true,
            },
          },
        },
      });

      return configuration;
    } catch (error) {
      this.logger.error(
        "Failed to update enzyme configuration for GraphQL",
        error
      );
      throw new BadRequestException("Failed to update enzyme configuration");
    }
  }

  /**
   * Delete enzyme configuration for GraphQL mutations
   */
  async deleteEnzymeConfiguration(args: { where: any }): Promise<any | null> {
    try {
      const configuration = await this.prisma.enzymeConfiguration.delete({
        where: args.where,
        include: {
          item: {
            select: {
              id: true,
              itemName: true,
              itemNumber: true,
            },
          },
        },
      });

      return configuration;
    } catch (error) {
      this.logger.error(
        "Failed to delete enzyme configuration for GraphQL",
        error
      );
      throw new BadRequestException("Failed to delete enzyme configuration");
    }
  }

  /**
   * Get related item for GraphQL field resolver
   */
  async getItem(enzymeConfigurationId: string): Promise<any | null> {
    try {
      const configuration = await this.prisma.enzymeConfiguration.findUnique({
        where: { id: enzymeConfigurationId },
        include: {
          item: true,
        },
      });

      return configuration?.item || null;
    } catch (error) {
      this.logger.error("Failed to fetch item for enzyme configuration", error);
      throw new BadRequestException("Failed to fetch item");
    }
  }

  /**
   * Calculate enzyme dosing amounts based on selected enzymes and grain load
   */
  async calculateEnzymeDosing(
    input: EnzymeCalculatorInputDto
  ): Promise<EnzymeCalculatorResponseDto> {
    try {
      this.logger.log("Calculating enzyme dosing amounts");

      // Validate input
      if (!input.enzymeSelections || input.enzymeSelections.length === 0) {
        throw new BadRequestException(
          "At least one enzyme selection is required"
        );
      }

      // Sanitize inputs
      const sanitizedGrainLoad = SecurityUtil.validateNumber(
        input.totalGrainLoadLbs,
        1000,
        50000
      );
      const sanitizedRecipeId = input.recipeId
        ? SecurityUtil.sanitizeString(input.recipeId, 50)
        : undefined;
      const sanitizedMashBill = input.mashBill
        ? SecurityUtil.sanitizeString(input.mashBill, 20)
        : undefined;

      // Validate recipe ID if provided
      if (sanitizedRecipeId && !SecurityUtil.isValidCUID(sanitizedRecipeId)) {
        throw new BadRequestException("Invalid recipe ID format");
      }

      // Get enzyme configurations for the selected enzymes
      const enzymeConfigIds = input.enzymeSelections.map((selection) =>
        SecurityUtil.sanitizeString(selection.enzymeConfigurationId, 50)
      );

      // Validate all enzyme configuration IDs
      for (const id of enzymeConfigIds) {
        if (!SecurityUtil.isValidCUID(id)) {
          throw new BadRequestException(
            `Invalid enzyme configuration ID format: ${id}`
          );
        }
      }

      const enzymeConfigurations =
        await this.prisma.enzymeConfiguration.findMany({
          where: {
            id: { in: enzymeConfigIds },
            active: true,
          },
          include: {
            item: {
              select: {
                id: true,
                itemName: true,
                itemNumber: true,
              },
            },
          },
        });

      // Check if all requested configurations were found
      if (enzymeConfigurations.length !== enzymeConfigIds.length) {
        const foundIds = enzymeConfigurations.map((config) => config.id);
        const missingIds = enzymeConfigIds.filter(
          (id) => !foundIds.includes(id)
        );
        throw new NotFoundException(
          `Enzyme configurations not found: ${missingIds.join(", ")}`
        );
      }

      // Validate that each selection matches the configuration category
      for (const selection of input.enzymeSelections) {
        const config = enzymeConfigurations.find(
          (c) => c.id === selection.enzymeConfigurationId
        );
        if (config && config.category !== selection.category) {
          throw new BadRequestException(
            `Enzyme configuration ${selection.enzymeConfigurationId} is category ${config.category}, not ${selection.category}`
          );
        }
      }

      // Convert grain load from pounds to metric tons (1 metric ton = 2204.62 lbs)
      const grainLoadMetricTons = sanitizedGrainLoad / 2204.62;

      // Calculate dosing for each enzyme
      const enzymeCalculations: EnzymeCalculationResultDto[] =
        enzymeConfigurations.map((config) => {
          // Calculate dose in pounds
          const doseLbs = config.dosePerMetricTon * grainLoadMetricTons;

          return {
            enzymeConfigurationId: config.id,
            category: config.category,
            enzymeName: config.item.itemName,
            doseLbs: Math.round(doseLbs * 100) / 100, // Round to 2 decimal places
            instructions: config.instructions,
            dosePerMetricTon: config.dosePerMetricTon,
          };
        });

      // Generate calculation ID
      const calculationId = `calc_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      // Get mash bill from recipe if recipe ID provided and mash bill not provided
      let finalMashBill = sanitizedMashBill;
      if (sanitizedRecipeId && !finalMashBill) {
        try {
          const recipe = await this.prisma.recipe.findUnique({
            where: { id: sanitizedRecipeId },
            include: {
              parameters: {
                where: {
                  recipeParamName: {
                    contains: "mash",
                    mode: "insensitive",
                  },
                },
              },
            },
          });

          if (recipe) {
            const mashBillParam = recipe.parameters.find(
              (p) =>
                p.recipeParamName?.toLowerCase().includes("mash") &&
                p.recipeParamName?.toLowerCase().includes("bill")
            );

            if (mashBillParam && mashBillParam.recipeSetpointType === "Text") {
              finalMashBill = String(
                mashBillParam.recipeNumericalSetpoint || ""
              );
            }
          }
        } catch (error) {
          this.logger.warn(
            `Could not retrieve mash bill from recipe ${sanitizedRecipeId}:`,
            error
          );
          // Continue without mash bill - it's optional
        }
      }

      const response: EnzymeCalculatorResponseDto = {
        calculationId,
        totalGrainLoadLbs: sanitizedGrainLoad,
        mashBill: finalMashBill,
        recipeId: sanitizedRecipeId,
        enzymeCalculations,
        calculatedAt: new Date().toISOString(),
        calculatedBy: "system", // TODO: Get from auth context when available
      };

      this.logger.log(`Enzyme dosing calculation completed: ${calculationId}`);
      return response;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error("Failed to calculate enzyme dosing", error);
      throw new BadRequestException("Failed to calculate enzyme dosing");
    }
  }
}
