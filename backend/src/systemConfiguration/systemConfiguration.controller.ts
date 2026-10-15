import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ParseUUIDPipe,
  ValidationPipe,
  UsePipes,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
  ApiSecurity,
  ApiBody,
  ApiConsumes,
  ApiProduces,
  ApiExtraModels,
  getSchemaPath,
} from "@nestjs/swagger";
import { IsUUID } from "class-validator";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { ACGuard, UseRoles } from "nest-access-control";
import { DefaultAuthGuard } from "../auth/defaultAuth.guard";
import { SystemConfigurationService } from "./systemConfiguration.service";
import { SystemConfiguration } from "@prisma/client";

@ApiTags("System Configurations")
@Controller("system-configurations")
@UseGuards(DefaultAuthGuard, ACGuard)
@ApiBearerAuth("JWT")
@ApiSecurity("bearer")
@ApiConsumes("application/json")
@ApiProduces("application/json")
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  })
)
export class SystemConfigurationController {
  constructor(
    private readonly systemConfigurationService: SystemConfigurationService
  ) {}

  @Get()
  @UseRoles({
    resource: "SystemConfiguration",
    action: "read",
    possession: "any",
  })
  @ApiOperation({
    summary: "Get all system configurations",
    description:
      "Retrieve all system configurations with optional filtering and pagination",
  })
  @ApiQuery({
    name: "active",
    required: false,
    type: Boolean,
    description: "Filter by active status",
  })
  @ApiQuery({
    name: "dataType",
    required: false,
    type: String,
    description: "Filter by data type (string, number, boolean, json)",
  })
  @ApiQuery({
    name: "configKey",
    required: false,
    type: String,
    description: "Filter by configuration key",
  })
  @ApiResponse({
    status: 200,
    description: "System configurations retrieved successfully",
    schema: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          configKey: { type: "string" },
          configValue: { type: "string" },
          description: { type: "string" },
          dataType: { type: "string" },
          active: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          createdBy: { type: "string" },
          updatedBy: { type: "string" },
        },
      },
    },
  })
  async findAll(
    @Query("active") active?: boolean,
    @Query("dataType") dataType?: string,
    @Query("configKey") configKey?: string
  ): Promise<SystemConfiguration[]> {
    const where: any = {};

    if (active !== undefined) {
      where.active = active;
    }

    if (dataType) {
      where.dataType = dataType;
    }

    if (configKey) {
      where.configKey = { contains: configKey, mode: "insensitive" };
    }

    return this.systemConfigurationService.findMany({
      where,
      orderBy: { configKey: "asc" },
    });
  }

  @Get(":id")
  @UseRoles({
    resource: "SystemConfiguration",
    action: "read",
    possession: "any",
  })
  @ApiOperation({
    summary: "Get system configuration by ID",
    description: "Retrieve a specific system configuration by its ID",
  })
  @ApiParam({ name: "id", description: "System configuration ID" })
  @ApiResponse({
    status: 200,
    description: "System configuration found",
    schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        configKey: { type: "string" },
        configValue: { type: "string" },
        description: { type: "string" },
        dataType: { type: "string" },
        active: { type: "boolean" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
        createdBy: { type: "string" },
        updatedBy: { type: "string" },
      },
    },
  })
  @ApiResponse({ status: 404, description: "System configuration not found" })
  async findOne(
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<SystemConfiguration> {
    const configuration = await this.systemConfigurationService.findUnique({
      where: { id },
    });

    if (!configuration) {
      throw new BadRequestException(
        `System configuration with ID ${id} not found`
      );
    }

    return configuration;
  }

  @Get("key/:configKey")
  @UseRoles({
    resource: "SystemConfiguration",
    action: "read",
    possession: "any",
  })
  @ApiOperation({
    summary: "Get system configuration by key",
    description:
      "Retrieve a specific system configuration by its configuration key",
  })
  @ApiParam({ name: "configKey", description: "Configuration key" })
  @ApiResponse({
    status: 200,
    description: "System configuration found",
    schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        configKey: { type: "string" },
        configValue: { type: "string" },
        description: { type: "string" },
        dataType: { type: "string" },
        active: { type: "boolean" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
        createdBy: { type: "string" },
        updatedBy: { type: "string" },
      },
    },
  })
  @ApiResponse({ status: 404, description: "System configuration not found" })
  async findByKey(
    @Param("configKey") configKey: string
  ): Promise<SystemConfiguration> {
    const configuration = await this.systemConfigurationService.getByKey(
      configKey
    );

    if (!configuration) {
      throw new BadRequestException(
        `System configuration with key ${configKey} not found`
      );
    }

    return configuration;
  }

  @Post()
  @UseRoles({
    resource: "SystemConfiguration",
    action: "create",
    possession: "any",
  })
  @Throttle({
    default: {
      limit: parseInt(process.env.SYSTEM_CONFIG_CREATE_LIMIT || "20"),
      ttl: 60000,
    },
  }) // Increased from 10 to 20 creates per minute
  @ApiOperation({
    summary: "Create a new system configuration",
    description: "Create a new system configuration entry",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["configKey", "configValue", "dataType", "createdBy"],
      properties: {
        configKey: { type: "string", description: "Unique configuration key" },
        configValue: {
          type: "string",
          description: "Configuration value as string",
        },
        description: { type: "string", description: "Optional description" },
        dataType: {
          type: "string",
          enum: ["string", "number", "boolean", "json"],
          description: "Data type of the value",
        },
        active: {
          type: "boolean",
          default: true,
          description: "Whether the configuration is active",
        },
        createdBy: {
          type: "string",
          description: "User who created the configuration",
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: "System configuration created successfully",
    schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        configKey: { type: "string" },
        configValue: { type: "string" },
        description: { type: "string" },
        dataType: { type: "string" },
        active: { type: "boolean" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
        createdBy: { type: "string" },
        updatedBy: { type: "string" },
      },
    },
  })
  @ApiResponse({ status: 400, description: "Bad Request - Invalid input data" })
  @ApiResponse({
    status: 409,
    description: "Conflict - Configuration key already exists",
  })
  async create(
    @Body()
    createData: {
      configKey: string;
      configValue: string;
      description?: string;
      dataType: string;
      active?: boolean;
      createdBy: string;
    }
  ): Promise<SystemConfiguration> {
    return this.systemConfigurationService.create({
      data: {
        configKey: createData.configKey,
        configValue: createData.configValue,
        description: createData.description,
        dataType: createData.dataType,
        active: createData.active ?? true,
        createdBy: createData.createdBy,
      },
    });
  }

  @Patch(":id")
  @UseRoles({
    resource: "SystemConfiguration",
    action: "update",
    possession: "any",
  })
  @ApiOperation({
    summary: "Update system configuration",
    description: "Update an existing system configuration",
  })
  @ApiParam({ name: "id", description: "System configuration ID" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        configValue: {
          type: "string",
          description: "Configuration value as string",
        },
        description: { type: "string", description: "Optional description" },
        dataType: {
          type: "string",
          enum: ["string", "number", "boolean", "json"],
          description: "Data type of the value",
        },
        active: {
          type: "boolean",
          description: "Whether the configuration is active",
        },
        updatedBy: {
          type: "string",
          description: "User who updated the configuration",
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: "System configuration updated successfully",
    schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        configKey: { type: "string" },
        configValue: { type: "string" },
        description: { type: "string" },
        dataType: { type: "string" },
        active: { type: "boolean" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
        createdBy: { type: "string" },
        updatedBy: { type: "string" },
      },
    },
  })
  @ApiResponse({ status: 404, description: "System configuration not found" })
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body()
    updateData: {
      configValue?: string;
      description?: string;
      dataType?: string;
      active?: boolean;
      updatedBy: string;
    }
  ): Promise<SystemConfiguration> {
    return this.systemConfigurationService.update({
      where: { id },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
    });
  }

  @Delete(":id")
  @UseRoles({
    resource: "SystemConfiguration",
    action: "delete",
    possession: "any",
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete system configuration",
    description: "Delete a system configuration by ID",
  })
  @ApiParam({ name: "id", description: "System configuration ID" })
  @ApiResponse({
    status: 204,
    description: "System configuration deleted successfully",
  })
  @ApiResponse({ status: 404, description: "System configuration not found" })
  async remove(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.systemConfigurationService.delete({
      where: { id },
    });
  }

  @Get("count/total")
  @UseRoles({
    resource: "SystemConfiguration",
    action: "read",
    possession: "any",
  })
  @ApiOperation({
    summary: "Get system configuration count",
    description: "Get the total count of system configurations",
  })
  @ApiQuery({
    name: "active",
    required: false,
    type: Boolean,
    description: "Filter by active status",
  })
  @ApiResponse({
    status: 200,
    description: "Count retrieved successfully",
    schema: {
      type: "object",
      properties: {
        count: { type: "number" },
      },
    },
  })
  async count(@Query("active") active?: boolean): Promise<{ count: number }> {
    const where: any = {};

    if (active !== undefined) {
      where.active = active;
    }

    const count = await this.systemConfigurationService.count({ where });
    return { count };
  }
}
