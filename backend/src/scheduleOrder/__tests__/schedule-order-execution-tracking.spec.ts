import { Test } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { PrismaService } from "../../prisma/prisma.service";
import { ScheduleOrderService } from "../scheduleOrder.service";
import { RabbitMQProducerService } from "../../rabbitmq/rabbitmq.producer.service";
import { OrderValidationService } from "../../order-validation/order-validation.service";
import { BomCalculationService } from "../../recipeBom/bom-calculation.service";
import { AuditService } from "../../audit/audit.service";
import { MqttDomainPublisherService } from "../../mqttDomainPublisher/mqttDomainPublisher.service";

describe("ScheduleOrderService - Production Execution Tracking", () => {
  let service: ScheduleOrderService;
  let prisma: any;
  let rabbitProducer: any;

  beforeEach(async () => {
    const mockPrisma = {
      scheduleOrder: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      scheduleOrderQueue: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };

    const mockRabbitProducer = {
      emitMessage: jest.fn(),
    };

    const mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    const mockOrderValidationService = {
      validateScheduleOrder: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        ScheduleOrderService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: RabbitMQProducerService,
          useValue: mockRabbitProducer,
        },
        {
          provide: WINSTON_MODULE_NEST_PROVIDER,
          useValue: mockLogger,
        },
        {
          provide: OrderValidationService,
          useValue: mockOrderValidationService,
        },
        {
          provide: BomCalculationService,
          useValue: { recalculateOnLoadChange: jest.fn() },
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn() },
        },
        {
          provide: MqttDomainPublisherService,
          useValue: { publishDomainEvent: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ScheduleOrderService>(ScheduleOrderService);
    prisma = module.get<PrismaService>(PrismaService);
    rabbitProducer = module.get<RabbitMQProducerService>(
      RabbitMQProducerService
    );
  });

  describe("updateProductionExecution", () => {
    const mockScheduleOrder = {
      id: "schedule-1",
      name: "Test Schedule Order",
      productionOrders: [
        { id: "po-1", name: "Production Order 1" },
        { id: "po-2", name: "Production Order 2" },
      ],
    };

    const mockUpdatedScheduleOrder = {
      ...mockScheduleOrder,
      executedCooks: 3,
      executedFermenters: 1,
      completedCooks: 3,
      completedFermenters: 1,
    };

    it("should update production execution tracking fields", async () => {
      prisma.scheduleOrder.findUnique.mockResolvedValue(mockScheduleOrder);
      prisma.scheduleOrder.update.mockResolvedValue(mockUpdatedScheduleOrder);

      const executionData = {
        executedCooks: 3,
        executedFermenters: 1,
        completedCooks: 3,
        completedFermenters: 1,
      };

      const result = await service.updateProductionExecution(
        "schedule-1",
        executionData
      );

      expect(result).toEqual(mockUpdatedScheduleOrder);
      expect(prisma.scheduleOrder.update).toHaveBeenCalledWith({
        where: { id: "schedule-1" },
        data: {
          executedCooks: 3,
          executedFermenters: 1,
          completedCooks: 3,
          completedFermenters: 1,
          actualStart: undefined,
          actualEnd: undefined,
        },
        include: {
          recipeGroup: true,
          productionOrders: true,
        },
      });
    });

    it("should emit rabbit message for execution update", async () => {
      prisma.scheduleOrder.findUnique.mockResolvedValue(mockScheduleOrder);
      prisma.scheduleOrder.update.mockResolvedValue(mockUpdatedScheduleOrder);

      const executionData = {
        executedCooks: 3,
        executedFermenters: 1,
      };

      await service.updateProductionExecution("schedule-1", executionData);

      expect(rabbitProducer.emitMessage).toHaveBeenCalledWith(
        expect.any(String),
        {
          recordName: "ScheduleOrder",
          event_type: "execution_update",
          data: {
            scheduleOrderId: "schedule-1",
            executionData,
            productionOrders: 2,
          },
        }
      );
    });

    it("should throw error when schedule order not found", async () => {
      prisma.scheduleOrder.findUnique.mockResolvedValue(null);

      await expect(
        service.updateProductionExecution("non-existent", { executedCooks: 1 })
      ).rejects.toThrow(BadRequestException);
    });

    it("should handle actual start and end dates", async () => {
      prisma.scheduleOrder.findUnique.mockResolvedValue(mockScheduleOrder);
      prisma.scheduleOrder.update.mockResolvedValue(mockUpdatedScheduleOrder);

      const actualStart = new Date();
      const actualEnd = new Date();

      await service.updateProductionExecution("schedule-1", {
        actualStart,
        actualEnd,
      });

      expect(prisma.scheduleOrder.update).toHaveBeenCalledWith({
        where: { id: "schedule-1" },
        data: {
          executedCooks: undefined,
          executedFermenters: undefined,
          completedCooks: undefined,
          completedFermenters: undefined,
          actualStart,
          actualEnd,
        },
        include: {
          recipeGroup: true,
          productionOrders: true,
        },
      });
    });
  });

  describe("recordCookExecution", () => {
    const mockScheduleOrder = {
      executedCooks: 2,
      completedCooks: 1,
      totalCooks: 10,
    };

    it("should increment cook execution counts", async () => {
      prisma.scheduleOrder.findUnique.mockResolvedValue(mockScheduleOrder);

      // Mock the updateProductionExecution method
      jest
        .spyOn(service, "updateProductionExecution")
        .mockResolvedValue({} as any);

      await service.recordCookExecution("schedule-1", 2);

      expect(service.updateProductionExecution).toHaveBeenCalledWith(
        "schedule-1",
        {
          executedCooks: 4, // 2 + 2
          completedCooks: 4, // Math.max(4, 1)
        }
      );
    });

    it("should handle zero previous values", async () => {
      const scheduleOrderWithZeroCooks = {
        executedCooks: null,
        completedCooks: null,
        totalCooks: 10,
      };

      prisma.scheduleOrder.findUnique.mockResolvedValue(
        scheduleOrderWithZeroCooks
      );
      jest
        .spyOn(service, "updateProductionExecution")
        .mockResolvedValue({} as any);

      await service.recordCookExecution("schedule-1", 3);

      expect(service.updateProductionExecution).toHaveBeenCalledWith(
        "schedule-1",
        {
          executedCooks: 3, // 0 + 3
          completedCooks: 3, // Math.max(3, 0)
        }
      );
    });

    it("should throw error when schedule order not found", async () => {
      prisma.scheduleOrder.findUnique.mockResolvedValue(null);

      await expect(
        service.recordCookExecution("non-existent", 1)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("recordFermenterExecution", () => {
    const mockScheduleOrder = {
      executedFermenters: 1,
      completedFermenters: 0,
      totalFermenters: 5,
    };

    it("should increment fermenter execution counts", async () => {
      prisma.scheduleOrder.findUnique.mockResolvedValue(mockScheduleOrder);
      jest
        .spyOn(service, "updateProductionExecution")
        .mockResolvedValue({} as any);

      await service.recordFermenterExecution("schedule-1", 1);

      expect(service.updateProductionExecution).toHaveBeenCalledWith(
        "schedule-1",
        {
          executedFermenters: 2, // 1 + 1
          completedFermenters: 2, // Math.max(2, 0)
        }
      );
    });

    it("should maintain completed count when higher than executed", async () => {
      const scheduleOrderWithHigherCompleted = {
        executedFermenters: 1,
        completedFermenters: 3,
        totalFermenters: 5,
      };

      prisma.scheduleOrder.findUnique.mockResolvedValue(
        scheduleOrderWithHigherCompleted
      );
      jest
        .spyOn(service, "updateProductionExecution")
        .mockResolvedValue({} as any);

      await service.recordFermenterExecution("schedule-1", 1);

      expect(service.updateProductionExecution).toHaveBeenCalledWith(
        "schedule-1",
        {
          executedFermenters: 2, // 1 + 1
          completedFermenters: 3, // Math.max(2, 3) = 3
        }
      );
    });
  });

  describe("getProductionExecutionStatus", () => {
    const mockScheduleOrderWithExecution = {
      id: "schedule-1",
      totalCooks: 10,
      executedCooks: 6,
      completedCooks: 4,
      totalFermenters: 3,
      executedFermenters: 2,
      completedFermenters: 1,
      productionOrders: [{ id: "po-1" }, { id: "po-2" }, { id: "po-3" }],
    };

    it("should calculate progress percentages correctly", async () => {
      prisma.scheduleOrder.findUnique.mockResolvedValue(
        mockScheduleOrderWithExecution
      );

      const result = await service.getProductionExecutionStatus("schedule-1");

      expect(result).toEqual({
        scheduleOrderId: "schedule-1",
        totalCooks: 10,
        executedCooks: 6,
        completedCooks: 4,
        totalFermenters: 3,
        executedFermenters: 2,
        completedFermenters: 1,
        cookProgress: 40, // (4/10) * 100 = 40%
        fermenterProgress: 33, // (1/3) * 100 = 33.33% -> 33%
        overallProgress: 37, // (40 + 33) / 2 = 36.5% -> 37%
        productionOrderCount: 3,
      });
    });

    it("should handle null values gracefully", async () => {
      const scheduleOrderWithNulls = {
        id: "schedule-1",
        totalCooks: null,
        executedCooks: null,
        completedCooks: null,
        totalFermenters: null,
        executedFermenters: null,
        completedFermenters: null,
        productionOrders: [],
      };

      prisma.scheduleOrder.findUnique.mockResolvedValue(scheduleOrderWithNulls);

      const result = await service.getProductionExecutionStatus("schedule-1");

      expect(result).toEqual({
        scheduleOrderId: "schedule-1",
        totalCooks: 0,
        executedCooks: 0,
        completedCooks: 0,
        totalFermenters: 0,
        executedFermenters: 0,
        completedFermenters: 0,
        cookProgress: 0,
        fermenterProgress: 0,
        overallProgress: 0,
        productionOrderCount: 0,
      });
    });

    it("should throw error when schedule order not found", async () => {
      prisma.scheduleOrder.findUnique.mockResolvedValue(null);

      await expect(
        service.getProductionExecutionStatus("non-existent")
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("createScheduleOrderQueue", () => {
    it("should create queue entry with auto-incremented index", async () => {
      const mockExistingQueue = { queueIndex: 5 };
      const mockCreatedQueue = {
        id: "queue-1",
        queueIndex: 6,
        scheduleOrder: { id: "schedule-1" },
        areas: [],
      };

      prisma.scheduleOrderQueue.findFirst.mockResolvedValue(mockExistingQueue);
      prisma.scheduleOrderQueue.create.mockResolvedValue(mockCreatedQueue);

      const result = await service.createScheduleOrderQueue("schedule-1");

      expect(result).toEqual(mockCreatedQueue);
      expect(prisma.scheduleOrderQueue.create).toHaveBeenCalledWith({
        data: {
          scheduleOrder: { connect: { id: "schedule-1" } },
          queueIndex: 6,
          createdBy: "system",
        },
        include: {
          scheduleOrder: true,
          areas: true,
        },
      });
    });

    it("should handle first queue entry (no existing entries)", async () => {
      prisma.scheduleOrderQueue.findFirst.mockResolvedValue(null);
      prisma.scheduleOrderQueue.create.mockResolvedValue({
        id: "queue-1",
        queueIndex: 1,
      });

      await service.createScheduleOrderQueue("schedule-1");

      expect(prisma.scheduleOrderQueue.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            queueIndex: 1,
          }),
        })
      );
    });

    it("should connect areas when provided", async () => {
      prisma.scheduleOrderQueue.findFirst.mockResolvedValue(null);
      prisma.scheduleOrderQueue.create.mockResolvedValue({
        id: "queue-1",
        areas: [{ id: "area-1" }, { id: "area-2" }],
      });

      await service.createScheduleOrderQueue("schedule-1", [
        "area-1",
        "area-2",
      ]);

      expect(prisma.scheduleOrderQueue.create).toHaveBeenCalledWith({
        data: {
          scheduleOrder: { connect: { id: "schedule-1" } },
          queueIndex: 1,
          createdBy: "system",
          areas: {
            connect: [{ id: "area-1" }, { id: "area-2" }],
          },
        },
        include: {
          scheduleOrder: true,
          areas: true,
        },
      });
    });
  });
});
