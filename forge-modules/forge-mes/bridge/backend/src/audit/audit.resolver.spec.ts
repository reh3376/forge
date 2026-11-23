import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { AuditResolver } from "./audit.resolver";
import { AuditService } from "./audit.service";
import { CustomThrottlerGuard } from "../guards/custom-throttler.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import { GqlACGuard } from "../auth/gqlAC.guard";
import { AuditAction } from "@prisma/client";

describe("AuditResolver", () => {
  let resolver: AuditResolver;
  let auditService: jest.Mocked<AuditService>;

  const mockAuditLog = {
    id: "test-id",
    globalId: "test-global-id",
    entityType: "EnzymeConfiguration",
    entityId: "test-entity-id",
    action: AuditAction.UPDATE,
    oldValues: { dosePerMetricTon: 0.5 },
    newValues: { dosePerMetricTon: 0.75 },
    userId: "user-id",
    user: {
      id: "user-id",
      username: "testuser",
      firstName: "Test",
      lastName: "User",
    },
    ipAddress: "192.168.1.100",
    userAgent: "Mozilla/5.0",
    createdAt: new Date("2024-01-01T12:00:00.000Z"),
    updatedAt: new Date("2024-01-01T12:00:00.000Z"),
  };

  const mockCustomThrottlerGuard = {
    canActivate: jest.fn().mockReturnValue(true),
  };

  beforeEach(async () => {
    const mockAuditService = {
      getAuditLogs: jest.fn(),
      countAuditLogs: jest.fn(),
      getEntityAuditHistory: jest.fn(),
      getUserAuditHistory: jest.fn(),
      getAuditLogById: jest.fn(),
      formatAuditLog: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditResolver,
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
      ],
    })
      .overrideGuard(GqlDefaultAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(GqlACGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(CustomThrottlerGuard)
      .useValue(mockCustomThrottlerGuard)
      .compile();

    resolver = module.get<AuditResolver>(AuditResolver);
    auditService = module.get(AuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getAuditLogs", () => {
    it("should return paginated audit logs", async () => {
      const args = {
        page: 1,
        limit: 20,
        sortBy: "createdAt",
        sortOrder: "desc" as const,
        filters: {
          entityType: "EnzymeConfiguration",
          action: AuditAction.UPDATE,
        },
      };

      auditService.getAuditLogs.mockResolvedValue([mockAuditLog]);
      auditService.countAuditLogs.mockResolvedValue(1);

      const result = await resolver.getAuditLogs(args);

      expect(result).toEqual({
        data: [
          {
            id: mockAuditLog.id,
            globalId: mockAuditLog.globalId,
            entityType: mockAuditLog.entityType,
            entityId: mockAuditLog.entityId,
            action: mockAuditLog.action,
            oldValues: mockAuditLog.oldValues,
            newValues: mockAuditLog.newValues,
            user: mockAuditLog.user,
            ipAddress: mockAuditLog.ipAddress,
            userAgent: mockAuditLog.userAgent,
            createdAt: mockAuditLog.createdAt,
            updatedAt: mockAuditLog.updatedAt,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      expect(auditService.getAuditLogs).toHaveBeenCalledWith({
        limit: 20,
        offset: 0,
        orderBy: { createdAt: "desc" },
        entityType: "EnzymeConfiguration",
        action: AuditAction.UPDATE,
      });

      expect(auditService.countAuditLogs).toHaveBeenCalledWith({
        entityType: "EnzymeConfiguration",
        action: AuditAction.UPDATE,
      });
    });

    it("should handle empty results", async () => {
      const args = {
        page: 1,
        limit: 20,
        sortBy: "createdAt",
        sortOrder: "desc" as const,
      };

      auditService.getAuditLogs.mockResolvedValue([]);
      auditService.countAuditLogs.mockResolvedValue(0);

      const result = await resolver.getAuditLogs(args);

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });
  });

  describe("getEntityAuditHistory", () => {
    it("should return audit history for a specific entity", async () => {
      const args = {
        entityType: "EnzymeConfiguration",
        entityId: "test-entity-id",
        page: 1,
        limit: 20,
      };

      auditService.getEntityAuditHistory.mockResolvedValue([mockAuditLog]);
      auditService.countAuditLogs.mockResolvedValue(1);

      const result = await resolver.getEntityAuditHistory(args);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(auditService.getEntityAuditHistory).toHaveBeenCalledWith(
        "EnzymeConfiguration",
        "test-entity-id",
        {
          limit: 20,
          offset: 0,
          orderBy: { createdAt: "desc" },
        }
      );
    });
  });

  describe("getUserAuditHistory", () => {
    it("should return audit history for a specific user", async () => {
      const args = {
        userId: "user-id",
        page: 1,
        limit: 20,
        entityType: "EnzymeConfiguration",
        action: AuditAction.UPDATE,
      };

      auditService.getUserAuditHistory.mockResolvedValue([mockAuditLog]);
      auditService.countAuditLogs.mockResolvedValue(1);

      const result = await resolver.getUserAuditHistory(args);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(auditService.getUserAuditHistory).toHaveBeenCalledWith("user-id", {
        limit: 20,
        offset: 0,
        orderBy: { createdAt: "desc" },
        entityType: "EnzymeConfiguration",
        action: AuditAction.UPDATE,
      });
    });
  });

  describe("getAuditLogById", () => {
    it("should return a specific audit log by ID", async () => {
      const args = { id: "test-id" };

      auditService.getAuditLogById.mockResolvedValue(mockAuditLog);

      const result = await resolver.getAuditLogById(args);

      expect(result).toEqual({
        id: mockAuditLog.id,
        globalId: mockAuditLog.globalId,
        entityType: mockAuditLog.entityType,
        entityId: mockAuditLog.entityId,
        action: mockAuditLog.action,
        oldValues: mockAuditLog.oldValues,
        newValues: mockAuditLog.newValues,
        user: mockAuditLog.user,
        ipAddress: mockAuditLog.ipAddress,
        userAgent: mockAuditLog.userAgent,
        createdAt: mockAuditLog.createdAt,
        updatedAt: mockAuditLog.updatedAt,
      });

      expect(auditService.getAuditLogById).toHaveBeenCalledWith("test-id");
    });

    it("should throw NotFoundException when audit log is not found", async () => {
      const args = { id: "non-existent-id" };

      auditService.getAuditLogById.mockResolvedValue(null);

      await expect(resolver.getAuditLogById(args)).rejects.toThrow(
        new NotFoundException("Audit log with ID non-existent-id not found")
      );
    });
  });

  describe("getFormattedAuditSummary", () => {
    it("should return formatted audit summary", async () => {
      const mockFormattedLog = {
        id: "test-id",
        timestamp: "2024-01-01T12:00:00.000Z",
        action: "Updated",
        entity: "EnzymeConfiguration (test-entity-id)",
        user: "Test User (testuser)",
        changes: "dosePerMetricTon: 0.5 → 0.75",
        ipAddress: "192.168.1.100",
      };

      auditService.getAuditLogs.mockResolvedValue([mockAuditLog]);
      auditService.formatAuditLog.mockReturnValue(mockFormattedLog);

      const result = await resolver.getFormattedAuditSummary(
        50,
        "EnzymeConfiguration"
      );

      expect(result).toEqual([mockFormattedLog]);
      expect(auditService.getAuditLogs).toHaveBeenCalledWith({
        limit: 50,
        offset: 0,
        orderBy: { createdAt: "desc" },
        entityType: "EnzymeConfiguration",
      });
      expect(auditService.formatAuditLog).toHaveBeenCalledWith(mockAuditLog);
    });

    it("should cap limit at 100 for performance", async () => {
      auditService.getAuditLogs.mockResolvedValue([]);
      auditService.formatAuditLog.mockReturnValue({} as any);

      await resolver.getFormattedAuditSummary(200);

      expect(auditService.getAuditLogs).toHaveBeenCalledWith({
        limit: 100, // Should be capped at 100
        offset: 0,
        orderBy: { createdAt: "desc" },
      });
    });
  });
});
