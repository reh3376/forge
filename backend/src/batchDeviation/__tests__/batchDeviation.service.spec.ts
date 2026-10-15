import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import {
  EnumDeviationType,
  EnumDeviationSeverity,
  EnumDeviationStatus,
  EnumProductionPhase,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { MqttDomainPublisherService } from "../../mqttDomainPublisher/mqttDomainPublisher.service";
import { BatchDeviationService } from "../batchDeviation.service";

describe("BatchDeviationService", () => {
  let service: BatchDeviationService;
  let prisma: any;

  const mockClsService = {
    get: jest.fn().mockReturnValue("test-user-id"),
  };

  const mockPrismaService = {
    batchDeviation: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    mockClsService.get.mockReturnValue("test-user-id");

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchDeviationService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ClsService, useValue: mockClsService },
        {
          provide: MqttDomainPublisherService,
          useValue: { publishDomainEvent: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<BatchDeviationService>(BatchDeviationService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("calculateDeviationPercent", () => {
    it("should calculate percentage deviation", () => {
      expect(service.calculateDeviationPercent(100, 110)).toBeCloseTo(10);
      expect(service.calculateDeviationPercent(100, 90)).toBeCloseTo(10);
      expect(service.calculateDeviationPercent(155, 165)).toBeCloseTo(6.45, 1);
    });

    it("should return null if planned is null", () => {
      expect(service.calculateDeviationPercent(null, 100)).toBeNull();
    });

    it("should return null if actual is null", () => {
      expect(service.calculateDeviationPercent(100, null)).toBeNull();
    });

    it("should return null if planned is 0", () => {
      expect(service.calculateDeviationPercent(0, 100)).toBeNull();
    });
  });

  describe("determineSeverity", () => {
    it("should return Minor for ≤10% deviation", () => {
      expect(service.determineSeverity(5)).toBe(EnumDeviationSeverity.Minor);
      expect(service.determineSeverity(10)).toBe(EnumDeviationSeverity.Minor);
    });

    it("should return Major for 10-25% deviation", () => {
      expect(service.determineSeverity(11)).toBe(EnumDeviationSeverity.Major);
      expect(service.determineSeverity(25)).toBe(EnumDeviationSeverity.Major);
    });

    it("should return Critical for >25% deviation", () => {
      expect(service.determineSeverity(26)).toBe(
        EnumDeviationSeverity.Critical
      );
      expect(service.determineSeverity(50)).toBe(
        EnumDeviationSeverity.Critical
      );
    });
  });

  describe("recordDeviation", () => {
    it("should create a deviation with auto-calculated percent and severity", async () => {
      const input = {
        batchId: "batch-1",
        deviationType: EnumDeviationType.ParameterOutOfSpec,
        parameterName: "MashTemperature",
        plannedValue: 155,
        actualValue: 165,
        units: "°F",
        phase: EnumProductionPhase.Mashing,
        isAutoDetected: true,
        description: "Temperature deviation detected",
      };

      const mockDeviation = {
        id: "dev-1",
        ...input,
        deviationPercent: 6.45,
        severity: EnumDeviationSeverity.Minor,
        status: EnumDeviationStatus.Open,
        detectedBy: "test-user-id",
        createdBy: "test-user-id",
      };

      mockPrismaService.batchDeviation.create.mockResolvedValue(mockDeviation);

      const result = await service.recordDeviation(input);

      expect(result.id).toBe("dev-1");
      expect(mockPrismaService.batchDeviation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            batchId: "batch-1",
            deviationType: EnumDeviationType.ParameterOutOfSpec,
            detectedBy: "test-user-id",
            createdBy: "test-user-id",
          }),
        })
      );
    });

    it("should use provided severity if specified", async () => {
      const input = {
        batchId: "batch-1",
        deviationType: EnumDeviationType.EquipmentFailure,
        severity: EnumDeviationSeverity.Critical,
        description: "Motor failure on pump",
      };

      mockPrismaService.batchDeviation.create.mockResolvedValue({
        id: "dev-1",
        severity: EnumDeviationSeverity.Critical,
      });

      await service.recordDeviation(input);

      expect(mockPrismaService.batchDeviation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            severity: EnumDeviationSeverity.Critical,
          }),
        })
      );
    });
  });

  describe("autoDetectFromParameterActual", () => {
    it("should create deviation when value exceeds upper limit", async () => {
      const mockDeviation = {
        id: "dev-1",
        deviationType: EnumDeviationType.ParameterOutOfSpec,
      };

      mockPrismaService.batchDeviation.create.mockResolvedValue(mockDeviation);

      const result = await service.autoDetectFromParameterActual(
        "batch-1",
        "Temperature",
        155,
        170,
        160,
        150,
        "°F",
        "Mashing",
        0
      );

      expect(result).toBeDefined();
      expect(mockPrismaService.batchDeviation.create).toHaveBeenCalled();
    });

    it("should create deviation when value below lower limit", async () => {
      const mockDeviation = {
        id: "dev-1",
        deviationType: EnumDeviationType.ParameterOutOfSpec,
      };

      mockPrismaService.batchDeviation.create.mockResolvedValue(mockDeviation);

      const result = await service.autoDetectFromParameterActual(
        "batch-1",
        "Temperature",
        155,
        140,
        160,
        150,
        "°F"
      );

      expect(result).toBeDefined();
    });

    it("should return null when value is within limits", async () => {
      const result = await service.autoDetectFromParameterActual(
        "batch-1",
        "Temperature",
        155,
        155,
        160,
        150,
        "°F"
      );

      expect(result).toBeNull();
      expect(mockPrismaService.batchDeviation.create).not.toHaveBeenCalled();
    });

    it("should return null if planned or actual is null", async () => {
      const result = await service.autoDetectFromParameterActual(
        "batch-1",
        "Temperature",
        null,
        155,
        160,
        150,
        "°F"
      );

      expect(result).toBeNull();
    });
  });

  describe("startInvestigation", () => {
    it("should transition deviation to UnderInvestigation", async () => {
      const existingDeviation = {
        id: "dev-1",
        status: EnumDeviationStatus.Open,
      };
      const updatedDeviation = {
        ...existingDeviation,
        status: EnumDeviationStatus.UnderInvestigation,
        investigationStartedBy: "test-user-id",
      };

      mockPrismaService.batchDeviation.findUnique.mockResolvedValue(
        existingDeviation
      );
      mockPrismaService.batchDeviation.update.mockResolvedValue(
        updatedDeviation
      );

      const result = await service.startInvestigation("dev-1");

      expect(result.status).toBe(EnumDeviationStatus.UnderInvestigation);
      expect(mockPrismaService.batchDeviation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: EnumDeviationStatus.UnderInvestigation,
            investigationStartedBy: "test-user-id",
          }),
        })
      );
    });

    it("should throw NotFoundException if deviation not found", async () => {
      mockPrismaService.batchDeviation.findUnique.mockResolvedValue(null);

      await expect(service.startInvestigation("nonexistent")).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe("resolveDeviation", () => {
    it("should transition deviation to Resolved with corrective action", async () => {
      const existingDeviation = {
        id: "dev-1",
        status: EnumDeviationStatus.UnderInvestigation,
      };
      const updatedDeviation = {
        ...existingDeviation,
        status: EnumDeviationStatus.Resolved,
        correctiveAction: "Adjusted temperature controller",
      };

      mockPrismaService.batchDeviation.findUnique.mockResolvedValue(
        existingDeviation
      );
      mockPrismaService.batchDeviation.update.mockResolvedValue(
        updatedDeviation
      );

      const result = await service.resolveDeviation(
        "dev-1",
        "Adjusted temperature controller"
      );

      expect(result.status).toBe(EnumDeviationStatus.Resolved);
      expect(mockPrismaService.batchDeviation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: EnumDeviationStatus.Resolved,
            correctiveAction: "Adjusted temperature controller",
            resolvedBy: "test-user-id",
          }),
        })
      );
    });
  });

  describe("closeDeviation", () => {
    it("should transition deviation to Closed", async () => {
      const existingDeviation = {
        id: "dev-1",
        status: EnumDeviationStatus.Resolved,
      };
      const updatedDeviation = {
        ...existingDeviation,
        status: EnumDeviationStatus.Closed,
      };

      mockPrismaService.batchDeviation.findUnique.mockResolvedValue(
        existingDeviation
      );
      mockPrismaService.batchDeviation.update.mockResolvedValue(
        updatedDeviation
      );

      const result = await service.closeDeviation("dev-1");

      expect(result.status).toBe(EnumDeviationStatus.Closed);
      expect(mockPrismaService.batchDeviation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: EnumDeviationStatus.Closed,
            closedBy: "test-user-id",
          }),
        })
      );
    });
  });

  describe("getBatchDeviations", () => {
    it("should return deviations for a batch ordered by detectedAt", async () => {
      const mockDeviations = [
        { id: "dev-2", detectedAt: new Date() },
        { id: "dev-1", detectedAt: new Date(Date.now() - 3600000) },
      ];

      mockPrismaService.batchDeviation.findMany.mockResolvedValue(
        mockDeviations
      );

      const result = await service.getBatchDeviations("batch-1");

      expect(result).toEqual(mockDeviations);
      expect(mockPrismaService.batchDeviation.findMany).toHaveBeenCalledWith({
        where: { batchId: "batch-1" },
        orderBy: { detectedAt: "desc" },
      });
    });
  });

  describe("getOpenDeviations", () => {
    it("should return deviations with open statuses", async () => {
      const mockDeviations = [
        { id: "dev-1", status: EnumDeviationStatus.Open },
        {
          id: "dev-2",
          status: EnumDeviationStatus.UnderInvestigation,
        },
      ];

      mockPrismaService.batchDeviation.findMany.mockResolvedValue(
        mockDeviations
      );

      const result = await service.getOpenDeviations();

      expect(result).toEqual(mockDeviations);
      expect(mockPrismaService.batchDeviation.findMany).toHaveBeenCalledWith({
        where: {
          status: {
            in: [
              EnumDeviationStatus.Open,
              EnumDeviationStatus.UnderInvestigation,
              EnumDeviationStatus.PendingCorrectiveAction,
            ],
          },
        },
        orderBy: [{ severity: "desc" }, { detectedAt: "desc" }],
      });
    });
  });
});
