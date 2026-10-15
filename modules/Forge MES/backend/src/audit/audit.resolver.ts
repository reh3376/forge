import { Resolver, Query, Args } from "@nestjs/graphql";
import { NotFoundException, Logger, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { UseRoles } from "nest-access-control";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import { GqlACGuard } from "../auth/gqlAC.guard";
import { CustomThrottlerGuard } from "../guards/custom-throttler.guard";
import { AuditService } from "./audit.service";
import {
  AuditLogGraphQL,
  PaginatedAuditLogResponseGraphQL,
  FormattedAuditLogGraphQL,
  GetAuditLogsArgs,
  GetEntityAuditHistoryArgs,
  GetUserAuditHistoryArgs,
  GetAuditLogByIdArgs,
} from "./dto/audit-log-graphql.dto";

@Resolver(() => AuditLogGraphQL)
@UseGuards(GqlDefaultAuthGuard, GqlACGuard)
@UseRoles({
  resource: "AuditLog",
  action: "read",
  possession: "any",
})
export class AuditResolver {
  private readonly logger = new Logger(AuditResolver.name);

  constructor(private readonly auditService: AuditService) {}

  /**
   * Get audit logs with filtering and pagination
   */
  @Query(() => PaginatedAuditLogResponseGraphQL, {
    name: "auditLogs",
    description: "Get audit logs with filtering and pagination options",
  })
  @Throttle({ default: { limit: 100, ttl: 60000 } }) // 100 requests per minute
  @UseGuards(CustomThrottlerGuard)
  async getAuditLogs(
    @Args() args: GetAuditLogsArgs
  ): Promise<PaginatedAuditLogResponseGraphQL> {
    this.logger.debug(`Getting audit logs with args: ${JSON.stringify(args)}`);

    const {
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
      filters,
    } = args;
    const offset = (page - 1) * limit;

    // Build filter options
    const filterOptions = {
      limit,
      offset,
      orderBy: { [sortBy]: sortOrder },
      ...(filters?.entityType && { entityType: filters.entityType }),
      ...(filters?.entityId && { entityId: filters.entityId }),
      ...(filters?.action && { action: filters.action }),
      ...(filters?.userId && { userId: filters.userId }),
      ...(filters?.startDate && { startDate: new Date(filters.startDate) }),
      ...(filters?.endDate && { endDate: new Date(filters.endDate) }),
    };

    try {
      const [auditLogs, total] = await Promise.all([
        this.auditService.getAuditLogs(filterOptions),
        this.auditService.countAuditLogs({
          ...(filters?.entityType && { entityType: filters.entityType }),
          ...(filters?.entityId && { entityId: filters.entityId }),
          ...(filters?.action && { action: filters.action }),
          ...(filters?.userId && { userId: filters.userId }),
          ...(filters?.startDate && { startDate: new Date(filters.startDate) }),
          ...(filters?.endDate && { endDate: new Date(filters.endDate) }),
        }),
      ]);

      const totalPages = Math.ceil(total / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      const responseData = auditLogs.map((log) => ({
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
      }));

      return {
        data: responseData,
        total,
        page,
        limit,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      };
    } catch (error) {
      this.logger.error("Failed to get audit logs:", error);
      throw error;
    }
  }

  /**
   * Get audit history for a specific entity
   */
  @Query(() => PaginatedAuditLogResponseGraphQL, {
    name: "entityAuditHistory",
    description: "Get audit history for a specific entity",
  })
  @Throttle({ default: { limit: 100, ttl: 60000 } }) // 100 requests per minute
  @UseGuards(CustomThrottlerGuard)
  async getEntityAuditHistory(
    @Args() args: GetEntityAuditHistoryArgs
  ): Promise<PaginatedAuditLogResponseGraphQL> {
    this.logger.debug(
      `Getting entity audit history for ${args.entityType}:${args.entityId}`
    );

    const { entityType, entityId, page = 1, limit = 20 } = args;
    const offset = (page - 1) * limit;

    try {
      const [auditLogs, total] = await Promise.all([
        this.auditService.getEntityAuditHistory(entityType, entityId, {
          limit,
          offset,
          orderBy: { createdAt: "desc" },
        }),
        this.auditService.countAuditLogs({ entityType, entityId }),
      ]);

      const totalPages = Math.ceil(total / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      const responseData = auditLogs.map((log) => ({
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
      }));

      return {
        data: responseData,
        total,
        page,
        limit,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get entity audit history for ${entityType}:${entityId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get audit history for a specific user
   */
  @Query(() => PaginatedAuditLogResponseGraphQL, {
    name: "userAuditHistory",
    description: "Get audit history for a specific user",
  })
  @Throttle({ default: { limit: 100, ttl: 60000 } }) // 100 requests per minute
  @UseGuards(CustomThrottlerGuard)
  async getUserAuditHistory(
    @Args() args: GetUserAuditHistoryArgs
  ): Promise<PaginatedAuditLogResponseGraphQL> {
    this.logger.debug(`Getting user audit history for user ${args.userId}`);

    const {
      userId,
      page = 1,
      limit = 20,
      entityType,
      action,
      startDate,
      endDate,
    } = args;
    const offset = (page - 1) * limit;

    const options = {
      limit,
      offset,
      orderBy: { createdAt: "desc" as const },
      ...(entityType && { entityType }),
      ...(action && { action }),
      ...(startDate && { startDate: new Date(startDate) }),
      ...(endDate && { endDate: new Date(endDate) }),
    };

    try {
      const [auditLogs, total] = await Promise.all([
        this.auditService.getUserAuditHistory(userId, options),
        this.auditService.countAuditLogs({
          userId,
          ...(entityType && { entityType }),
          ...(action && { action }),
          ...(startDate && { startDate: new Date(startDate) }),
          ...(endDate && { endDate: new Date(endDate) }),
        }),
      ]);

      const totalPages = Math.ceil(total / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      const responseData = auditLogs.map((log) => ({
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
      }));

      return {
        data: responseData,
        total,
        page,
        limit,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get user audit history for user ${userId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get a specific audit log by ID
   */
  @Query(() => AuditLogGraphQL, {
    name: "auditLog",
    description: "Get a specific audit log by ID",
    nullable: true,
  })
  @Throttle({ default: { limit: 200, ttl: 60000 } }) // 200 requests per minute
  @UseGuards(CustomThrottlerGuard)
  async getAuditLogById(
    @Args() args: GetAuditLogByIdArgs
  ): Promise<AuditLogGraphQL | null> {
    this.logger.debug(`Getting audit log by ID: ${args.id}`);

    try {
      const auditLog = await this.auditService.getAuditLogById(args.id);

      if (!auditLog) {
        throw new NotFoundException(`Audit log with ID ${args.id} not found`);
      }

      return {
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
      };
    } catch (error) {
      this.logger.error(`Failed to get audit log by ID ${args.id}:`, error);
      throw error;
    }
  }

  /**
   * Get formatted audit summary for display purposes
   */
  @Query(() => [FormattedAuditLogGraphQL], {
    name: "formattedAuditSummary",
    description: "Get formatted audit logs for display purposes",
  })
  @Throttle({ default: { limit: 50, ttl: 60000 } }) // 50 requests per minute
  @UseGuards(CustomThrottlerGuard)
  async getFormattedAuditSummary(
    @Args("limit", { type: () => Number, defaultValue: 50, nullable: true })
    limit: number = 50,
    @Args("entityType", { type: () => String, nullable: true })
    entityType?: string,
    @Args("entityId", { type: () => String, nullable: true }) entityId?: string
  ): Promise<FormattedAuditLogGraphQL[]> {
    this.logger.debug(`Getting formatted audit summary with limit: ${limit}`);

    try {
      const auditLogs = await this.auditService.getAuditLogs({
        limit: Math.min(limit, 100), // Cap at 100 for performance
        offset: 0,
        orderBy: { createdAt: "desc" },
        ...(entityType && { entityType }),
        ...(entityId && { entityId }),
      });

      return auditLogs.map((log) => {
        const formatted = this.auditService.formatAuditLog(log);
        return {
          id: formatted.id,
          timestamp: formatted.timestamp,
          action: formatted.action,
          entity: formatted.entity,
          user: formatted.user,
          changes: formatted.changes,
          ipAddress: formatted.ipAddress,
        };
      });
    } catch (error) {
      this.logger.error("Failed to get formatted audit summary:", error);
      throw error;
    }
  }
}
