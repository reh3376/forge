import { Test } from "@nestjs/testing";
import { PrismaService } from "../../prisma/prisma.service";
import { ScheduleOrderQueueService } from "../scheduleOrderQueue.service";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { RabbitMQProducerService } from "../../rabbitmq/rabbitmq.producer.service";
import { ProductionOrderRecipeInstanceService } from "../../productionOrderRecipeInstance/productionOrderRecipeInstance.service";
import { ScheduleOrderRecipeInstanceService } from "../../scheduleOrderRecipeInstance/scheduleOrderRecipeInstance.service";
import {
  EnumScheduleOrderStatus,
  Prisma,
  ProductionOrder,
} from "@prisma/client";
import { Logger } from "@nestjs/common";

describe("ScheduleOrderQueueService", () => {
  let service: ScheduleOrderQueueService;
  let prisma: any; // Use 'any' type to simplify mocking for tests

  beforeEach(async () => {
    const mockLogger: Partial<Logger> = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    const mockRabbitProducer: Partial<RabbitMQProducerService> = {
      emitMessage: jest.fn(),
    };

    const mockProductionOrderRecipeInstanceService: Partial<ProductionOrderRecipeInstanceService> =
      {
        createProductionOrderRecipeInstanceFromScheduleQueue: jest.fn(),
      };

    const mockScheduleOrderRecipeInstanceService: Partial<ScheduleOrderRecipeInstanceService> =
      {
        createFromScheduleOrder: jest.fn(),
        createFromScheduleOrderWithTransaction: jest.fn(),
      };

    // Create a mock PrismaService for testing
    const mockPrisma = {
      $transaction: jest
        .fn()
        .mockImplementation((callback) => callback(mockPrisma)),
      scheduleOrderQueue: {
        aggregate: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      scheduleOrder: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
      },
      productionOrder: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      asset: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        ScheduleOrderQueueService,
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
          provide: ProductionOrderRecipeInstanceService,
          useValue: mockProductionOrderRecipeInstanceService,
        },
        {
          provide: ScheduleOrderRecipeInstanceService,
          useValue: mockScheduleOrderRecipeInstanceService,
        },
      ],
    }).compile();

    service = module.get<ScheduleOrderQueueService>(ScheduleOrderQueueService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe("calculateScheduleOrderEstimates", () => {
    it("should calculate correct durations based on number of cooks", () => {
      // Create mock production orders with different cook counts (totalCooks now on Recipe)
      const singleCookOrder = { recipe: { totalCooks: 1 } } as any;
      const tripleCookOrder = { recipe: { totalCooks: 3 } } as any;
      const noCookOrder = { recipe: { totalCooks: null } } as any;

      // Test with single cook
      const singleResult =
        service.calculateScheduleOrderEstimates(singleCookOrder);
      expect(singleResult.mashingDuration).toBe(2); // 2 hours per cook
      expect(singleResult.fermentationDuration).toBe(74); // 72 + 2 hours mashing
      expect(singleResult.distillationDuration).toBe(74); // Same as fermentation
      expect(singleResult.totalDuration).toBe(74); // Total is fermentation duration

      // Test with multiple cooks
      const tripleResult =
        service.calculateScheduleOrderEstimates(tripleCookOrder);
      expect(tripleResult.mashingDuration).toBe(6); // 3 cooks * 2 hours
      expect(tripleResult.fermentationDuration).toBe(78); // 72 + 6 hours mashing
      expect(tripleResult.distillationDuration).toBe(78); // Same as fermentation
      expect(tripleResult.totalDuration).toBe(78); // Total is fermentation duration

      // Test with null cooks (should default to 1)
      const nullResult = service.calculateScheduleOrderEstimates(noCookOrder);
      expect(nullResult.mashingDuration).toBe(2); // Default to 1 cook * 2 hours
      expect(nullResult.totalDuration).toBe(74); // 72 + 2 hours mashing
    });

    it("should calculate correct timestamps with provided start date", () => {
      const productionOrder = { recipe: { totalCooks: 2 } } as any;
      const startDate = new Date("2023-05-10T08:00:00Z");

      const result = service.calculateScheduleOrderEstimates(
        productionOrder,
        startDate
      );

      // Validate all timestamps
      // Mashing starts at start date
      expect(result.mashingStartTime?.toISOString()).toBe(
        startDate.toISOString()
      );

      // Fermentation starts after first cook (2 hours after start)
      const expectedFermStart = new Date(startDate);
      expectedFermStart.setHours(expectedFermStart.getHours() + 2);
      expect(result.fermentationStartTime?.toISOString()).toBe(
        expectedFermStart.toISOString()
      );

      // Fermentation ends after fermentation duration (76 hours total)
      const expectedFermEnd = new Date(expectedFermStart);
      expectedFermEnd.setHours(expectedFermEnd.getHours() + 76);
      expect(result.fermentationEndTime?.toISOString()).toBe(
        expectedFermEnd.toISOString()
      );

      // Distillation starts after fermentation ends
      expect(result.distillationStartTime?.toISOString()).toBe(
        expectedFermEnd.toISOString()
      );

      // Distillation ends after distillation duration (76 hours)
      const expectedDistillationEnd = new Date(expectedFermEnd);
      expectedDistillationEnd.setHours(expectedDistillationEnd.getHours() + 76);
      expect(result.distillationEndTime?.toISOString()).toBe(
        expectedDistillationEnd.toISOString()
      );

      // Barreling starts after distillation ends
      expect(result.barrelingStartTime?.toISOString()).toBe(
        expectedDistillationEnd.toISOString()
      );
    });

    it("should handle undefined start date", () => {
      const productionOrder = { recipe: { totalCooks: 2 } } as any;

      const result = service.calculateScheduleOrderEstimates(productionOrder);

      // Only durations should be calculated, all timestamps should be undefined
      expect(result.mashingDuration).toBe(4);
      expect(result.fermentationDuration).toBe(76); // 72 + 4 hours mashing
      expect(result.distillationDuration).toBe(76);
      expect(result.totalDuration).toBe(76);

      expect(result.mashingStartTime).toBeUndefined();
      expect(result.fermentationStartTime).toBeUndefined();
      expect(result.fermentationEndTime).toBeUndefined();
      expect(result.distillationStartTime).toBeUndefined();
      expect(result.distillationEndTime).toBeUndefined();
      expect(result.barrelingStartTime).toBeUndefined();
    });
  });

  describe("createAndQueueScheduleOrder", () => {
    it("should create a schedule order and queue with all scheduling fields", async () => {
      // Mock data
      const productionOrderId = "test-production-order-id";
      const scheduleOrderId = "test-schedule-order-id";
      const queueId = "test-queue-id";
      const createdBy = "test-user";
      const startDate = new Date("2023-01-01T08:00:00Z");
      const endDate = new Date("2023-01-10T17:00:00Z");

      // Mock the production order with recipe and estimation values
      const mockProductionOrder = {
        id: productionOrderId,
        plannedCooks: 2,
        quantity: 120, // Total barrels
        estimatedBarrelsPerFermenter: 30,
        estimatedPGsPerBushel: 4.5,
        estimatedPGsPerBbl: 53,
        recipe: {
          totalCooks: 2, // Service reads totalCooks from recipe, not plannedCooks from PO
          Recipe: "Test Recipe",
          recipeGroup: {
            id: "test-recipe-group-id",
          },
        },
      };

      // Mock the schedule order
      const mockScheduleOrder = {
        id: scheduleOrderId,
        status: "Scheduled",
      };

      // Mock the queue
      const mockQueue = {
        id: queueId,
        scheduleOrder: mockScheduleOrder,
        queueIndex: 0,
      };

      // Set up mocks
      prisma.productionOrder.findUnique.mockResolvedValue(mockProductionOrder);
      prisma.productionOrder.update.mockResolvedValue(mockProductionOrder);
      prisma.scheduleOrder.create.mockResolvedValue(mockScheduleOrder);
      prisma.scheduleOrder.count.mockResolvedValue(0); // No existing orders today
      prisma.scheduleOrderQueue.findFirst.mockResolvedValue(null); // No existing queue items
      prisma.scheduleOrderQueue.create.mockResolvedValue(mockQueue);

      // Call the service method with updated signature
      const result = await service.createAndQueueScheduleOrder(
        productionOrderId,
        createdBy,
        startDate,
        endDate
      );

      // Verify production order was found
      expect(prisma.productionOrder.findUnique).toHaveBeenCalledWith({
        where: { id: productionOrderId },
        include: { recipe: { include: { recipeGroup: true } } },
      });

      // Verify production order was updated with scheduling data
      expect(prisma.productionOrder.update).toHaveBeenCalledWith({
        where: { id: productionOrderId },
        data: expect.objectContaining({
          scheduled: true,
          status: "Committed",
          startDate,
          endDate,
        }),
      });

      // Verify schedule order was created with comprehensive data
      // Note: totalProofGallons is undefined because pgsPerBbl is hardcoded to undefined in the service
      // (the TODO comment notes these fields moved from ProductionOrder to ScheduleOrder)
      expect(prisma.scheduleOrder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: "Scheduled",
          productionOrders: { connect: { id: productionOrderId } },
          estimatedStart: startDate,
          estimatedEnd: endDate,
          // Expected values based on 2 cooks (totalCooks from recipe)
          estimatedMashingDuration: 4, // 2 cooks * 2 hours
          estimatedFermentationDuration: 76, // 72 + 4 hours mashing
          estimatedDistillationDuration: 76,
          estimatedTotalProductionDuration: 76,
          durationUnits: "Hours",
          totalBarrels: 120,
          // Additional fields produced by the service
          duration: 76, // Same as totalDuration
          recipeName: "Test Recipe",
          productionOrderAllocation: 120, // Set to totalBarrels
          recipeGroup: { connect: { id: "test-recipe-group-id" } },
          createdBy: createdBy,
        }),
      });

      // Verify queue was created
      expect(prisma.scheduleOrderQueue.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          scheduleOrder: { connect: { id: scheduleOrderId } },
          queueIndex: 0,
          createdBy: createdBy,
        }),
        include: {
          scheduleOrder: true,
          areas: true,
        },
      });

      // Verify result
      expect(result).toEqual(mockQueue);
    });
  });
});
