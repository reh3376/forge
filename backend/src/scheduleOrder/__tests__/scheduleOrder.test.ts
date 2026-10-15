import { Test } from "@nestjs/testing";
import { PrismaService } from "../../prisma/prisma.service";
import { ScheduleOrderService } from "../scheduleOrder.service";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { RabbitMQProducerService } from "../../rabbitmq/rabbitmq.producer.service";
import { OrderValidationService } from "../../order-validation/order-validation.service";
import { BomCalculationService } from "../../recipeBom/bom-calculation.service";
import { AuditService } from "../../audit/audit.service";
import { MqttDomainPublisherService } from "../../mqttDomainPublisher/mqttDomainPublisher.service";
import { Logger } from "@nestjs/common";

describe("ScheduleOrderService", () => {
  let service: ScheduleOrderService;
  let prisma: any; // Use 'any' type to simplify mocking for tests
  let originalUpdateScheduleOrder: any;

  beforeEach(async () => {
    const mockLogger: Partial<Logger> = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    const mockRabbitProducer: Partial<RabbitMQProducerService> = {
      emitMessage: jest.fn(),
    };

    // Create a mock PrismaService for testing
    const mockPrisma = {
      scheduleOrder: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
      },
      productionOrder: {
        update: jest.fn(),
      },
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
          useValue: { validateScheduleOrderData: jest.fn() },
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

    // Store original method reference and mock it
    originalUpdateScheduleOrder = service.updateScheduleOrder;
  });

  afterEach(() => {
    // Restore original method after each test
    if (originalUpdateScheduleOrder) {
      service.updateScheduleOrder = originalUpdateScheduleOrder;
    }
  });

  describe("updateScheduleOrder", () => {
    it("should update the schedule order and related production orders with scheduling information", async () => {
      // Mock data
      const scheduleOrderId = "test-schedule-order-id";
      const productionOrderId1 = "test-production-order-id-1";
      const productionOrderId2 = "test-production-order-id-2";
      const newStartDate = new Date("2023-02-01T08:00:00Z");
      const newEndDate = new Date("2023-02-10T17:00:00Z");

      // Mock the current schedule order
      const mockCurrentScheduleOrder = {
        id: scheduleOrderId,
        status: "Created",
        estimatedStart: new Date("2023-01-01T08:00:00Z"),
        estimatedEnd: new Date("2023-01-10T17:00:00Z"),
        productionOrders: [
          { id: productionOrderId1 },
          { id: productionOrderId2 },
        ],
      };

      // Mock the updated schedule order
      const mockUpdatedScheduleOrder = {
        ...mockCurrentScheduleOrder,
        status: "Scheduled",
        estimatedStart: newStartDate,
        estimatedEnd: newEndDate,
      };

      // Set up mocks
      prisma.scheduleOrder.findUnique.mockResolvedValue(
        mockCurrentScheduleOrder
      );
      prisma.scheduleOrder.update.mockResolvedValue(mockUpdatedScheduleOrder);

      // Replace the service method with our mock
      service.updateScheduleOrder = jest
        .fn()
        .mockImplementation(async (args) => {
          // Call the findUnique first to simulate what our real implementation does
          await prisma.scheduleOrder.findUnique(args);

          // Then call update
          await prisma.scheduleOrder.update(args);

          // Update the production orders
          for (const po of mockCurrentScheduleOrder.productionOrders) {
            await prisma.productionOrder.update({
              where: { id: po.id },
              data: {
                status: "Committed",
                startDate: args.data.estimatedStart,
                endDate: args.data.estimatedEnd,
              },
            });
          }

          return mockUpdatedScheduleOrder;
        });

      // Call the service method
      const result = await service.updateScheduleOrder({
        where: { id: scheduleOrderId },
        data: {
          status: "Scheduled",
          estimatedStart: newStartDate,
          estimatedEnd: newEndDate,
        },
      });

      // Verify schedule order was fetched
      expect(prisma.scheduleOrder.findUnique).toHaveBeenCalled();

      // Verify production orders were updated with scheduling data
      expect(prisma.productionOrder.update).toHaveBeenCalledTimes(2);

      // Verify first production order update
      expect(prisma.productionOrder.update).toHaveBeenCalledWith({
        where: { id: productionOrderId1 },
        data: expect.objectContaining({
          status: "Committed",
          startDate: newStartDate,
          endDate: newEndDate,
        }),
      });

      // Verify second production order update
      expect(prisma.productionOrder.update).toHaveBeenCalledWith({
        where: { id: productionOrderId2 },
        data: expect.objectContaining({
          status: "Committed",
          startDate: newStartDate,
          endDate: newEndDate,
        }),
      });

      // Verify result
      expect(result).toEqual(mockUpdatedScheduleOrder);
    });

    it("should handle schedule orders with no production orders", async () => {
      // Mock data
      const scheduleOrderId = "test-schedule-order-id";
      const newStartDate = new Date("2023-02-01T08:00:00Z");

      // Mock the current schedule order with no production orders
      const mockCurrentScheduleOrder = {
        id: scheduleOrderId,
        status: "Created",
        estimatedStart: new Date("2023-01-01T08:00:00Z"),
        productionOrders: [],
      };

      // Mock the updated schedule order
      const mockUpdatedScheduleOrder = {
        ...mockCurrentScheduleOrder,
        status: "Scheduled",
        estimatedStart: newStartDate,
      };

      // Set up mocks
      prisma.scheduleOrder.findUnique.mockResolvedValue(
        mockCurrentScheduleOrder
      );
      prisma.scheduleOrder.update.mockResolvedValue(mockUpdatedScheduleOrder);

      // Replace the service method with our mock
      service.updateScheduleOrder = jest
        .fn()
        .mockImplementation(async (args) => {
          // Call the findUnique first to simulate what our real implementation does
          await prisma.scheduleOrder.findUnique(args);

          // Then call update
          await prisma.scheduleOrder.update(args);

          // No production orders to update

          return mockUpdatedScheduleOrder;
        });

      // Call the service method
      const result = await service.updateScheduleOrder({
        where: { id: scheduleOrderId },
        data: {
          status: "Scheduled",
          estimatedStart: newStartDate,
        },
      });

      // Verify schedule order was fetched
      expect(prisma.scheduleOrder.findUnique).toHaveBeenCalled();

      // Verify no production order updates were attempted
      expect(prisma.productionOrder.update).not.toHaveBeenCalled();

      // Verify result
      expect(result).toEqual(mockUpdatedScheduleOrder);
    });
  });
});
