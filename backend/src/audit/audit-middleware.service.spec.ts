import { Test, TestingModule } from "@nestjs/testing";
import { ClsService } from "nestjs-cls";
import { AuditMiddlewareService } from "./audit-middleware.service";
import { AuditService } from "./audit.service";
import { PrismaService } from "../prisma/prisma.service";

describe("AuditMiddlewareService", () => {
  let service: AuditMiddlewareService;
  let auditService: AuditService;
  let prismaService: PrismaService;
  let clsService: ClsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditMiddlewareService,
        {
          provide: AuditService,
          useValue: {
            logChange: jest.fn(),
            extractChanges: jest.fn().mockReturnValue({
              oldValues: { name: "old" },
              newValues: { name: "new" },
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            $use: jest.fn(),
          },
        },
        {
          provide: ClsService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuditMiddlewareService>(AuditMiddlewareService);
    auditService = module.get<AuditService>(AuditService);
    prismaService = module.get<PrismaService>(PrismaService);
    clsService = module.get<ClsService>(ClsService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should set audit context correctly", () => {
    const context = {
      userId: "user123",
      ipAddress: "192.168.1.1",
      userAgent: "Mozilla/5.0",
    };

    service.setAuditContext(context);

    expect(clsService.set).toHaveBeenCalledWith("userId", "user123");
    expect(clsService.set).toHaveBeenCalledWith("ipAddress", "192.168.1.1");
    expect(clsService.set).toHaveBeenCalledWith("userAgent", "Mozilla/5.0");
  });

  it("should clear audit context correctly", () => {
    service.clearAuditContext();

    expect(clsService.set).toHaveBeenCalledWith("userId", undefined);
    expect(clsService.set).toHaveBeenCalledWith("ipAddress", undefined);
    expect(clsService.set).toHaveBeenCalledWith("userAgent", undefined);
  });

  it("should initialize Prisma middleware on module init", async () => {
    await service.onModuleInit();

    expect(prismaService.$use).toHaveBeenCalled();
  });
});
