import { Test, TestingModule } from "@nestjs/testing";
import { ClsService } from "nestjs-cls";
import { AuditService, AuditLogData, AuditLogWithUser } from "./audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditAction } from "@prisma/client";

describe("AuditService", () => {
  let service: AuditService;
  let prismaService: PrismaService;
  let clsService: ClsService;

  const mockAuditLog = {
    id: "audit-1",
    globalId: "global-1",
    entityType: "EnzymeConfiguration",
    entityId: "entity-1",
    action: AuditAction.UPDATE,
    oldValues: { name: "Old Name", active: true },
    newValues: { name: "New Name", active: false },
    userId: "user-1",
    ipAddress: "192.168.1.1",
    userAgent: "Mozilla/5.0",
    createdAt: new Date("2023-01-01T10:00:00Z"),
    updatedAt: new Date("2023-01-01T10:00:00Z"),
    user: {
      id: "user-1",
      username: "testuser",
      firstName: "Test",
      lastName: "User",
    },
  };

  const mockPrismaService = {
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockClsService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ClsService,
          useValue: mockClsService,
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
    prismaService = module.get<PrismaService>(PrismaService);
    clsService = module.get<ClsService>(ClsService);

    // Reset all mocks
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("logChange", () => {
    it("should create an audit log entry", async () => {
      mockPrismaService.auditLog.create.mockResolvedValue(mockAuditLog);

      const auditData: AuditLogData = {
        entityType: "EnzymeConfiguration",
        entityId: "entity-1",
        action: AuditAction.UPDATE,
        oldValues: { name: "Old Name" },
        newValues: { name: "New Name" },
        userId: "user-1",
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
      };

      const result = await service.logChange(auditData);

      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith({
        data: {
          entityType: "EnzymeConfiguration",
          entityId: "entity-1",
          action: AuditAction.UPDATE,
          oldValues: { name: "Old Name" },
          newValues: { name: "New Name" },
          userId: "user-1",
          ipAddress: "192.168.1.1",
          userAgent: "Mozilla/5.0",
        },
      });

      expect(result).toEqual(mockAuditLog);
    });

    it("should handle missing optional values", async () => {
      mockPrismaService.auditLog.create.mockResolvedValue({
        ...mockAuditLog,
        oldValues: null,
        ipAddress: null,
        userAgent: null,
      });

      const auditData: AuditLogData = {
        entityType: "EnzymeConfiguration",
        entityId: "entity-1",
        action: AuditAction.CREATE,
        newValues: { name: "New Entity" },
        userId: "user-1",
      };

      await service.logChange(auditData);

      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith({
        data: {
          entityType: "EnzymeConfiguration",
          entityId: "entity-1",
          action: AuditAction.CREATE,
          oldValues: expect.any(Object), // This will be Prisma.JsonNull
          newValues: { name: "New Entity" },
          userId: "user-1",
          ipAddress: undefined,
          userAgent: undefined,
        },
      });
    });

    it("should handle errors gracefully", async () => {
      mockPrismaService.auditLog.create.mockRejectedValue(
        new Error("Database error")
      );

      const auditData: AuditLogData = {
        entityType: "EnzymeConfiguration",
        entityId: "entity-1",
        action: AuditAction.UPDATE,
        oldValues: { name: "Old Name" },
        newValues: { name: "New Name" },
        userId: "user-1",
      };

      await expect(service.logChange(auditData)).rejects.toThrow(
        "Database error"
      );
    });
  });

  describe("logChangeWithContext", () => {
    beforeEach(() => {
      mockClsService.get.mockImplementation((key: string) => {
        switch (key) {
          case "userId":
            return "user-1";
          case "ipAddress":
            return "192.168.1.1";
          case "userAgent":
            return "Mozilla/5.0";
          default:
            return undefined;
        }
      });
    });

    it("should create an audit log entry using CLS context", async () => {
      mockPrismaService.auditLog.create.mockResolvedValue(mockAuditLog);

      const result = await service.logChangeWithContext({
        entityType: "EnzymeConfiguration",
        entityId: "entity-1",
        action: AuditAction.UPDATE,
        oldValues: { name: "Old Name" },
        newValues: { name: "New Name" },
      });

      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith({
        data: {
          entityType: "EnzymeConfiguration",
          entityId: "entity-1",
          action: AuditAction.UPDATE,
          oldValues: { name: "Old Name" },
          newValues: { name: "New Name" },
          userId: "user-1",
          ipAddress: "192.168.1.1",
          userAgent: "Mozilla/5.0",
        },
      });

      expect(result).toEqual(mockAuditLog);
    });

    it("should return null when no user context available", async () => {
      mockClsService.get.mockReturnValue(undefined);

      const result = await service.logChangeWithContext({
        entityType: "EnzymeConfiguration",
        entityId: "entity-1",
        action: AuditAction.CREATE,
        newValues: { name: "New Entity" },
      });

      expect(result).toBeNull();
      expect(mockPrismaService.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe("getAuditLogs", () => {
    it("should return paginated audit logs with default options", async () => {
      const mockLogs = [mockAuditLog];
      mockPrismaService.auditLog.findMany.mockResolvedValue(mockLogs);

      const result = await service.getAuditLogs();

      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith({
        where: {},
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
        orderBy: { createdAt: "desc" },
        take: 50,
        skip: 0,
      });

      expect(result).toEqual(mockLogs);
    });

    it("should apply filters correctly", async () => {
      const mockLogs = [mockAuditLog];
      mockPrismaService.auditLog.findMany.mockResolvedValue(mockLogs);

      const options = {
        entityType: "EnzymeConfiguration",
        action: AuditAction.UPDATE,
        userId: "user-1",
        startDate: new Date("2023-01-01"),
        endDate: new Date("2023-01-31"),
        limit: 10,
        offset: 5,
      };

      await service.getAuditLogs(options);

      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          entityType: "EnzymeConfiguration",
          action: AuditAction.UPDATE,
          userId: "user-1",
          createdAt: {
            gte: new Date("2023-01-01"),
            lte: new Date("2023-01-31"),
          },
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
        orderBy: { createdAt: "desc" },
        take: 10,
        skip: 5,
      });
    });

    it("should handle custom ordering", async () => {
      const mockLogs = [mockAuditLog];
      mockPrismaService.auditLog.findMany.mockResolvedValue(mockLogs);

      await service.getAuditLogs({
        orderBy: { action: "asc" },
      });

      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith({
        where: {},
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
        orderBy: { action: "asc" },
        take: 50,
        skip: 0,
      });
    });
  });

  describe("getEntityAuditHistory", () => {
    it("should return audit history for a specific entity", async () => {
      const mockLogs = [mockAuditLog];
      mockPrismaService.auditLog.findMany.mockResolvedValue(mockLogs);

      const result = await service.getEntityAuditHistory(
        "EnzymeConfiguration",
        "entity-1"
      );

      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          entityType: "EnzymeConfiguration",
          entityId: "entity-1",
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
        orderBy: { createdAt: "desc" },
        take: 50,
        skip: 0,
      });

      expect(result).toEqual(mockLogs);
    });

    it("should apply additional options", async () => {
      const mockLogs = [mockAuditLog];
      mockPrismaService.auditLog.findMany.mockResolvedValue(mockLogs);

      await service.getEntityAuditHistory("EnzymeConfiguration", "entity-1", {
        limit: 5,
        offset: 10,
      });

      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          entityType: "EnzymeConfiguration",
          entityId: "entity-1",
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
        orderBy: { createdAt: "desc" },
        take: 5,
        skip: 10,
      });
    });
  });

  describe("getUserAuditHistory", () => {
    it("should return audit history for a specific user", async () => {
      const mockLogs = [mockAuditLog];
      mockPrismaService.auditLog.findMany.mockResolvedValue(mockLogs);

      const result = await service.getUserAuditHistory("user-1");

      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
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
        orderBy: { createdAt: "desc" },
        take: 50,
        skip: 0,
      });

      expect(result).toEqual(mockLogs);
    });

    it("should apply additional filters", async () => {
      const mockLogs = [mockAuditLog];
      mockPrismaService.auditLog.findMany.mockResolvedValue(mockLogs);

      await service.getUserAuditHistory("user-1", {
        entityType: "EnzymeConfiguration",
        action: AuditAction.UPDATE,
        limit: 5,
        offset: 10,
      });

      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          entityType: "EnzymeConfiguration",
          action: AuditAction.UPDATE,
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
        orderBy: { createdAt: "desc" },
        take: 5,
        skip: 10,
      });
    });
  });

  describe("getAuditLogById", () => {
    it("should return a specific audit log by ID", async () => {
      mockPrismaService.auditLog.findUnique.mockResolvedValue(mockAuditLog);

      const result = await service.getAuditLogById("audit-1");

      expect(mockPrismaService.auditLog.findUnique).toHaveBeenCalledWith({
        where: { id: "audit-1" },
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

      expect(result).toEqual(mockAuditLog);
    });

    it("should return null if audit log not found", async () => {
      mockPrismaService.auditLog.findUnique.mockResolvedValue(null);

      const result = await service.getAuditLogById("non-existent");

      expect(result).toBeNull();
    });
  });

  describe("countAuditLogs", () => {
    it("should return count with no filters", async () => {
      mockPrismaService.auditLog.count.mockResolvedValue(100);

      const result = await service.countAuditLogs();

      expect(mockPrismaService.auditLog.count).toHaveBeenCalledWith({
        where: {},
      });
      expect(result).toBe(100);
    });

    it("should return count with filters", async () => {
      mockPrismaService.auditLog.count.mockResolvedValue(25);

      const result = await service.countAuditLogs({
        entityType: "EnzymeConfiguration",
        action: AuditAction.UPDATE,
      });

      expect(mockPrismaService.auditLog.count).toHaveBeenCalledWith({
        where: {
          entityType: "EnzymeConfiguration",
          action: AuditAction.UPDATE,
        },
      });
      expect(result).toBe(25);
    });
  });

  describe("deleteOldAuditLogs", () => {
    it("should delete old audit logs", async () => {
      const olderThan = new Date("2023-01-01");
      mockPrismaService.auditLog.deleteMany.mockResolvedValue({ count: 10 });

      const result = await service.deleteOldAuditLogs(olderThan);

      expect(mockPrismaService.auditLog.deleteMany).toHaveBeenCalledWith({
        where: {
          createdAt: {
            lt: olderThan,
          },
        },
      });
      expect(result).toBe(10);
    });
  });

  describe("extractChanges", () => {
    it("should extract changes between old and new values", () => {
      const oldValues = { name: "Old Name", active: true, count: 5 };
      const newValues = { name: "New Name", active: true, count: 10 };

      const result = service.extractChanges(oldValues, newValues);

      expect(result).toEqual({
        oldValues: { name: "Old Name", count: 5 },
        newValues: { name: "New Name", count: 10 },
      });
    });

    it("should handle empty objects", () => {
      const result = service.extractChanges({}, { name: "New Name" });
      expect(result).toEqual({
        oldValues: { name: undefined },
        newValues: { name: "New Name" },
      });
    });

    it("should return empty objects when no changes detected", () => {
      const values = { name: "Same Name", active: true };
      const result = service.extractChanges(values, values);

      expect(result).toEqual({
        oldValues: {},
        newValues: {},
      });
    });
  });

  describe("formatAuditLog", () => {
    it("should format audit log with user information", () => {
      const result = service.formatAuditLog(mockAuditLog as AuditLogWithUser);

      expect(result).toEqual({
        id: "audit-1",
        timestamp: "2023-01-01T10:00:00.000Z",
        action: "UPDATE",
        entity: "EnzymeConfiguration:entity-1",
        user: "Test User (testuser)",
        changes: 'name: "Old Name" → "New Name", active: true → false',
        ipAddress: "192.168.1.1",
      });
    });

    it("should handle missing user information", () => {
      const logWithoutUser = {
        ...mockAuditLog,
        user: {
          id: "user-1",
          username: "testuser",
          firstName: null,
          lastName: null,
        },
      };

      const result = service.formatAuditLog(logWithoutUser as AuditLogWithUser);

      expect(result.user).toBe("testuser");
    });

    it("should handle CREATE action", () => {
      const createLog = {
        ...mockAuditLog,
        action: AuditAction.CREATE,
        oldValues: null,
        newValues: { name: "New Entity", active: true },
      };

      const result = service.formatAuditLog(createLog as AuditLogWithUser);

      expect(result.changes).toBeUndefined();
    });

    it("should handle DELETE action", () => {
      const deleteLog = {
        ...mockAuditLog,
        action: AuditAction.DELETE,
        oldValues: { name: "Deleted Entity", active: true },
        newValues: null,
      };

      const result = service.formatAuditLog(deleteLog as AuditLogWithUser);

      expect(result.changes).toBeUndefined();
    });
  });
});
