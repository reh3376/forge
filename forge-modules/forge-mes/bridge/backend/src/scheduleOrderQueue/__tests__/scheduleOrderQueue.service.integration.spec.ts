import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "../../prisma/prisma.service";
import { ScheduleOrderQueueService } from "../scheduleOrderQueue.service";
import { ProductionOrderRecipeInstanceService } from "../../productionOrderRecipeInstance/productionOrderRecipeInstance.service";
import { ScheduleOrderRecipeInstanceService } from "../../scheduleOrderRecipeInstance/scheduleOrderRecipeInstance.service";
import { RabbitMQProducerService } from "../../rabbitmq/rabbitmq.producer.service";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";

describe("ScheduleOrderQueueService Integration", () => {
  let service: ScheduleOrderQueueService;
  let prismaService: PrismaService;
  let productionOrderRecipeInstanceService: ProductionOrderRecipeInstanceService;

  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  };

  const mockRabbitProducer = {
    emitMessage: jest.fn(),
  };

  const mockProductionOrderRecipeInstanceService = {
    createProductionOrderRecipeInstanceFromScheduleQueue: jest.fn(),
  };

  const mockPrismaService = {
    $transaction: jest.fn(),
    scheduleOrderQueue: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      aggregate: jest.fn(),
    },
    scheduleOrder: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduleOrderQueueService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ProductionOrderRecipeInstanceService,
          useValue: mockProductionOrderRecipeInstanceService,
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
          provide: ScheduleOrderRecipeInstanceService,
          useValue: {
            createFromScheduleOrder: jest.fn(),
            createFromScheduleOrderWithTransaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ScheduleOrderQueueService>(ScheduleOrderQueueService);
    prismaService = module.get<PrismaService>(PrismaService);
    productionOrderRecipeInstanceService =
      module.get<ProductionOrderRecipeInstanceService>(
        ProductionOrderRecipeInstanceService
      );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("setActiveScheduleOrderQueue", () => {
    it("should automatically create production order recipe instance when schedule order queue becomes active", async () => {
      const scheduleOrderQueueId = "test-queue-id";
      const scheduleOrderId = "test-schedule-order-id";
      const productionOrderId = "test-production-order-id";

      const mockScheduleOrderQueues = [
        { id: "queue-1", queueIndex: 1 },
        { id: scheduleOrderQueueId, queueIndex: 2 },
      ];

      const mockScheduleOrder = {
        id: scheduleOrderId,
      };

      const mockUpdatedScheduleOrderQueue = {
        id: scheduleOrderQueueId,
        queueIndex: 0,
      };

      const mockScheduleOrderWithProductionOrders = {
        id: scheduleOrderId,
        productionOrders: [
          {
            id: productionOrderId,
            name: "Test Production Order",
          },
        ],
      };

      const mockProductionOrderRecipeInstance = {
        id: "test-instance-id",
        productionOrderId,
        recipeId: "test-recipe-id",
      };

      // Mock the findMany call that happens outside the transaction
      mockPrismaService.scheduleOrderQueue.findMany.mockResolvedValue(
        mockScheduleOrderQueues
      );

      // Mock the transaction
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        // Create a mock prisma instance for the transaction
        const transactionPrisma = {
          scheduleOrderQueue: {
            update: jest.fn().mockResolvedValue({}),
            findUnique: jest
              .fn()
              .mockResolvedValue(mockUpdatedScheduleOrderQueue),
            findFirst: jest.fn().mockResolvedValue({
              id: scheduleOrderQueueId,
              queueIndex: 1,
              scheduleOrder: {
                id: scheduleOrderId,
                productionOrders: [
                  {
                    id: productionOrderId,
                    name: "Test Production Order",
                  },
                ],
              },
            }),
          },
          scheduleOrder: {
            findFirst: jest.fn().mockResolvedValue(mockScheduleOrder),
            update: jest.fn().mockResolvedValue({}),
            findUnique: jest
              .fn()
              .mockResolvedValue(mockScheduleOrderWithProductionOrders),
          },
        };

        return callback(transactionPrisma);
      });

      // Mock the production order recipe instance creation
      mockProductionOrderRecipeInstanceService.createProductionOrderRecipeInstanceFromScheduleQueue.mockResolvedValue(
        mockProductionOrderRecipeInstance
      );

      // Call the method
      const result = await service.setActiveScheduleOrderQueue({
        where: { id: scheduleOrderQueueId },
        data: { updatedBy: "System" },
      });

      // Verify the result
      expect(result).toEqual(mockUpdatedScheduleOrderQueue);

      // Verify that the production order recipe instance creation was called
      expect(
        mockProductionOrderRecipeInstanceService.createProductionOrderRecipeInstanceFromScheduleQueue
      ).toHaveBeenCalledWith(scheduleOrderQueueId, "System");

      // Verify logging
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining(`Automatically created production order recipe instance`)
      );
    });

    it("should handle case when no production orders exist", async () => {
      const scheduleOrderQueueId = "test-queue-id";
      const scheduleOrderId = "test-schedule-order-id";

      const mockScheduleOrderQueues = [
        { id: scheduleOrderQueueId, queueIndex: 1 },
      ];

      const mockScheduleOrder = {
        id: scheduleOrderId,
      };

      const mockUpdatedScheduleOrderQueue = {
        id: scheduleOrderQueueId,
        queueIndex: 0,
      };

      const mockScheduleOrderWithoutProductionOrders = {
        id: scheduleOrderId,
        productionOrders: [], // No production orders
      };

      // Mock the findMany call that happens outside the transaction
      mockPrismaService.scheduleOrderQueue.findMany.mockResolvedValue(
        mockScheduleOrderQueues
      );

      // Mock the transaction
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        // Create a mock prisma instance for the transaction
        const transactionPrisma = {
          scheduleOrderQueue: {
            update: jest.fn().mockResolvedValue({}),
            findUnique: jest
              .fn()
              .mockResolvedValue(mockUpdatedScheduleOrderQueue),
            findFirst: jest.fn().mockResolvedValue(null), // No queue item at position 1
          },
          scheduleOrder: {
            findFirst: jest.fn().mockResolvedValue(mockScheduleOrder),
            update: jest.fn().mockResolvedValue({}),
            findUnique: jest
              .fn()
              .mockResolvedValue(mockScheduleOrderWithoutProductionOrders),
          },
        };

        return callback(transactionPrisma);
      });

      // Call the method
      const result = await service.setActiveScheduleOrderQueue({
        where: { id: scheduleOrderQueueId },
        data: { updatedBy: "System" },
      });

      // Verify the result
      expect(result).toEqual(mockUpdatedScheduleOrderQueue);

      // Verify that the production order recipe instance creation was NOT called
      // (no queue item at position 1)
      expect(
        mockProductionOrderRecipeInstanceService.createProductionOrderRecipeInstanceFromScheduleQueue
      ).not.toHaveBeenCalled();
    });

    it("should handle errors in production order recipe instance creation gracefully", async () => {
      const scheduleOrderQueueId = "test-queue-id";
      const scheduleOrderId = "test-schedule-order-id";
      const productionOrderId = "test-production-order-id";

      const mockScheduleOrderQueues = [
        { id: scheduleOrderQueueId, queueIndex: 1 },
      ];

      const mockScheduleOrder = {
        id: scheduleOrderId,
      };

      const mockUpdatedScheduleOrderQueue = {
        id: scheduleOrderQueueId,
        queueIndex: 0,
      };

      const mockScheduleOrderWithProductionOrders = {
        id: scheduleOrderId,
        productionOrders: [
          {
            id: productionOrderId,
            name: "Test Production Order",
          },
        ],
      };

      // Mock the findMany call that happens outside the transaction
      mockPrismaService.scheduleOrderQueue.findMany.mockResolvedValue(
        mockScheduleOrderQueues
      );

      // Mock the transaction
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        // Create a mock prisma instance for the transaction
        const transactionPrisma = {
          scheduleOrderQueue: {
            update: jest.fn().mockResolvedValue({}),
            findUnique: jest
              .fn()
              .mockResolvedValue(mockUpdatedScheduleOrderQueue),
            findFirst: jest.fn().mockResolvedValue({
              id: scheduleOrderQueueId,
              queueIndex: 1,
              scheduleOrder: {
                id: scheduleOrderId,
                productionOrders: [
                  {
                    id: productionOrderId,
                    name: "Test Production Order",
                  },
                ],
              },
            }),
          },
          scheduleOrder: {
            findFirst: jest.fn().mockResolvedValue(mockScheduleOrder),
            update: jest.fn().mockResolvedValue({}),
            findUnique: jest
              .fn()
              .mockResolvedValue(mockScheduleOrderWithProductionOrders),
          },
        };

        return callback(transactionPrisma);
      });

      // Mock the production order recipe instance creation to throw an error
      const testError = new Error("Recipe not found");
      mockProductionOrderRecipeInstanceService.createProductionOrderRecipeInstanceFromScheduleQueue.mockRejectedValue(
        testError
      );

      // Call the method - it should not throw an error
      const result = await service.setActiveScheduleOrderQueue({
        where: { id: scheduleOrderQueueId },
        data: { updatedBy: "System" },
      });

      // Verify the result is still returned (main flow continues)
      expect(result).toEqual(mockUpdatedScheduleOrderQueue);

      // Verify that the production order recipe instance creation was called
      expect(
        mockProductionOrderRecipeInstanceService.createProductionOrderRecipeInstanceFromScheduleQueue
      ).toHaveBeenCalledWith(scheduleOrderQueueId, "System");

      // Verify error was logged but didn't break the main flow
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to automatically create production order recipe instance`)
      );
    });
  });
});
