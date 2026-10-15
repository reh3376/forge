import {
  Controller,
  Get,
  Param,
  Query,
  HttpStatus,
  ParseUUIDPipe,
  ValidationPipe,
  UsePipes,
  UseGuards,
  NotFoundException,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
  ApiSecurity,
  ApiProduces,
  ApiExtraModels,
  getSchemaPath,
} from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { ACGuard, UseRoles } from "nest-access-control";
import { DefaultAuthGuard } from "../auth/defaultAuth.guard";
import { AuditService } from "./audit.service";
import {
  AuditLogQueryDto,
  AuditLogResponseDto,
  PaginatedAuditLogResponseDto,
  FormattedAuditLogDto,
} from "./dto";

@ApiTags("Audit Trail")
@Controller("audit")
@UseGuards(DefaultAuthGuard, ACGuard)
@ApiBearerAuth("JWT")
@ApiSecurity("bearer")
@ApiProduces("application/json")
@ApiExtraModels(
  AuditLogResponseDto,
  PaginatedAuditLogResponseDto,
  FormattedAuditLogDto,
  AuditLogQueryDto
)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  })
)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @UseRoles({
    resource: "AuditLog",
    action: "read",
    possession: "any",
  })
  @Throttle({ default: { limit: 30, ttl: 60000 } }) // 30 requests per minute
  @ApiOperation({
    summary: "Get audit logs with filtering and pagination",
    description: `Retrieve audit logs with comprehensive filtering options and pagination.
    
**Features:**
- Filter by entity type, entity ID, action, user, and date range
- Pagination support with configurable page size
- Sorting by any field in ascending or descending order
- Includes user information for each audit entry

**Use Cases:**
- Track changes to specific configurations
- Monitor user activity
- Compliance and security auditing
- Troubleshooting configuration issues

**Rate Limiting:** 30 requests per minute per user`,
  })
  @ApiQuery({
    name: "entityType",
    required: false,
    description:
      'Filter by entity type (e.g., "EnzymeConfiguration", "SystemConfiguration")',
    example: "EnzymeConfiguration",
  })
  @ApiQuery({
    name: "entityId",
    required: false,
    description: "Filter by specific entity ID",
    example: "clzhhlsx30f09mbc9r5mj02z7",
  })
  @ApiQuery({
    name: "action",
    required: false,
    enum: ["CREATE", "UPDATE", "DELETE"],
    description: "Filter by audit action type",
    example: "UPDATE",
  })
  @ApiQuery({
    name: "userId",
    required: false,
    description: "Filter by user ID who performed the action",
    example: "user123",
  })
  @ApiQuery({
    name: "startDate",
    required: false,
    description: "Filter by start date (ISO 8601 format)",
    example: "2024-01-01T00:00:00.000Z",
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    description: "Filter by end date (ISO 8601 format)",
    example: "2024-12-31T23:59:59.999Z",
  })
  @ApiQuery({
    name: "page",
    required: false,
    description: "Page number (1-based)",
    example: 1,
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Number of items per page (1-100)",
    example: 20,
  })
  @ApiQuery({
    name: "sortBy",
    required: false,
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
    description: "Audit logs retrieved successfully",
    type: PaginatedAuditLogResponseDto,
    schema: {
      example: {
        data: [
          {
            id: "clzhhlsx30f09mbc9r5mj02z7",
            globalId: "clzhhlsx30f09mbc9r5mj02z8",
            entityType: "EnzymeConfiguration",
            entityId: "clzhhlsx30f09mbc9r5mj02z9",
            action: "UPDATE",
            oldValues: {
              dosePerMetricTon: 0.5,
              instructions: "Old instructions",
            },
            newValues: {
              dosePerMetricTon: 0.75,
              instructions: "Updated instructions",
            },
            user: {
              id: "user123",
              username: "john.doe",
              firstName: "John",
              lastName: "Doe",
            },
            ipAddress: "192.168.1.100",
            userAgent:
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            createdAt: "2024-01-01T12:00:00.000Z",
            updatedAt: "2024-01-01T12:00:00.000Z",
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 150,
          totalPages: 8,
          hasNext: true,
          hasPrev: false,
        },
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
    description: "Forbidden - Insufficient permissions to read audit logs",
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
  async getAuditLogs(
    @Query() query: AuditLogQueryDto
  ): Promise<PaginatedAuditLogResponseDto> {
    const {
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
      ...filters
    } = query;

    // Convert string dates to Date objects
    const options = {
      ...filters,
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined,
      limit,
      offset: (page - 1) * limit,
      orderBy: { [sortBy]: sortOrder },
    };

    // Convert dates for count method as well
    const countFilters = {
      ...filters,
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined,
    };

    const [auditLogs, total] = await Promise.all([
      this.auditService.getAuditLogs(options),
      this.auditService.countAuditLogs(countFilters),
    ]);

    const responseData = auditLogs.map(
      (log) =>
        new AuditLogResponseDto({
          id: log.id,
          globalId: log.globalId,
          entityType: log.entityType,
          entityId: log.entityId,
          action: log.action,
          oldValues: (log.oldValues as Record<string, any>) || undefined,
          newValues: (log.newValues as Record<string, any>) || undefined,
          user: log.user
            ? {
                id: log.user.id,
                username: log.user.username,
                firstName: log.user.firstName || undefined,
                lastName: log.user.lastName || undefined,
              }
            : { id: "system", username: "system", firstName: undefined, lastName: undefined },
          ipAddress: log.ipAddress || undefined,
          userAgent: log.userAgent || undefined,
          createdAt: log.createdAt,
          updatedAt: log.updatedAt,
        })
    );

    return new PaginatedAuditLogResponseDto(responseData, page, limit, total);
  }

  @Get("entity/:entityType/:entityId")
  @UseRoles({
    resource: "AuditLog",
    action: "read",
    possession: "any",
  })
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 requests per minute
  @ApiOperation({
    summary: "Get audit history for a specific entity",
    description: `Retrieve the complete audit history for a specific entity.
    
**Features:**
- Get all changes made to a specific configuration
- Chronological order of changes
- Includes user information for each change
- Pagination support for entities with many changes

**Use Cases:**
- Track the evolution of a specific configuration
- Identify who made specific changes
- Troubleshoot configuration issues
- Compliance reporting for specific entities

**Rate Limiting:** 20 requests per minute per user`,
  })
  @ApiParam({
    name: "entityType",
    description:
      'Type of entity (e.g., "EnzymeConfiguration", "SystemConfiguration")',
    example: "EnzymeConfiguration",
  })
  @ApiParam({
    name: "entityId",
    description: "Unique identifier of the entity",
    example: "clzhhlsx30f09mbc9r5mj02z7",
  })
  @ApiQuery({
    name: "page",
    required: false,
    description: "Page number (1-based)",
    example: 1,
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Number of items per page (1-100)",
    example: 20,
  })
  @ApiResponse({
    status: 200,
    description: "Entity audit history retrieved successfully",
    type: PaginatedAuditLogResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing authentication token",
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden - Insufficient permissions to read audit logs",
  })
  @ApiResponse({
    status: 429,
    description: "Too Many Requests - Rate limit exceeded",
  })
  async getEntityAuditHistory(
    @Param("entityType") entityType: string,
    @Param("entityId") entityId: string,
    @Query("page") page: number = 1,
    @Query("limit") limit: number = 20
  ): Promise<PaginatedAuditLogResponseDto> {
    const offset = (page - 1) * limit;

    const [auditLogs, total] = await Promise.all([
      this.auditService.getEntityAuditHistory(entityType, entityId, {
        limit,
        offset,
        orderBy: { createdAt: "desc" },
      }),
      this.auditService.countAuditLogs({ entityType, entityId }),
    ]);

    const responseData = auditLogs.map(
      (log) =>
        new AuditLogResponseDto({
          id: log.id,
          globalId: log.globalId,
          entityType: log.entityType,
          entityId: log.entityId,
          action: log.action,
          oldValues: (log.oldValues as Record<string, any>) || undefined,
          newValues: (log.newValues as Record<string, any>) || undefined,
          user: log.user
            ? {
                id: log.user.id,
                username: log.user.username,
                firstName: log.user.firstName || undefined,
                lastName: log.user.lastName || undefined,
              }
            : { id: "system", username: "system", firstName: undefined, lastName: undefined },
          ipAddress: log.ipAddress || undefined,
          userAgent: log.userAgent || undefined,
          createdAt: log.createdAt,
          updatedAt: log.updatedAt,
        })
    );

    return new PaginatedAuditLogResponseDto(responseData, page, limit, total);
  }

  @Get("user/:userId")
  @UseRoles({
    resource: "AuditLog",
    action: "read",
    possession: "any",
  })
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 requests per minute
  @ApiOperation({
    summary: "Get audit history for a specific user",
    description: `Retrieve all audit logs for actions performed by a specific user.
    
**Features:**
- Track all changes made by a specific user
- Filter by entity type and action
- Date range filtering
- Pagination support

**Use Cases:**
- User activity monitoring
- Security auditing
- Performance review and training
- Compliance reporting

**Rate Limiting:** 20 requests per minute per user`,
  })
  @ApiParam({
    name: "userId",
    description: "Unique identifier of the user",
    example: "user123",
  })
  @ApiQuery({
    name: "entityType",
    required: false,
    description: "Filter by entity type",
    example: "EnzymeConfiguration",
  })
  @ApiQuery({
    name: "action",
    required: false,
    enum: ["CREATE", "UPDATE", "DELETE"],
    description: "Filter by action type",
    example: "UPDATE",
  })
  @ApiQuery({
    name: "startDate",
    required: false,
    description: "Filter by start date (ISO 8601 format)",
    example: "2024-01-01T00:00:00.000Z",
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    description: "Filter by end date (ISO 8601 format)",
    example: "2024-12-31T23:59:59.999Z",
  })
  @ApiQuery({
    name: "page",
    required: false,
    description: "Page number (1-based)",
    example: 1,
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Number of items per page (1-100)",
    example: 20,
  })
  @ApiResponse({
    status: 200,
    description: "User audit history retrieved successfully",
    type: PaginatedAuditLogResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing authentication token",
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden - Insufficient permissions to read audit logs",
  })
  @ApiResponse({
    status: 429,
    description: "Too Many Requests - Rate limit exceeded",
  })
  async getUserAuditHistory(
    @Param("userId") userId: string,
    @Query() query: Partial<AuditLogQueryDto>
  ): Promise<PaginatedAuditLogResponseDto> {
    const {
      page = 1,
      limit = 20,
      entityType,
      action,
      startDate,
      endDate,
    } = query;
    const offset = (page - 1) * limit;

    const options = {
      entityType,
      action,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit,
      offset,
      orderBy: { createdAt: "desc" as const },
    };

    // Convert dates for count method as well
    const countFilters = {
      userId,
      entityType,
      action,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };

    const [auditLogs, total] = await Promise.all([
      this.auditService.getUserAuditHistory(userId, options),
      this.auditService.countAuditLogs(countFilters),
    ]);

    const responseData = auditLogs.map(
      (log) =>
        new AuditLogResponseDto({
          id: log.id,
          globalId: log.globalId,
          entityType: log.entityType,
          entityId: log.entityId,
          action: log.action,
          oldValues: (log.oldValues as Record<string, any>) || undefined,
          newValues: (log.newValues as Record<string, any>) || undefined,
          user: log.user
            ? {
                id: log.user.id,
                username: log.user.username,
                firstName: log.user.firstName || undefined,
                lastName: log.user.lastName || undefined,
              }
            : { id: "system", username: "system", firstName: undefined, lastName: undefined },
          ipAddress: log.ipAddress || undefined,
          userAgent: log.userAgent || undefined,
          createdAt: log.createdAt,
          updatedAt: log.updatedAt,
        })
    );

    return new PaginatedAuditLogResponseDto(responseData, page, limit, total);
  }

  @Get(":id")
  @UseRoles({
    resource: "AuditLog",
    action: "read",
    possession: "any",
  })
  @Throttle({ default: { limit: 50, ttl: 60000 } }) // 50 requests per minute
  @ApiOperation({
    summary: "Get a specific audit log entry by ID",
    description: `Retrieve detailed information about a specific audit log entry.
    
**Features:**
- Complete audit log details
- User information included
- Before and after values for changes
- Request metadata (IP address, user agent)

**Use Cases:**
- Investigate specific changes
- Get detailed change information
- Compliance documentation
- Troubleshooting specific issues

**Rate Limiting:** 50 requests per minute per user`,
  })
  @ApiParam({
    name: "id",
    description: "Unique identifier of the audit log entry",
    example: "clzhhlsx30f09mbc9r5mj02z7",
  })
  @ApiResponse({
    status: 200,
    description: "Audit log entry retrieved successfully",
    type: AuditLogResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing authentication token",
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden - Insufficient permissions to read audit logs",
  })
  @ApiResponse({
    status: 404,
    description: "Not Found - Audit log entry does not exist",
    schema: {
      example: {
        statusCode: 404,
        message: "Audit log with ID clzhhlsx30f09mbc9r5mj02z7 not found",
        error: "Not Found",
      },
    },
  })
  @ApiResponse({
    status: 429,
    description: "Too Many Requests - Rate limit exceeded",
  })
  async getAuditLogById(@Param("id") id: string): Promise<AuditLogResponseDto> {
    const auditLog = await this.auditService.getAuditLogById(id);

    if (!auditLog) {
      throw new NotFoundException(`Audit log with ID ${id} not found`);
    }

    return new AuditLogResponseDto({
      id: auditLog.id,
      globalId: auditLog.globalId,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      action: auditLog.action,
      oldValues: (auditLog.oldValues as Record<string, any>) || undefined,
      newValues: (auditLog.newValues as Record<string, any>) || undefined,
      user: auditLog.user
        ? {
            id: auditLog.user.id,
            username: auditLog.user.username,
            firstName: auditLog.user.firstName || undefined,
            lastName: auditLog.user.lastName || undefined,
          }
        : { id: "system", username: "system", firstName: undefined, lastName: undefined },
      ipAddress: auditLog.ipAddress || undefined,
      userAgent: auditLog.userAgent || undefined,
      createdAt: auditLog.createdAt,
      updatedAt: auditLog.updatedAt,
    });
  }

  @Get("formatted/summary")
  @UseRoles({
    resource: "AuditLog",
    action: "read",
    possession: "any",
  })
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 requests per minute
  @ApiOperation({
    summary: "Get formatted audit log summary",
    description: `Retrieve audit logs in a formatted, human-readable format suitable for reports and displays.
    
**Features:**
- Human-readable change summaries
- Formatted timestamps
- User-friendly entity descriptions
- Condensed change information

**Use Cases:**
- Dashboard displays
- Management reports
- User-facing audit trails
- Export for external systems

**Rate Limiting:** 20 requests per minute per user`,
  })
  @ApiQuery({
    name: "entityType",
    required: false,
    description: "Filter by entity type",
    example: "EnzymeConfiguration",
  })
  @ApiQuery({
    name: "entityId",
    required: false,
    description: "Filter by specific entity ID",
    example: "clzhhlsx30f09mbc9r5mj02z7",
  })
  @ApiQuery({
    name: "page",
    required: false,
    description: "Page number (1-based)",
    example: 1,
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Number of items per page (1-50)",
    example: 10,
  })
  @ApiResponse({
    status: 200,
    description: "Formatted audit log summary retrieved successfully",
    schema: {
      type: "object",
      properties: {
        data: {
          type: "array",
          items: { $ref: getSchemaPath(FormattedAuditLogDto) },
        },
        pagination: {
          type: "object",
          properties: {
            page: { type: "number" },
            limit: { type: "number" },
            total: { type: "number" },
            totalPages: { type: "number" },
            hasNext: { type: "boolean" },
            hasPrev: { type: "boolean" },
          },
        },
      },
      example: {
        data: [
          {
            id: "clzhhlsx30f09mbc9r5mj02z7",
            timestamp: "2024-01-01T12:00:00.000Z",
            action: "UPDATE",
            entity: "EnzymeConfiguration:clzhhlsx30f09mbc9r5mj02z9",
            user: "John Doe (john.doe)",
            changes:
              'dosePerMetricTon: 0.5 → 0.75, instructions: "Old instructions" → "Updated instructions"',
            ipAddress: "192.168.1.100",
          },
        ],
        pagination: {
          page: 1,
          limit: 10,
          total: 25,
          totalPages: 3,
          hasNext: true,
          hasPrev: false,
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
    description: "Forbidden - Insufficient permissions to read audit logs",
  })
  @ApiResponse({
    status: 429,
    description: "Too Many Requests - Rate limit exceeded",
  })
  async getFormattedAuditSummary(
    @Query() query: Partial<AuditLogQueryDto>
  ): Promise<{ data: FormattedAuditLogDto[]; pagination: any }> {
    const { page = 1, limit = 10, entityType, entityId } = query;
    const offset = (page - 1) * limit;

    const options = {
      entityType,
      entityId,
      limit,
      offset,
      orderBy: { createdAt: "desc" as const },
    };

    const [auditLogs, total] = await Promise.all([
      this.auditService.getAuditLogs(options),
      this.auditService.countAuditLogs({ entityType, entityId }),
    ]);

    const formattedData = auditLogs.map((log) =>
      this.auditService.formatAuditLog(log)
    );

    return {
      data: formattedData,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }
}
