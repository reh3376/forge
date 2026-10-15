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
import { EnzymeConfigurationService } from "./enzymeConfiguration.service";
import { CreateEnzymeConfigurationDto } from "./dto/create-enzyme-configuration.dto";
import { UpdateEnzymeConfigurationDto } from "./dto/update-enzyme-configuration.dto";
import { EnzymeConfigurationResponseDto } from "./dto/enzyme-configuration-response.dto";
import { PaginationDto, PaginatedResponseDto } from "./dto/pagination.dto";
import { SearchEnzymeConfigurationDto } from "./dto/search-enzyme-configuration.dto";
import { EnumEnzymeCategory } from "@prisma/client";
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
} from "./dto/enzyme-calculator.dto";

@ApiTags("Enzyme Configurations")
@Controller("enzyme-configurations")
@UseGuards(DefaultAuthGuard, ACGuard)
@ApiBearerAuth("JWT")
@ApiSecurity("bearer")
@ApiConsumes("application/json")
@ApiProduces("application/json")
@ApiExtraModels(
  EnzymeConfigurationResponseDto,
  PaginatedResponseDto,
  CreateEnzymeConfigurationDto,
  UpdateEnzymeConfigurationDto,
  SearchEnzymeConfigurationDto,
  BulkCreateEnzymeConfigurationDto,
  BulkCreateResponseDto,
  BulkUpdateEnzymeConfigurationDto,
  BulkUpdateResponseDto,
  BulkDeleteEnzymeConfigurationDto,
  BulkDeleteResponseDto
)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  })
)
export class EnzymeConfigurationController {
  constructor(
    private readonly enzymeConfigurationService: EnzymeConfigurationService
  ) {}

  @Post()
  @UseRoles({
    resource: "EnzymeConfiguration",
    action: "create",
    possession: "any",
  })
  @Throttle({
    default: {
      limit: parseInt(process.env.ENZYME_CREATE_LIMIT || "15"),
      ttl: 60000,
    },
  }) // Increased from 5 to 15 creates per minute
  @ApiOperation({
    summary: "Create a new enzyme configuration",
    description: `Create a new enzyme configuration for a specific item. Each item can only have one enzyme configuration.
    
**Business Rules:**
- Item must exist in the system
- Only one configuration per item is allowed
- Dose must be between 0 and 1000 per metric ton
- Instructions are required for proper enzyme application

**Rate Limiting:** 5 requests per minute per user`,
  })
  @ApiBody({
    type: CreateEnzymeConfigurationDto,
    description: "Enzyme configuration data to create",
    examples: {
      liquifaction: {
        summary: "Liquifaction Enzyme Configuration",
        description: "Example configuration for a liquifaction enzyme",
        value: {
          itemId: "clzhhlsx30f09mbc9r5mj02z7",
          category: "LIQUIFACTION",
          dosePerMetricTon: 0.13,
          instructions:
            "Add with water/backset before grain addition. Mix thoroughly.",
          createdBy: "john.doe",
          schemaVersion: "0001-a",
        },
      },
      saccharification: {
        summary: "Saccharification Enzyme Configuration",
        description: "Example configuration for a saccharification enzyme",
        value: {
          itemId: "clzhhlsx30f09mbc9r5mj02z8",
          category: "SACCHARIFICATION",
          dosePerMetricTon: 0.25,
          instructions:
            "Add after liquifaction step when temperature drops to 85°C.",
          createdBy: "jane.smith",
          schemaVersion: "0001-a",
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: "Enzyme configuration successfully created",
    type: EnzymeConfigurationResponseDto,
    schema: {
      example: {
        id: "clzhhlsx30f09mbc9r5mj02z9",
        itemId: "clzhhlsx30f09mbc9r5mj02z7",
        category: "LIQUIFACTION",
        dosePerMetricTon: 0.13,
        instructions:
          "Add with water/backset before grain addition. Mix thoroughly.",
        active: true,
        schemaVersion: "0001-a",
        createdAt: "2024-05-30T10:30:00.000Z",
        updatedAt: "2024-05-30T10:30:00.000Z",
        createdBy: "john.doe",
        updatedBy: null,
        item: {
          id: "clzhhlsx30f09mbc9r5mj02z7",
          itemName: "Alpha-Amylase Enzyme",
          itemNumber: "ENZ-001",
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "Bad Request - Invalid input data",
    schema: {
      example: {
        statusCode: 400,
        message: [
          "itemId must be a valid CUID",
          "dosePerMetricTon must be a positive number",
        ],
        error: "Bad Request",
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing authentication token",
    schema: {
      example: {
        statusCode: 401,
        message: "Unauthorized",
        error: "Unauthorized",
      },
    },
  })
  @ApiResponse({
    status: 403,
    description:
      "Forbidden - Insufficient permissions to create enzyme configurations",
    schema: {
      example: {
        statusCode: 403,
        message: "Forbidden resource",
        error: "Forbidden",
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "Not Found - Referenced item does not exist",
    schema: {
      example: {
        statusCode: 404,
        message: "Item with ID clzhhlsx30f09mbc9r5mj02z7 not found",
        error: "Not Found",
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: "Conflict - Enzyme configuration already exists for this item",
    schema: {
      example: {
        statusCode: 409,
        message:
          "Enzyme configuration already exists for item clzhhlsx30f09mbc9r5mj02z7",
        error: "Conflict",
      },
    },
  })
  @ApiResponse({
    status: 429,
    description: "Too Many Requests - Rate limit exceeded",
    schema: {
      example: {
        statusCode: 429,
        message: "ThrottlerException: Too Many Requests",
        error: "Too Many Requests",
      },
    },
  })
  async create(
    @Body() createDto: CreateEnzymeConfigurationDto
  ): Promise<EnzymeConfigurationResponseDto> {
    return this.enzymeConfigurationService.create(createDto);
  }

  @Get()
  @UseRoles({
    resource: "EnzymeConfiguration",
    action: "read",
    possession: "any",
  })
  @ApiOperation({
    summary: "Get all enzyme configurations",
    description: `Retrieve all enzyme configurations with optional filtering by category and active status.
    
**Features:**
- Filter by enzyme category (LIQUIFACTION, SACCHARIFICATION, VISCOSITY)
- Filter by active status (true/false)
- Returns complete configuration details with item information
- Supports role-based access control

**Performance:** This endpoint returns all matching records. For large datasets, consider using the paginated endpoint.`,
  })
  @ApiQuery({
    name: "category",
    required: false,
    enum: EnumEnzymeCategory,
    description: "Filter by enzyme category",
    example: "LIQUIFACTION",
  })
  @ApiQuery({
    name: "active",
    required: false,
    type: Boolean,
    description:
      "Filter by active status. True returns only active configurations, false returns only inactive ones.",
    example: true,
  })
  @ApiResponse({
    status: 200,
    description: "List of enzyme configurations retrieved successfully",
    type: [EnzymeConfigurationResponseDto],
    schema: {
      example: [
        {
          id: "clzhhlsx30f09mbc9r5mj02z9",
          itemId: "clzhhlsx30f09mbc9r5mj02z7",
          category: "LIQUIFACTION",
          dosePerMetricTon: 0.13,
          instructions:
            "Add with water/backset before grain addition. Mix thoroughly.",
          active: true,
          schemaVersion: "0001-a",
          createdAt: "2024-05-30T10:30:00.000Z",
          updatedAt: "2024-05-30T10:30:00.000Z",
          createdBy: "john.doe",
          updatedBy: null,
          item: {
            id: "clzhhlsx30f09mbc9r5mj02z7",
            itemName: "Alpha-Amylase Enzyme",
            itemNumber: "ENZ-001",
          },
        },
        {
          id: "clzhhlsx30f09mbc9r5mj02za",
          itemId: "clzhhlsx30f09mbc9r5mj02z8",
          category: "SACCHARIFICATION",
          dosePerMetricTon: 0.25,
          instructions:
            "Add after liquifaction step when temperature drops to 85°C.",
          active: true,
          schemaVersion: "0001-a",
          createdAt: "2024-05-30T10:35:00.000Z",
          updatedAt: "2024-05-30T10:35:00.000Z",
          createdBy: "jane.smith",
          updatedBy: null,
          item: {
            id: "clzhhlsx30f09mbc9r5mj02z8",
            itemName: "Glucoamylase Enzyme",
            itemNumber: "ENZ-002",
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing authentication token",
    schema: {
      example: {
        statusCode: 401,
        message: "Unauthorized",
        error: "Unauthorized",
      },
    },
  })
  @ApiResponse({
    status: 403,
    description:
      "Forbidden - Insufficient permissions to read enzyme configurations",
    schema: {
      example: {
        statusCode: 403,
        message: "Forbidden resource",
        error: "Forbidden",
      },
    },
  })
  @ApiResponse({
    status: 429,
    description: "Too Many Requests - Rate limit exceeded",
    schema: {
      example: {
        statusCode: 429,
        message: "ThrottlerException: Too Many Requests",
        error: "Too Many Requests",
      },
    },
  })
  async findAll(
    @Query("category") category?: EnumEnzymeCategory,
    @Query("active") active?: boolean
  ): Promise<EnzymeConfigurationResponseDto[]> {
    const where: any = {};
    if (category) {
      where.category = category;
    }
    if (active !== undefined) {
      where.active = active;
    }

    return this.enzymeConfigurationService.findAll({ where });
  }

  @Get("for-dosing")
  @UseRoles({
    resource: "EnzymeConfiguration",
    action: "read",
    possession: "any",
  })
  @ApiOperation({
    summary: "Get active enzyme configurations for dosing calculations",
    description: `Retrieve only active enzyme configurations formatted specifically for dosing calculations in production recipes.
    
**Use Case:** This endpoint is optimized for production systems that need to calculate enzyme dosing amounts.

**Features:**
- Returns only active configurations
- Optimized response format for dosing calculations
- Includes essential item information
- Fast response time for production use`,
  })
  @ApiResponse({
    status: 200,
    description:
      "Active enzyme configurations for dosing retrieved successfully",
    schema: {
      example: [
        {
          id: "clzhhlsx30f09mbc9r5mj02z9",
          itemId: "clzhhlsx30f09mbc9r5mj02z7",
          category: "LIQUIFACTION",
          dosePerMetricTon: 0.13,
          item: {
            itemName: "Alpha-Amylase Enzyme",
            itemNumber: "ENZ-001",
          },
        },
        {
          id: "clzhhlsx30f09mbc9r5mj02za",
          itemId: "clzhhlsx30f09mbc9r5mj02z8",
          category: "SACCHARIFICATION",
          dosePerMetricTon: 0.25,
          item: {
            itemName: "Glucoamylase Enzyme",
            itemNumber: "ENZ-002",
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing authentication token",
  })
  @ApiResponse({
    status: 403,
    description:
      "Forbidden - Insufficient permissions to read enzyme configurations",
  })
  @ApiResponse({
    status: 429,
    description: "Too Many Requests - Rate limit exceeded",
  })
  async getForDosing() {
    return this.enzymeConfigurationService.getActiveConfigurationsForDosing();
  }

  @Get("by-item/:itemId")
  @UseRoles({
    resource: "EnzymeConfiguration",
    action: "read",
    possession: "any",
  })
  @ApiOperation({
    summary: "Get enzyme configuration by item ID",
    description: `Retrieve the enzyme configuration associated with a specific item.
    
**Use Case:** Find the enzyme configuration for a specific item when you know the item ID.

**Business Logic:** Each item can have at most one enzyme configuration.`,
  })
  @ApiParam({
    name: "itemId",
    description: "Unique identifier of the item (CUID format)",
    example: "clzhhlsx30f09mbc9r5mj02z7",
    schema: {
      type: "string",
      pattern: "^c[a-z0-9]{24}$",
    },
  })
  @ApiResponse({
    status: 200,
    description: "Enzyme configuration found for the specified item",
    type: EnzymeConfigurationResponseDto,
    schema: {
      example: {
        id: "clzhhlsx30f09mbc9r5mj02z9",
        itemId: "clzhhlsx30f09mbc9r5mj02z7",
        category: "LIQUIFACTION",
        dosePerMetricTon: 0.13,
        instructions:
          "Add with water/backset before grain addition. Mix thoroughly.",
        active: true,
        schemaVersion: "0001-a",
        createdAt: "2024-05-30T10:30:00.000Z",
        updatedAt: "2024-05-30T10:30:00.000Z",
        createdBy: "john.doe",
        updatedBy: null,
        item: {
          id: "clzhhlsx30f09mbc9r5mj02z7",
          itemName: "Alpha-Amylase Enzyme",
          itemNumber: "ENZ-001",
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing authentication token",
  })
  @ApiResponse({
    status: 403,
    description:
      "Forbidden - Insufficient permissions to read enzyme configurations",
  })
  @ApiResponse({
    status: 404,
    description: "Not Found - No enzyme configuration exists for this item",
    schema: {
      example: {
        statusCode: 404,
        message:
          "Enzyme configuration not found for item clzhhlsx30f09mbc9r5mj02z7",
        error: "Not Found",
      },
    },
  })
  @ApiResponse({
    status: 429,
    description: "Too Many Requests - Rate limit exceeded",
  })
  async findByItemId(
    @Param("itemId") itemId: string
  ): Promise<EnzymeConfigurationResponseDto | null> {
    return this.enzymeConfigurationService.findByItemId(itemId);
  }

  @Get("paginated")
  @UseRoles({
    resource: "EnzymeConfiguration",
    action: "read",
    possession: "any",
  })
  @ApiOperation({
    summary: "Get enzyme configurations with pagination",
    description: `Retrieve enzyme configurations with pagination support for better performance with large datasets.
    
**Features:**
- Configurable page size (max 100 items per page)
- Sorting by any field with ascending/descending order
- Filtering by category and active status
- Metadata includes total count and pagination info

**Performance:** Recommended for applications displaying large lists of configurations.`,
  })
  @ApiQuery({
    name: "page",
    required: false,
    type: Number,
    description: "Page number (1-based indexing)",
    example: 1,
    schema: { minimum: 1 },
  })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: "Number of items per page (maximum 100)",
    example: 10,
    schema: { minimum: 1, maximum: 100 },
  })
  @ApiQuery({
    name: "sortBy",
    required: false,
    type: String,
    description: "Field to sort by",
    example: "createdAt",
    enum: [
      "id",
      "category",
      "dosePerMetricTon",
      "active",
      "createdAt",
      "updatedAt",
    ],
  })
  @ApiQuery({
    name: "sortOrder",
    required: false,
    enum: ["asc", "desc"],
    description: "Sort order (ascending or descending)",
    example: "desc",
  })
  @ApiQuery({
    name: "category",
    required: false,
    enum: EnumEnzymeCategory,
    description: "Filter by enzyme category",
  })
  @ApiQuery({
    name: "active",
    required: false,
    type: Boolean,
    description: "Filter by active status",
  })
  @ApiResponse({
    status: 200,
    description:
      "Paginated list of enzyme configurations retrieved successfully",
    type: PaginatedResponseDto,
    schema: {
      example: {
        data: [
          {
            id: "clzhhlsx30f09mbc9r5mj02z9",
            itemId: "clzhhlsx30f09mbc9r5mj02z7",
            category: "LIQUIFACTION",
            dosePerMetricTon: 0.13,
            instructions:
              "Add with water/backset before grain addition. Mix thoroughly.",
            active: true,
            schemaVersion: "0001-a",
            createdAt: "2024-05-30T10:30:00.000Z",
            updatedAt: "2024-05-30T10:30:00.000Z",
            createdBy: "john.doe",
            updatedBy: null,
            item: {
              id: "clzhhlsx30f09mbc9r5mj02z7",
              itemName: "Alpha-Amylase Enzyme",
              itemNumber: "ENZ-001",
            },
          },
        ],
        meta: {
          total: 25,
          page: 1,
          limit: 10,
          totalPages: 3,
          hasNextPage: true,
          hasPreviousPage: false,
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing authentication token",
  })
  @ApiResponse({
    status: 403,
    description:
      "Forbidden - Insufficient permissions to read enzyme configurations",
  })
  @ApiResponse({
    status: 429,
    description: "Too Many Requests - Rate limit exceeded",
  })
  async findAllPaginated(
    @Query() paginationDto: PaginationDto,
    @Query("category") category?: EnumEnzymeCategory,
    @Query("active") active?: boolean
  ): Promise<PaginatedResponseDto<EnzymeConfigurationResponseDto>> {
    return this.enzymeConfigurationService.findAllPaginated(
      paginationDto.page,
      paginationDto.limit,
      paginationDto.sortBy,
      paginationDto.sortOrder,
      category,
      active
    );
  }

  @Get("search")
  @UseRoles({
    resource: "EnzymeConfiguration",
    action: "read",
    possession: "any",
  })
  @ApiOperation({
    summary: "Advanced search for enzyme configurations",
    description: `Perform advanced search across enzyme configurations with multiple filter criteria and pagination.
    
**Advanced Features:**
- Full-text search across item names and instructions
- Range filtering for dose amounts
- Date range filtering for creation/update dates
- User-based filtering (created by, updated by)
- Category and status filtering
- Pagination with sorting

**Use Cases:**
- Find configurations by partial item name
- Search configurations within dose ranges
- Filter by creation date ranges
- Find configurations by specific users`,
  })
  @ApiQuery({
    name: "itemName",
    required: false,
    type: String,
    description: "Search by item name (partial match, case-insensitive)",
    example: "amylase",
  })
  @ApiQuery({
    name: "itemNumber",
    required: false,
    type: String,
    description: "Search by item number (partial match)",
    example: "ENZ-",
  })
  @ApiQuery({
    name: "category",
    required: false,
    enum: EnumEnzymeCategory,
    description: "Filter by enzyme category",
  })
  @ApiQuery({
    name: "active",
    required: false,
    type: Boolean,
    description: "Filter by active status",
  })
  @ApiQuery({
    name: "minDose",
    required: false,
    type: Number,
    description: "Minimum dose per metric ton",
    example: 0.1,
  })
  @ApiQuery({
    name: "maxDose",
    required: false,
    type: Number,
    description: "Maximum dose per metric ton",
    example: 0.5,
  })
  @ApiQuery({
    name: "instructions",
    required: false,
    type: String,
    description: "Search in instructions text (partial match)",
    example: "temperature",
  })
  @ApiQuery({
    name: "createdBy",
    required: false,
    type: String,
    description: "Filter by creator username",
    example: "john.doe",
  })
  @ApiQuery({
    name: "page",
    required: false,
    type: Number,
    description: "Page number (1-based)",
    example: 1,
  })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: "Items per page (max 100)",
    example: 10,
  })
  @ApiQuery({
    name: "sortBy",
    required: false,
    type: String,
    description: "Field to sort by",
    example: "createdAt",
  })
  @ApiQuery({
    name: "sortOrder",
    required: false,
    enum: ["asc", "desc"],
    description: "Sort order",
    example: "desc",
  })
  @ApiResponse({
    status: 200,
    description: "Search results with pagination metadata",
    type: PaginatedResponseDto,
    schema: {
      example: {
        data: [
          {
            id: "clzhhlsx30f09mbc9r5mj02z9",
            itemId: "clzhhlsx30f09mbc9r5mj02z7",
            category: "LIQUIFACTION",
            dosePerMetricTon: 0.13,
            instructions:
              "Add with water/backset before grain addition. Mix thoroughly.",
            active: true,
            schemaVersion: "0001-a",
            createdAt: "2024-05-30T10:30:00.000Z",
            updatedAt: "2024-05-30T10:30:00.000Z",
            createdBy: "john.doe",
            updatedBy: null,
            item: {
              id: "clzhhlsx30f09mbc9r5mj02z7",
              itemName: "Alpha-Amylase Enzyme",
              itemNumber: "ENZ-001",
            },
          },
        ],
        meta: {
          total: 5,
          page: 1,
          limit: 10,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing authentication token",
  })
  @ApiResponse({
    status: 403,
    description:
      "Forbidden - Insufficient permissions to search enzyme configurations",
  })
  @ApiResponse({
    status: 429,
    description: "Too Many Requests - Rate limit exceeded",
  })
  async search(
    @Query() searchDto: SearchEnzymeConfigurationDto,
    @Query() paginationDto: PaginationDto
  ): Promise<PaginatedResponseDto<EnzymeConfigurationResponseDto>> {
    return this.enzymeConfigurationService.search(
      searchDto,
      paginationDto.page,
      paginationDto.limit,
      paginationDto.sortBy,
      paginationDto.sortOrder
    );
  }

  @Get("category/:category/advanced")
  @UseRoles({
    resource: "EnzymeConfiguration",
    action: "read",
    possession: "any",
  })
  @ApiOperation({
    summary: "Get enzyme configurations by category with advanced filtering",
  })
  @ApiParam({
    name: "category",
    enum: EnumEnzymeCategory,
    description: "Enzyme category",
  })
  @ApiQuery({
    name: "active",
    required: false,
    type: Boolean,
    description: "Filter by active status",
  })
  @ApiQuery({
    name: "itemName",
    required: false,
    type: String,
    description: "Filter by item name (partial match)",
  })
  @ApiQuery({
    name: "page",
    required: false,
    type: Number,
    description: "Page number (1-based)",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: "Items per page (max 100)",
  })
  @ApiResponse({
    status: 200,
    description: "Enzyme configurations found for the category",
    type: PaginatedResponseDto,
  })
  @ApiResponse({ status: 400, description: "Invalid category" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  @ApiResponse({ status: 403, description: "Forbidden" })
  @ApiResponse({ status: 429, description: "Too Many Requests" })
  async findByCategoryAdvanced(
    @Param("category") category: EnumEnzymeCategory,
    @Query("active") active?: boolean,
    @Query("itemName") itemName?: string,
    @Query() paginationDto?: PaginationDto
  ): Promise<PaginatedResponseDto<EnzymeConfigurationResponseDto>> {
    const searchDto: SearchEnzymeConfigurationDto = {
      category,
      active,
      itemName,
    };

    return this.enzymeConfigurationService.search(
      searchDto,
      paginationDto?.page || 1,
      paginationDto?.limit || 10,
      paginationDto?.sortBy || "createdAt",
      paginationDto?.sortOrder || "desc"
    );
  }

  @Get(":id")
  @UseRoles({
    resource: "EnzymeConfiguration",
    action: "read",
    possession: "any",
  })
  @ApiOperation({ summary: "Get enzyme configuration by ID" })
  @ApiParam({ name: "id", description: "Enzyme configuration ID (CUID)" })
  @ApiResponse({
    status: 200,
    description: "Enzyme configuration found",
    type: EnzymeConfigurationResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  @ApiResponse({ status: 403, description: "Forbidden" })
  @ApiResponse({ status: 404, description: "Enzyme configuration not found" })
  @ApiResponse({ status: 429, description: "Too Many Requests" })
  async findOne(
    @Param("id") id: string
  ): Promise<EnzymeConfigurationResponseDto> {
    return this.enzymeConfigurationService.findOne(id);
  }

  @Patch(":id")
  @UseRoles({
    resource: "EnzymeConfiguration",
    action: "update",
    possession: "any",
  })
  @Throttle({
    default: {
      limit: parseInt(process.env.ENZYME_UPDATE_LIMIT || "25"),
      ttl: 60000,
    },
  }) // Increased from 10 to 25 updates per minute
  @ApiOperation({ summary: "Update enzyme configuration" })
  @ApiParam({ name: "id", description: "Enzyme configuration ID (CUID)" })
  @ApiResponse({
    status: 200,
    description: "The enzyme configuration has been successfully updated.",
    type: EnzymeConfigurationResponseDto,
  })
  @ApiResponse({ status: 400, description: "Bad Request" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  @ApiResponse({ status: 403, description: "Forbidden" })
  @ApiResponse({ status: 404, description: "Enzyme configuration not found" })
  @ApiResponse({
    status: 409,
    description: "Conflict with existing configuration",
  })
  @ApiResponse({ status: 429, description: "Too Many Requests" })
  async update(
    @Param("id") id: string,
    @Body() updateDto: UpdateEnzymeConfigurationDto
  ): Promise<EnzymeConfigurationResponseDto> {
    return this.enzymeConfigurationService.update(id, updateDto);
  }

  @Delete(":id")
  @UseRoles({
    resource: "EnzymeConfiguration",
    action: "delete",
    possession: "any",
  })
  @Throttle({
    default: {
      limit: parseInt(process.env.ENZYME_DELETE_LIMIT || "15"),
      ttl: 60000,
    },
  }) // Increased from 5 to 15 deletes per minute
  @ApiOperation({
    summary: "Soft delete enzyme configuration (set active to false)",
  })
  @ApiParam({ name: "id", description: "Enzyme configuration ID (CUID)" })
  @ApiQuery({
    name: "updatedBy",
    description: "User ID performing the deletion",
    required: true,
  })
  @ApiResponse({
    status: 204,
    description: "Enzyme configuration has been soft deleted",
  })
  @ApiResponse({
    status: 400,
    description: "Bad Request - updatedBy is required",
  })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  @ApiResponse({ status: 403, description: "Forbidden" })
  @ApiResponse({ status: 404, description: "Enzyme configuration not found" })
  @ApiResponse({ status: 429, description: "Too Many Requests" })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param("id") id: string,
    @Query("updatedBy") updatedBy: string
  ): Promise<void> {
    if (!updatedBy || updatedBy.trim() === "") {
      throw new BadRequestException(
        "updatedBy query parameter is required and cannot be empty"
      );
    }
    return this.enzymeConfigurationService.remove(id, updatedBy);
  }

  @Delete(":id/hard")
  @UseRoles({
    resource: "EnzymeConfiguration",
    action: "delete",
    possession: "any",
  })
  @Throttle({
    default: {
      limit: parseInt(process.env.ENZYME_HARD_DELETE_LIMIT || "5"),
      ttl: 60000,
    },
  }) // Increased from 2 to 5 hard deletes per minute
  @ApiOperation({ summary: "Permanently delete enzyme configuration" })
  @ApiParam({ name: "id", description: "Enzyme configuration ID (CUID)" })
  @ApiResponse({
    status: 204,
    description: "Enzyme configuration has been permanently deleted",
  })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  @ApiResponse({ status: 403, description: "Forbidden" })
  @ApiResponse({ status: 404, description: "Enzyme configuration not found" })
  @ApiResponse({ status: 429, description: "Too Many Requests" })
  @HttpCode(HttpStatus.NO_CONTENT)
  async hardDelete(@Param("id") id: string): Promise<void> {
    return this.enzymeConfigurationService.hardDelete(id);
  }

  @Post("bulk")
  @UseRoles({
    resource: "EnzymeConfiguration",
    action: "create",
    possession: "any",
  })
  @Throttle({
    default: {
      limit: parseInt(process.env.ENZYME_BULK_CREATE_LIMIT || "5"),
      ttl: 300000,
    },
  }) // Increased from 2 to 5 bulk creates per 5 minutes
  @ApiOperation({ summary: "Bulk create enzyme configurations" })
  @ApiResponse({
    status: 201,
    description: "Bulk create operation completed",
    type: BulkCreateResponseDto,
  })
  @ApiResponse({ status: 400, description: "Invalid input data" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  @ApiResponse({ status: 403, description: "Forbidden" })
  @ApiResponse({ status: 429, description: "Too Many Requests" })
  @HttpCode(HttpStatus.CREATED)
  async bulkCreate(
    @Body() bulkCreateDto: BulkCreateEnzymeConfigurationDto
  ): Promise<BulkCreateResponseDto> {
    return this.enzymeConfigurationService.bulkCreate(bulkCreateDto);
  }

  @Patch("bulk")
  @UseRoles({
    resource: "EnzymeConfiguration",
    action: "update",
    possession: "any",
  })
  @Throttle({
    default: {
      limit: parseInt(process.env.ENZYME_BULK_UPDATE_LIMIT || "8"),
      ttl: 300000,
    },
  }) // Increased from 3 to 8 bulk updates per 5 minutes
  @ApiOperation({ summary: "Bulk update enzyme configurations" })
  @ApiResponse({
    status: 200,
    description: "Bulk update operation completed",
    type: BulkUpdateResponseDto,
  })
  @ApiResponse({ status: 400, description: "Invalid input data" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  @ApiResponse({ status: 403, description: "Forbidden" })
  @ApiResponse({ status: 429, description: "Too Many Requests" })
  async bulkUpdate(
    @Body() bulkUpdateDto: BulkUpdateEnzymeConfigurationDto
  ): Promise<BulkUpdateResponseDto> {
    return this.enzymeConfigurationService.bulkUpdate(bulkUpdateDto);
  }

  @Delete("bulk")
  @UseRoles({
    resource: "EnzymeConfiguration",
    action: "delete",
    possession: "any",
  })
  @Throttle({
    default: {
      limit: parseInt(process.env.ENZYME_BULK_DELETE_LIMIT || "5"),
      ttl: 300000,
    },
  }) // Increased from 2 to 5 bulk deletes per 5 minutes
  @ApiOperation({ summary: "Bulk delete enzyme configurations" })
  @ApiResponse({
    status: 200,
    description: "Bulk delete operation completed",
    type: BulkDeleteResponseDto,
  })
  @ApiResponse({ status: 400, description: "Invalid input data" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  @ApiResponse({ status: 403, description: "Forbidden" })
  @ApiResponse({ status: 429, description: "Too Many Requests" })
  async bulkDelete(
    @Body() bulkDeleteDto: BulkDeleteEnzymeConfigurationDto
  ): Promise<BulkDeleteResponseDto> {
    return this.enzymeConfigurationService.bulkDelete(bulkDeleteDto);
  }

  @Post("calculate")
  @UseRoles({
    resource: "EnzymeConfiguration",
    action: "read",
    possession: "any",
  })
  @Throttle({
    default: {
      limit: parseInt(process.env.ENZYME_CALCULATION_LIMIT || "30"),
      ttl: 60000,
    },
  }) // Increased from 10 to 30 calculations per minute
  @ApiOperation({
    summary: "Calculate enzyme dosing amounts",
    description: `Calculate enzyme dosing amounts based on selected enzymes, grain load, and optional recipe/mash bill.
    
**Business Rules:**
- Select one enzyme per category (LIQUIFACTION, SACCHARIFICATION, VISCOSITY)
- Grain load must be between 1,000 and 50,000 lbs
- Either recipeId or mashBill can be provided for context
- Calculations are based on dose per metric ton from enzyme configurations

**Rate Limiting:** 10 calculations per minute per user`,
  })
  @ApiBody({
    type: EnzymeCalculatorInputDto,
    description: "Enzyme calculation input data",
    examples: {
      basic: {
        summary: "Basic Calculation",
        description: "Calculate dosing for selected enzymes with grain load",
        value: {
          enzymeSelections: [
            {
              category: "LIQUIFACTION",
              enzymeConfigurationId: "clzhhlsx30f09mbc9r5mj02z7",
            },
            {
              category: "SACCHARIFICATION",
              enzymeConfigurationId: "clzhhlsx30f09mbc9r5mj02z8",
            },
          ],
          totalGrainLoadLbs: 5000,
          mashBill: "70-21-00-09",
        },
      },
      withRecipe: {
        summary: "With Recipe Reference",
        description: "Calculate dosing using a recipe reference",
        value: {
          enzymeSelections: [
            {
              category: "LIQUIFACTION",
              enzymeConfigurationId: "clzhhlsx30f09mbc9r5mj02z7",
            },
          ],
          totalGrainLoadLbs: 7500,
          recipeId: "clzhhlsx30f09mbc9r5mj02z9",
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: "Enzyme dosing calculated successfully",
    type: EnzymeCalculatorResponseDto,
    schema: {
      example: {
        calculationId: "calc_clzhhlsx30f09mbc9r5mj02z7",
        totalGrainLoadLbs: 5000,
        mashBill: "70-21-00-09",
        enzymeCalculations: [
          {
            enzymeConfigurationId: "clzhhlsx30f09mbc9r5mj02z7",
            category: "LIQUIFACTION",
            enzymeName: "Alpha-Amylase Enzyme",
            doseLbs: 0.65,
            instructions:
              "Add with water/backset before grain addition. Mix thoroughly.",
            dosePerMetricTon: 0.13,
          },
          {
            enzymeConfigurationId: "clzhhlsx30f09mbc9r5mj02z8",
            category: "SACCHARIFICATION",
            enzymeName: "Glucoamylase Enzyme",
            doseLbs: 1.25,
            instructions:
              "Add after liquifaction step when temperature drops to 85°C.",
            dosePerMetricTon: 0.25,
          },
        ],
        calculatedAt: "2024-05-30T10:30:00.000Z",
        calculatedBy: "john.doe",
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "Bad Request - Invalid input data",
    schema: {
      example: {
        statusCode: 400,
        message: [
          "totalGrainLoadLbs must be at least 1,000 lbs",
          "enzymeSelections must not be empty",
        ],
        error: "Bad Request",
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing authentication token",
  })
  @ApiResponse({
    status: 403,
    description:
      "Forbidden - Insufficient permissions to calculate enzyme dosing",
  })
  @ApiResponse({
    status: 404,
    description: "Not Found - One or more enzyme configurations not found",
  })
  async calculateEnzymeDosing(
    @Body() calculatorInput: EnzymeCalculatorInputDto
  ): Promise<EnzymeCalculatorResponseDto> {
    return this.enzymeConfigurationService.calculateEnzymeDosing(
      calculatorInput
    );
  }
}
