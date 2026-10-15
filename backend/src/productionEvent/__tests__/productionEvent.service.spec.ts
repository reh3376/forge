import { Test, TestingModule } from "@nestjs/testing";
import { ClsService } from "nestjs-cls";
import {
  EnumProductionEventType,
  EnumProductionEventCategory,
  EnumEventSeverity,
  EnumProductionPhase,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ProductionEventService } from "../productionEvent.service";
import { MqttDomainPublisherService } from "../../mqttDomainPublisher/mqttDomainPublisher.service";

describe("ProductionEventService", () => {
  let service: ProductionEventService;
  let prisma: any;

  const mockClsService = {
    get: jest.fn().mockReturnValue("test-user-id"),
  };

  const mockPrismaService = {
    productionEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    mockClsService.get.mockReturnValue("test-user-id");

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductionEventService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ClsService, useValue: mockClsService },
        {
          provide: MqttDomainPublisherService,
          useValue: { publishDomainEvent: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ProductionEventService>(ProductionEventService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("logEvent", () => {
    it("should create a production event in the database", async () => {
      const input = {
        batchId: "batch-1",
        eventType: EnumProductionEventType.StepStarted,
        eventCategory: EnumProductionEventCategory.StateChange,
        title: "Step Started: Mash In",
        phase: EnumProductionPhase.Mashing,
        stepIndex: 0,
      };
      const mockEvent = {
        id: "event-1",
        ...input,
        severity: EnumEventSeverity.Info,
        createdBy: "test-user-id",
        occurredAt: new Date(),
      };

      mockPrismaService.productionEvent.create.mockResolvedValue(mockEvent);

      const result = await service.logEvent(input);

      expect(result.id).toBe("event-1");
      expect(mockPrismaService.productionEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            batchId: "batch-1",
            eventType: EnumProductionEventType.StepStarted,
            eventCategory: EnumProductionEventCategory.StateChange,
            title: "Step Started: Mash In",
            severity: EnumEventSeverity.Info,
            createdBy: "test-user-id",
          }),
        })
      );
    });

    it("should use provided severity instead of default", async () => {
      const input = {
        batchId: "batch-1",
        eventType: EnumProductionEventType.AlarmRaised,
        eventCategory: EnumProductionEventCategory.Alarm,
        severity: EnumEventSeverity.Critical,
        title: "High Temperature Alarm",
      };

      mockPrismaService.productionEvent.create.mockResolvedValue({
        id: "event-1",
        ...input,
      });

      await service.logEvent(input);

      expect(mockPrismaService.productionEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            severity: EnumEventSeverity.Critical,
          }),
        })
      );
    });

    it("should use current user as initiatedBy if not provided", async () => {
      const input = {
        batchId: "batch-1",
        eventType: EnumProductionEventType.OperatorAction,
        eventCategory: EnumProductionEventCategory.OperatorAction,
        title: "Manual Override",
      };

      mockPrismaService.productionEvent.create.mockResolvedValue({
        id: "event-1",
        ...input,
      });

      await service.logEvent(input);

      expect(mockPrismaService.productionEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            initiatedBy: "test-user-id",
            createdBy: "test-user-id",
          }),
        })
      );
    });
  });

  describe("logPhaseStarted", () => {
    it("should log a PhaseStarted event", async () => {
      mockPrismaService.productionEvent.create.mockResolvedValue({
        id: "event-1",
      });

      await service.logPhaseStarted("batch-1", "Mashing", {
        instanceId: "inst-1",
      });

      expect(mockPrismaService.productionEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            batchId: "batch-1",
            eventType: EnumProductionEventType.PhaseStarted,
            eventCategory: EnumProductionEventCategory.StateChange,
            title: "Phase Started: Mashing",
          }),
        })
      );
    });
  });

  describe("logPhaseCompleted", () => {
    it("should log a PhaseCompleted event", async () => {
      mockPrismaService.productionEvent.create.mockResolvedValue({
        id: "event-1",
      });

      await service.logPhaseCompleted("batch-1", "Mashing");

      expect(mockPrismaService.productionEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: EnumProductionEventType.PhaseCompleted,
            title: "Phase Completed: Mashing",
          }),
        })
      );
    });
  });

  describe("logMaterialConsumed", () => {
    it("should log a MaterialConsumed event with lot info", async () => {
      mockPrismaService.productionEvent.create.mockResolvedValue({
        id: "event-1",
      });

      await service.logMaterialConsumed(
        "batch-1",
        "Corn",
        500,
        "lbs",
        "LOT-001",
        "Mashing",
        { recipeBomItemId: "bom-1" }
      );

      expect(mockPrismaService.productionEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            batchId: "batch-1",
            eventType: EnumProductionEventType.MaterialConsumed,
            eventCategory: EnumProductionEventCategory.MaterialTracking,
            title: "Material Consumed: Corn",
            units: "lbs",
            newValue: 500,
          }),
        })
      );
    });
  });

  describe("getEventsByBatch", () => {
    it("should return events for a batch", async () => {
      const mockEvents = [
        {
          id: "event-1",
          eventType: EnumProductionEventType.StepStarted,
        },
        {
          id: "event-2",
          eventType: EnumProductionEventType.StepCompleted,
        },
      ];

      mockPrismaService.productionEvent.findMany.mockResolvedValue(mockEvents);

      const result = await service.getEventsByBatch("batch-1");

      expect(result).toEqual(mockEvents);
      expect(mockPrismaService.productionEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { batchId: "batch-1" },
          orderBy: { occurredAt: "asc" },
        })
      );
    });

    it("should apply filters when provided", async () => {
      mockPrismaService.productionEvent.findMany.mockResolvedValue([]);

      await service.getEventsByBatch("batch-1", {
        eventType: EnumProductionEventType.StepStarted,
        eventCategory: EnumProductionEventCategory.StateChange,
        severity: EnumEventSeverity.Info,
      });

      expect(mockPrismaService.productionEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            batchId: "batch-1",
            eventType: EnumProductionEventType.StepStarted,
            eventCategory: EnumProductionEventCategory.StateChange,
            severity: EnumEventSeverity.Info,
          },
        })
      );
    });
  });

  describe("getBatchTimeline", () => {
    it("should return all events ordered by occurredAt", async () => {
      const mockEvents = [{ id: "event-1" }, { id: "event-2" }];
      mockPrismaService.productionEvent.findMany.mockResolvedValue(mockEvents);

      const result = await service.getBatchTimeline("batch-1");

      expect(result).toEqual(mockEvents);
      expect(mockPrismaService.productionEvent.findMany).toHaveBeenCalledWith({
        where: { batchId: "batch-1" },
        orderBy: { occurredAt: "asc" },
      });
    });
  });
});
