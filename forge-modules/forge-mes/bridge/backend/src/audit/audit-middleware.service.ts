import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, AuditLogData } from "./audit.service";
import { AuditAction } from "@prisma/client";
import { ClsService } from "nestjs-cls";

// Define which models should be audited
const AUDITABLE_MODELS = [
  // Configuration Models
  "EnzymeConfiguration",
  "SystemConfiguration",
  "EnzymeCalculationRule",
  "MillingBinConfiguration",
  "UnsConfiguration",
  "UnsBrokerConfiguration",
  "Units",

  // Recipe and Production Models
  "Recipe",
  "RecipeGroup",
  "RecipeParameter",
  "RecipeBom",
  "RecipeBomItem",
  "RecipeBomActual",
  "MashingProtocol",
  "MashingProtocolStep",
  "MashingProtocolStepActual",

  // Production Order Models
  "ProductionOrder",
  "ProductionOrderBomItem",
  "ProductionOrderRecipeInstance",
  "ScheduleOrder",
  "ScheduleOrderQueue",

  // Equipment and Process Models
  "Operation",
  "Procedure",
  "UnitProcedure",
  "EquipmentPhase",
  "PhaseParameter",
  "TestParameter",
  "Instruction",

  // Inventory and Materials
  "Item",
  "ItemGroup",
  "ItemReceipt",
  "Inventory",
  "InventoryLog",
  "InventoryTransfer",
  "Lot",
  "Batch",
  "AdditiveActual",

  // BOM and Structure
  "Bom",
  "BomItem",

  // Orders and Customers
  "PurchaseOrder",
  "SalesOrder",
  "Customer",
  "Vendor",

  // Assets and Equipment
  "Asset",
  "UnitLookup",

  // Testing and Quality
  "Test",

  // Communication and Messaging
  "MessageQueue",
  "MqttMessage",
  "MqttTagMapping",

  // User Interface and Notifications
  "Dashboard",
  "Widget",
  "Notification",
  "Comment",

  // User Management (excluding User model to avoid circular references in audit logs)
  // Note: User model changes should be audited separately if needed
] as const;

type AuditableModel = (typeof AUDITABLE_MODELS)[number];

// Interface for request context (user info, IP, etc.)
export interface AuditContext {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditMiddlewareService implements OnModuleInit {
  private readonly logger = new Logger(AuditMiddlewareService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly cls: ClsService
  ) {}

  onModuleInit() {
    this.logger.debug("AuditMiddlewareService initializing...");
    this.setupPrismaMiddleware();
    this.logger.debug("AuditMiddlewareService initialized successfully");
  }

  private setupPrismaMiddleware() {
    this.logger.debug("Setting up Prisma audit middleware...");

    // Log the Prisma instance to make sure we have the right one
    this.logger.debug(`Prisma instance: ${this.prisma.constructor.name}`);

    this.prisma.$use(async (params, next) => {
      const { model, action } = params;

      // Skip batch operations - they will be audited manually with logBatchCreate
      if (
        action === "createMany" ||
        action === "updateMany" ||
        action === "deleteMany"
      ) {
        return next(params);
      }

      // Only audit specific models and actions
      if (
        !model ||
        !this.isAuditableModel(model) ||
        !this.isAuditableAction(action)
      ) {
        return next(params);
      }

      try {
        // Get the current audit context from CLS (Continuation Local Storage)
        const auditContext = this.getAuditContext();

        // If no user context, check if we're in a system operation context
        if (!auditContext.userId) {
          const systemContext = this.getSystemContext();
          if (systemContext) {
            Object.assign(auditContext, systemContext);
          } else {
            // No context available, skip auditing
            return next(params);
          }
        }

        let oldValues: any = null;
        let entityId: string | null = null;

        // For UPDATE and DELETE operations, fetch the current state
        if (action === "update" || action === "delete") {
          const whereClause = params.args?.where;
          if (whereClause) {
            try {
              const currentRecord = await this.findCurrentRecord(
                model,
                whereClause
              );
              if (currentRecord) {
                oldValues = this.sanitizeRecord(currentRecord);
                entityId = currentRecord.id || currentRecord.globalId;
              }
            } catch (error) {
              this.logger.warn(
                `Failed to fetch current record for audit: ${
                  error instanceof Error ? error.message : String(error)
                }`
              );
            }
          }
        }

        // Execute the operation
        const result = await next(params);

        // Determine entity ID for the audit log
        const finalEntityId = entityId || result?.id || result?.globalId;

        // Log the audit entry after successful operation
        await this.logAuditEntry({
          model,
          action,
          entityId: finalEntityId,
          oldValues,
          newValues: action !== "delete" ? this.sanitizeRecord(result) : null,
          auditContext,
        });

        return result;
      } catch (error) {
        // If audit logging fails, don't break the main operation
        this.logger.error(
          `Audit logging failed for ${model}.${action}:`,
          error
        );
        return next(params);
      }
    });
  }

  private getAuditContext(): AuditContext {
    try {
      // Get audit context from CLS (Continuation Local Storage)
      return {
        userId: this.cls.get("userId"),
        ipAddress: this.cls.get("ipAddress"),
        userAgent: this.cls.get("userAgent"),
      };
    } catch (error) {
      // CLS context might not be available (e.g., in scheduled tasks)
      this.logger.debug(
        "CLS context not available, checking for system context"
      );
      return {};
    }
  }

  private getSystemContext(): AuditContext | null {
    try {
      // Check if we're in a system operation context
      const systemUserId = this.cls.get("systemUserId");
      const operationType = this.cls.get("operationType");

      if (systemUserId || operationType) {
        return {
          userId: systemUserId || undefined,
          ipAddress: "internal",
          userAgent: operationType || "system-operation",
        };
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  private async logAuditEntry({
    model,
    action,
    entityId,
    oldValues,
    newValues,
    auditContext,
  }: {
    model: string;
    action: string;
    entityId: string;
    oldValues: any;
    newValues: any;
    auditContext: AuditContext;
  }) {
    this.logger.debug(
      `📝 Attempting to log audit entry for ${model}.${action}`
    );
    this.logger.debug(`   - Entity ID: ${entityId}`);
    this.logger.debug(`   - User ID: ${auditContext.userId}`);
    this.logger.debug(`   - IP Address: ${auditContext.ipAddress}`);
    this.logger.debug(`   - User Agent: ${auditContext.userAgent}`);

    if (!auditContext.userId || !entityId) {
      this.logger.debug(
        `❌ Skipping audit entry - missing userId (${auditContext.userId}) or entityId (${entityId})`
      );
      return;
    }

    const auditAction = this.mapToAuditAction(action);
    if (!auditAction) {
      this.logger.debug(`❌ Skipping audit entry - invalid action: ${action}`);
      return;
    }

    this.logger.debug(`🎯 Mapped action ${action} to ${auditAction}`);

    // Extract only changed fields for updates
    let finalOldValues = oldValues;
    let finalNewValues = newValues;

    if (action === "update" && oldValues && newValues) {
      const changes = this.auditService.extractChanges(oldValues, newValues);
      finalOldValues = changes.oldValues;
      finalNewValues = changes.newValues;

      this.logger.debug(`🔄 Extracted changes for update:`);
      this.logger.debug(`   - Old values: ${JSON.stringify(finalOldValues)}`);
      this.logger.debug(`   - New values: ${JSON.stringify(finalNewValues)}`);

      // Skip audit if no actual changes
      if (Object.keys(finalNewValues).length === 0) {
        this.logger.debug(
          `⏭️ Skipping audit entry - no actual changes detected`
        );
        return;
      }
    }

    const auditData: AuditLogData = {
      entityType: model,
      entityId,
      action: auditAction,
      oldValues: finalOldValues,
      newValues: finalNewValues,
      userId: auditContext.userId,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
    };

    this.logger.debug(
      `💾 Creating audit log entry with data: ${JSON.stringify(
        auditData,
        null,
        2
      )}`
    );

    // Fire-and-forget: don't await to avoid blocking transactions
    // This improves performance significantly for bulk operations
    this.auditService
      .logChange(auditData)
      .then((result) => {
        this.logger.debug(
          `✅ Successfully created audit log entry: ${JSON.stringify(result)}`
        );
      })
      .catch((error) => {
        this.logger.error("Failed to create audit log entry:", error);
      });
  }

  private isAuditableModel(model: string): model is AuditableModel {
    return AUDITABLE_MODELS.includes(model as AuditableModel);
  }

  private isAuditableAction(action: string): boolean {
    return ["create", "update", "delete"].includes(action);
  }

  private mapToAuditAction(action: string): AuditAction | null {
    switch (action) {
      case "create":
        return AuditAction.CREATE;
      case "update":
        return AuditAction.UPDATE;
      case "delete":
        return AuditAction.DELETE;
      default:
        return null;
    }
  }

  private async findCurrentRecord(
    model: string,
    whereClause: any
  ): Promise<any> {
    // Convert model name to camelCase for Prisma client access
    // e.g., "MashingProtocol" -> "mashingProtocol"
    const camelCaseModel = model.charAt(0).toLowerCase() + model.slice(1);

    this.logger.debug(`🔍 Looking up model: ${model} -> ${camelCaseModel}`);

    // Use dynamic model access
    const modelDelegate = (this.prisma as any)[camelCaseModel];
    if (!modelDelegate) {
      this.logger.error(
        `❌ Model ${camelCaseModel} not found in Prisma client`
      );
      throw new Error(
        `Model ${model} (${camelCaseModel}) not found in Prisma client`
      );
    }

    this.logger.debug(
      `📋 Found model delegate for ${camelCaseModel}, executing findUnique with where: ${JSON.stringify(
        whereClause
      )}`
    );

    const result = await modelDelegate.findUnique({
      where: whereClause,
    });

    this.logger.debug(
      `📄 findUnique result: ${result ? "FOUND" : "NOT FOUND"}`
    );

    return result;
  }

  private sanitizeRecord(record: any): any {
    if (!record) return null;

    // Remove sensitive fields and circular references
    const sanitized = { ...record };

    // Remove common sensitive fields
    delete sanitized.password;
    delete sanitized.token;
    delete sanitized.secret;

    // Convert dates to ISO strings for JSON serialization
    Object.keys(sanitized).forEach((key) => {
      if (sanitized[key] instanceof Date) {
        sanitized[key] = sanitized[key].toISOString();
      }
    });

    return sanitized;
  }

  /**
   * Set audit context for the current request
   * This should be called by an interceptor or middleware
   */
  setAuditContext(context: AuditContext) {
    this.cls.set("userId", context.userId);
    this.cls.set("ipAddress", context.ipAddress);
    this.cls.set("userAgent", context.userAgent);
  }

  /**
   * Set system context for background operations
   * This should be called before performing system operations
   */
  setSystemContext(operationType: string, systemUserId?: string) {
    this.cls.set("systemUserId", systemUserId || "system");
    this.cls.set("operationType", operationType);
  }

  /**
   * Clear audit context
   */
  clearAuditContext() {
    this.cls.set("userId", undefined);
    this.cls.set("ipAddress", undefined);
    this.cls.set("userAgent", undefined);
    this.cls.set("systemUserId", undefined);
    this.cls.set("operationType", undefined);
  }

  /**
   * Execute a function with system audit context
   * This is useful for scheduled tasks and background operations
   */
  async withSystemContext<T>(
    operationType: string,
    operation: () => Promise<T>,
    systemUserId?: string
  ): Promise<T> {
    return this.cls.run(async () => {
      this.setSystemContext(operationType, systemUserId);
      try {
        return await operation();
      } finally {
        this.clearAuditContext();
      }
    });
  }
}
