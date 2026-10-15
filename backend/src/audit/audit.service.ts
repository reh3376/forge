import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ClsService } from "nestjs-cls";
import {
  Prisma,
  AuditLog as PrismaAuditLog,
  AuditAction,
  User,
} from "@prisma/client";

export interface AuditLogData {
  entityType: string;
  entityId: string;
  action: AuditAction;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  userId?: string | null;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogWithUser extends PrismaAuditLog {
  user: Pick<User, "id" | "username" | "firstName" | "lastName"> | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService
  ) {}

  /**
   * Log an audit entry for configuration changes
   * @param data The audit log data
   * @returns The created audit log entry
   */
  async logChange(data: AuditLogData): Promise<PrismaAuditLog | null> {
    try {
      const auditLog = await this.prisma.auditLog.create({
        data: {
          entityType: data.entityType,
          entityId: data.entityId,
          action: data.action,
          oldValues: data.oldValues
            ? (data.oldValues as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          newValues: data.newValues
            ? (data.newValues as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          userId: data.userId || undefined,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
        },
      });

      this.logger.debug(
        `Audit log created: ${data.action} on ${data.entityType}:${data.entityId} by user ${data.userId || "system"}`
      );

      return auditLog;
    } catch (error) {
      this.logger.error("Failed to create audit log:", error);
      // Don't throw - audit failures should not break primary operations
      return null;
    }
  }

  /**
   * Get audit logs for a specific entity
   * @param entityType The type of entity
   * @param entityId The ID of the entity
   * @param options Optional query options
   * @returns Array of audit logs with user information
   */
  async getEntityAuditHistory(
    entityType: string,
    entityId: string,
    options?: {
      limit?: number;
      offset?: number;
      orderBy?: Prisma.AuditLogOrderByWithRelationInput;
    }
  ): Promise<AuditLogWithUser[]> {
    const {
      limit = 50,
      offset = 0,
      orderBy = { createdAt: "desc" },
    } = options || {};

    return this.prisma.auditLog.findMany({
      where: {
        entityType,
        entityId,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy,
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get audit logs by user
   * @param userId The user ID
   * @param options Optional query options
   * @returns Array of audit logs with user information
   */
  async getUserAuditHistory(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      entityType?: string;
      action?: AuditAction;
      startDate?: Date;
      endDate?: Date;
      orderBy?: Prisma.AuditLogOrderByWithRelationInput;
    }
  ): Promise<AuditLogWithUser[]> {
    const {
      limit = 50,
      offset = 0,
      entityType,
      action,
      startDate,
      endDate,
      orderBy = { createdAt: "desc" },
    } = options || {};

    const where: Prisma.AuditLogWhereInput = {
      userId,
      ...(entityType && { entityType }),
      ...(action && { action }),
      ...((startDate || endDate) && {
        createdAt: {
          ...(startDate && { gte: startDate }),
          ...(endDate && { lte: endDate }),
        },
      }),
    };

    return this.prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy,
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get all audit logs with filtering options
   * @param options Query options and filters
   * @returns Array of audit logs with user information
   */
  async getAuditLogs(options?: {
    limit?: number;
    offset?: number;
    entityType?: string;
    entityId?: string;
    action?: AuditAction;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    orderBy?: Prisma.AuditLogOrderByWithRelationInput;
  }): Promise<AuditLogWithUser[]> {
    const {
      limit = 50,
      offset = 0,
      entityType,
      entityId,
      action,
      userId,
      startDate,
      endDate,
      orderBy = { createdAt: "desc" },
    } = options || {};

    const where: Prisma.AuditLogWhereInput = {
      ...(entityType && { entityType }),
      ...(entityId && { entityId }),
      ...(action && { action }),
      ...(userId && { userId }),
      ...((startDate || endDate) && {
        createdAt: {
          ...(startDate && { gte: startDate }),
          ...(endDate && { lte: endDate }),
        },
      }),
    };

    return this.prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy,
      take: limit,
      skip: offset,
    });
  }

  /**
   * Count audit logs with filtering options
   * @param options Filter options
   * @returns Count of matching audit logs
   */
  async countAuditLogs(options?: {
    entityType?: string;
    entityId?: string;
    action?: AuditAction;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<number> {
    const { entityType, entityId, action, userId, startDate, endDate } =
      options || {};

    const where: Prisma.AuditLogWhereInput = {
      ...(entityType && { entityType }),
      ...(entityId && { entityId }),
      ...(action && { action }),
      ...(userId && { userId }),
      ...((startDate || endDate) && {
        createdAt: {
          ...(startDate && { gte: startDate }),
          ...(endDate && { lte: endDate }),
        },
      }),
    };

    return this.prisma.auditLog.count({ where });
  }

  /**
   * Get a single audit log by ID
   * @param id The audit log ID
   * @returns The audit log with user information or null
   */
  async getAuditLogById(id: string): Promise<AuditLogWithUser | null> {
    return this.prisma.auditLog.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  /**
   * Delete old audit logs (for cleanup/archival purposes)
   * @param olderThan Date threshold - logs older than this will be deleted
   * @returns Count of deleted logs
   */
  async deleteOldAuditLogs(olderThan: Date): Promise<number> {
    try {
      const result = await this.prisma.auditLog.deleteMany({
        where: {
          createdAt: {
            lt: olderThan,
          },
        },
      });

      this.logger.debug(
        `Deleted ${
          result.count
        } audit logs older than ${olderThan.toISOString()}`
      );
      return result.count;
    } catch (error) {
      this.logger.error("Failed to delete old audit logs:", error);
      throw error;
    }
  }

  /**
   * Helper method to compare objects and extract changes
   * @param oldObject The original object
   * @param newObject The updated object
   * @returns Object containing only the changed fields
   */
  extractChanges(
    oldObject: Record<string, any>,
    newObject: Record<string, any>
  ): { oldValues: Record<string, any>; newValues: Record<string, any> } {
    const oldValues: Record<string, any> = {};
    const newValues: Record<string, any> = {};

    // Get all unique keys from both objects
    const allKeys = new Set([
      ...Object.keys(oldObject),
      ...Object.keys(newObject),
    ]);

    for (const key of allKeys) {
      const oldValue = oldObject[key];
      const newValue = newObject[key];

      // Skip if values are the same
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        oldValues[key] = oldValue;
        newValues[key] = newValue;
      }
    }

    return { oldValues, newValues };
  }

  /**
   * Helper method to format audit log for display
   * @param auditLog The audit log to format
   * @returns Formatted audit log information
   */
  formatAuditLog(auditLog: AuditLogWithUser): {
    id: string;
    timestamp: string;
    action: string;
    entity: string;
    user: string;
    changes?: string;
    ipAddress?: string;
  } {
    const user = auditLog.user;
    const userName = user
      ? user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName} (${user.username})`
        : user.username
      : "system";

    let changes: string | undefined;
    if (
      auditLog.action === "UPDATE" &&
      auditLog.oldValues &&
      auditLog.newValues
    ) {
      // Type guard to ensure we're working with objects
      const oldValues = auditLog.oldValues as Record<string, any>;
      const newValues = auditLog.newValues as Record<string, any>;

      if (
        typeof oldValues === "object" &&
        typeof newValues === "object" &&
        oldValues !== null &&
        newValues !== null &&
        !Array.isArray(oldValues) &&
        !Array.isArray(newValues)
      ) {
        const changesList = Object.keys(newValues).map((key) => {
          const oldVal = oldValues[key];
          const newVal = newValues[key];
          return `${key}: ${JSON.stringify(oldVal)} → ${JSON.stringify(
            newVal
          )}`;
        });
        changes = changesList.join(", ");
      }
    }

    return {
      id: auditLog.id,
      timestamp: auditLog.createdAt.toISOString(),
      action: auditLog.action,
      entity: `${auditLog.entityType}:${auditLog.entityId}`,
      user: userName,
      changes,
      ipAddress: auditLog.ipAddress || undefined,
    };
  }

  /**
   * Log an audit entry using CLS context for user information
   * @param data The audit log data (userId will be automatically filled from CLS if not provided)
   * @returns The created audit log entry
   */
  async logChangeWithContext(
    data: Omit<AuditLogData, "userId"> & { userId?: string }
  ): Promise<PrismaAuditLog | null> {
    try {
      // Get user context from CLS if not provided
      const userId = data.userId || this.cls.get("userId");

      if (!userId) {
        this.logger.warn("No user context available for audit logging");
        return null;
      }

      const auditData: AuditLogData = {
        ...data,
        userId,
        ipAddress: data.ipAddress || this.cls.get("ipAddress"),
        userAgent: data.userAgent || this.cls.get("userAgent"),
      };

      return this.logChange(auditData);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(
        "Failed to create audit log with context:",
        errorMessage
      );
      return null;
    }
  }

  /**
   * Log a batch audit entry for bulk create operations
   * Creates a single summary audit entry for multiple records created in bulk
   * @param params Batch audit parameters
   * @returns The created audit log entry or null if failed
   */
  async logBatchCreate(params: {
    entityType: string;
    count: number;
    userId?: string | null;
    ipAddress?: string;
    userAgent?: string;
    summary: Record<string, any>;
  }): Promise<PrismaAuditLog | null> {
    try {
      const auditLog = await this.prisma.auditLog.create({
        data: {
          entityType: params.entityType,
          entityId: "batch-operation", // Special entity ID for batch operations
          action: AuditAction.CREATE,
          oldValues: Prisma.JsonNull,
          newValues: {
            batchOperation: true,
            count: params.count,
            summary: params.summary,
            timestamp: new Date().toISOString(),
          } as Prisma.InputJsonValue,
          userId: params.userId || undefined,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
        },
      });

      this.logger.debug(
        `Batch audit log created: CREATE ${params.count} ${params.entityType} records by user ${params.userId}`
      );

      return auditLog;
    } catch (error) {
      this.logger.error("Failed to create batch audit log:", error);
      // Don't throw - audit failure shouldn't break the operation
      return null;
    }
  }
}
