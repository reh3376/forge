import { Test, TestingModule } from "@nestjs/testing";
import { ScheduleOrderService } from "../scheduleOrder.service";
import { PrismaService } from "../../prisma/prisma.service";
import { RabbitMQProducerService } from "../../rabbitmq/rabbitmq.producer.service";
import { BomCalculationService } from "../../recipeBom/bom-calculation.service";
import { OrderValidationService } from "../../order-validation/order-validation.service";
import { AuditService } from "../../audit/audit.service";
import { MqttDomainPublisherService } from "../../mqttDomainPublisher/mqttDomainPublisher.service";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { BadRequestException } from "@nestjs/common";

describe("ScheduleOrderService - Load Management", () => {
  let service: ScheduleOrderService;
  let prismaService: jest.Mocked<PrismaService>;
  let bomCalculationService: jest.Mocked<BomCalculationService>;
  let rabbitProducerService: jest.Mocked<RabbitMQProducerService>;

  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  };

  const mockPrisma = {
    scheduleOrder: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockBomCalculationService = {
    recalculateOnLoadChange: jest.fn(),
  };

  const mockRabbitProducer = {
    emitMessage: jest.fn(),
  };

  const mockOrderValidationService = {
    validateScheduleOrderData: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduleOrderService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: BomCalculationService,
          useValue: mockBomCalculationService,
        },
        {
          provide: RabbitMQProducerService,
          useValue: mockRabbitProducer,
        },
        {
          provide: OrderValidationService,
          useValue: mockOrderValidationService,
        },
        {
          provide: WINSTON_MODULE_NEST_PROVIDER,
          useValue: mockLogger,
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
    prismaService = module.get(PrismaService);
    bomCalculationService = module.get(BomCalculationService);
    rabbitProducerService = module.get(RabbitMQProducerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("updateLoads", () => {
    const scheduleOrderId = "test-so-id";
    const userId = "test-user";

    const mockScheduleOrder = {
      id: scheduleOrderId,
      totalGrainWeight: 2000,
      totalWaterVolume: 160,
      scheduleOrderRecipe: {
        customerCode: "70-21-00-09",
      },
      scheduleOrderRecipeInstance: {
        id: "instance-id",
      },
    };

    const mockUpdatedScheduleOrder = {
      id: scheduleOrderId,
      totalGrainWeight: 3000,
      totalWaterVolume: 241,
      loadsLastUpdatedAt: new Date(),
      loadsLastUpdatedBy: userId,
      scheduleOrderRecipe: {
        customerCode: "70-21-00-09",
      },
      scheduleOrderRecipeInstance: {
        id: "instance-id",
      },
    };

    beforeEach(() => {
      mockPrisma.scheduleOrder.findUnique.mockResolvedValue(mockScheduleOrder);
      mockPrisma.scheduleOrder.update.mockResolvedValue(
        mockUpdatedScheduleOrder
      );
      mockBomCalculationService.recalculateOnLoadChange.mockResolvedValue(
        undefined
      );
      mockRabbitProducer.emitMessage.mockResolvedValue(undefined);
    });

    it("should update grain load successfully", async () => {
      const loads = { grainLoad: 3000 };

      const result = await service.updateLoads(scheduleOrderId, loads, userId);

      expect(mockPrisma.scheduleOrder.update).toHaveBeenCalledWith({
        where: { id: scheduleOrderId },
        data: {
          totalGrainWeight: 3000,
          totalWaterVolume: undefined,
          loadsLastUpdatedAt: expect.any(Date),
          loadsLastUpdatedBy: userId,
        },
        include: expect.any(Object),
      });

      expect(result).toEqual(mockUpdatedScheduleOrder);
    });

    it("should update water load successfully", async () => {
      const loads = { waterLoad: 241 };

      await service.updateLoads(scheduleOrderId, loads, userId);

      expect(mockPrisma.scheduleOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalWaterVolume: 241,
          }),
        })
      );
    });

    it("should update both grain and water loads", async () => {
      const loads = { grainLoad: 3000, waterLoad: 241 };

      await service.updateLoads(scheduleOrderId, loads, userId);

      expect(mockPrisma.scheduleOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalGrainWeight: 3000,
            totalWaterVolume: 241,
          }),
        })
      );
    });

    it("should trigger BOM recalculation after updating loads", async () => {
      const loads = { grainLoad: 3000, waterLoad: 241 };

      await service.updateLoads(scheduleOrderId, loads, userId);

      expect(
        mockBomCalculationService.recalculateOnLoadChange
      ).toHaveBeenCalledWith(scheduleOrderId, expect.objectContaining({
        grainLoad: 3000,
        waterLoad: 241,
        mashBill: "70-21-00-09",
      }));
    });

    it("should publish update message to RabbitMQ", async () => {
      const loads = { grainLoad: 3000 };

      await service.updateLoads(scheduleOrderId, loads, userId);

      expect(mockRabbitProducer.emitMessage).toHaveBeenCalledWith(
        expect.any(String), // topic
        expect.objectContaining({
          recordName: "ScheduleOrder",
          event_type: "update",
          data: mockUpdatedScheduleOrder,
        })
      );
    });

    it("should throw BadRequestException if schedule order not found", async () => {
      mockPrisma.scheduleOrder.findUnique.mockResolvedValue(null);

      const loads = { grainLoad: 3000 };

      await expect(
        service.updateLoads("invalid-id", loads, userId)
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.scheduleOrder.update).not.toHaveBeenCalled();
      expect(
        mockBomCalculationService.recalculateOnLoadChange
      ).not.toHaveBeenCalled();
    });

    it("should skip BOM recalculation if no recipe instance exists", async () => {
      const scheduleOrderWithoutInstance = {
        ...mockScheduleOrder,
        scheduleOrderRecipeInstance: null,
      };

      mockPrisma.scheduleOrder.findUnique.mockResolvedValue(
        scheduleOrderWithoutInstance
      );
      mockPrisma.scheduleOrder.update.mockResolvedValue({
        ...mockUpdatedScheduleOrder,
        scheduleOrderRecipeInstance: null,
      });

      const loads = { grainLoad: 3000 };

      await service.updateLoads(scheduleOrderId, loads, userId);

      expect(mockPrisma.scheduleOrder.update).toHaveBeenCalled();
      expect(
        mockBomCalculationService.recalculateOnLoadChange
      ).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("No recipe instance found")
      );
    });

    it("should use existing grain weight if not provided", async () => {
      const loads = { waterLoad: 241 };

      await service.updateLoads(scheduleOrderId, loads, userId);

      expect(
        mockBomCalculationService.recalculateOnLoadChange
      ).toHaveBeenCalledWith(
        scheduleOrderId,
        expect.objectContaining({
          grainLoad: mockUpdatedScheduleOrder.totalGrainWeight,
          waterLoad: 241,
        })
      );
    });

    it("should default to 0 if grain weight is missing", async () => {
      const scheduleOrderWithoutGrain = {
        ...mockScheduleOrder,
        totalGrainWeight: null,
      };

      mockPrisma.scheduleOrder.findUnique.mockResolvedValue(
        scheduleOrderWithoutGrain
      );
      mockPrisma.scheduleOrder.update.mockResolvedValue({
        ...mockUpdatedScheduleOrder,
        totalGrainWeight: null,
      });

      const loads = { waterLoad: 241 };

      await service.updateLoads(scheduleOrderId, loads, userId);

      expect(
        mockBomCalculationService.recalculateOnLoadChange
      ).toHaveBeenCalledWith(
        scheduleOrderId,
        expect.objectContaining({
          grainLoad: 0,
        })
      );
    });

    it("should log successful operations", async () => {
      const loads = { grainLoad: 3000, waterLoad: 241 };

      await service.updateLoads(scheduleOrderId, loads, userId);

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining("Updating loads for ScheduleOrder")
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining("Successfully recalculated BOM")
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining("Updated loads for ScheduleOrder")
      );
    });
  });
});
