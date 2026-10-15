import { Test } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { EnumProductionOrderContainerType } from "@prisma/client";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { ProductionOrderService } from "../productionOrder.service";
import { ProductionOrderServiceBase } from "../base/productionOrder.service.base";
import { PrismaService } from "../../prisma/prisma.service";
import { OrderValidationService } from "../../order-validation/order-validation.service";
import { ContainerItemService } from "../container-item.service";
import { RabbitMQProducerService } from "../../rabbitmq/rabbitmq.producer.service";
import { ScheduleOrderGroupingService } from "../../scheduleOrder/schedule-order-grouping.service";
import { ScheduleOrderService } from "../../scheduleOrder/scheduleOrder.service";
import { MqttDomainPublisherService } from "../../mqttDomainPublisher/mqttDomainPublisher.service";

// Mock the base service
jest.mock("../base/productionOrder.service.base");

describe("ProductionOrderService", () => {
  let service: ProductionOrderService;
  let prisma: any;
  let orderValidationService: any;
  let containerItemService: any;
  let scheduleOrderGroupingService: any;
  let scheduleOrderService: any;

  beforeEach(async () => {
    const mockPrisma = {
      $transaction: jest.fn().mockImplementation((callback) => {
        if (typeof callback === "function") {
          return callback(mockPrisma);
        }
        return Promise.resolve(callback);
      }),
      productionOrder: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      item: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      recipe: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      customer: {
        findFirst: jest.fn(),
      },
      units: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      bom: {
        create: jest.fn(),
        findFirst: jest.fn(),
      },
      bomItem: {
        create: jest.fn(),
      },
      recipeBom: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      recipeBomItem: {
        createMany: jest.fn(),
      },
      recipeGroup: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      scheduleOrder: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      scheduleOrderQueue: {
        create: jest.fn(),
        findFirst: jest.fn(),
        aggregate: jest.fn(),
      },
      unitProcedure: {
        findFirst: jest.fn(),
      },
    };

    const mockOrderValidationService = {
      validateProductionOrder: jest.fn(),
      validateScheduleOrder: jest.fn(),
    };

    const mockContainerItemService = {
      validateContainerItemCompatibility: jest
        .fn()
        .mockResolvedValue({ isValid: true }),
      getContainerItemsByType: jest.fn(),
    };

    const mockRabbitMQProducerService = {
      emitMessage: jest.fn(),
    };

    const mockScheduleOrderGroupingService = {
      createScheduleOrderFromProductionOrders: jest.fn(),
    };

    const mockScheduleOrderService = {
      createScheduleOrderQueue: jest.fn(),
    };

    const mockWinstonLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        ProductionOrderService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: RabbitMQProducerService,
          useValue: mockRabbitMQProducerService,
        },
        {
          provide: WINSTON_MODULE_NEST_PROVIDER,
          useValue: mockWinstonLogger,
        },
        {
          provide: OrderValidationService,
          useValue: mockOrderValidationService,
        },
        {
          provide: ContainerItemService,
          useValue: mockContainerItemService,
        },
        {
          provide: ScheduleOrderGroupingService,
          useValue: mockScheduleOrderGroupingService,
        },
        {
          provide: ScheduleOrderService,
          useValue: mockScheduleOrderService,
        },
        {
          provide: MqttDomainPublisherService,
          useValue: { publishDomainEvent: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ProductionOrderService>(ProductionOrderService);
    prisma = module.get<PrismaService>(PrismaService);
    orderValidationService = module.get<OrderValidationService>(
      OrderValidationService
    );
    containerItemService =
      module.get<ContainerItemService>(ContainerItemService);
    scheduleOrderGroupingService = module.get<ScheduleOrderGroupingService>(
      ScheduleOrderGroupingService
    );
    scheduleOrderService =
      module.get<ScheduleOrderService>(ScheduleOrderService);

    // Mock the parent class method on the prototype
    (ProductionOrderServiceBase.prototype.createProductionOrder as jest.Mock) =
      jest.fn();
  });

  describe("createProductionOrder", () => {
    const validCreateArgs = {
      data: {
        customer: { connect: { id: "customer-1" } },
        bom: { connect: { id: "bom-1" } },
        item: { connect: { id: "item-1" } },
        containerType: EnumProductionOrderContainerType.LargeBarrel,
        finalProof: 100,
        containerItem: { connect: { id: "container-item-1" } },
        createdBy: "test-user",
      },
      include: {
        customer: true,
        bom: true,
        item: true,
        containerItem: true,
      },
    };

    it("should validate production order data before creation", async () => {
      // Mock successful validation
      orderValidationService.validateProductionOrder.mockResolvedValue(
        undefined
      );

      // Mock item.findMany to return the container item (used to resolve container items)
      prisma.item.findMany.mockResolvedValue([{ id: "container-item-1" }]);

      // Mock successful creation
      const mockCreatedOrder = {
        id: "po-1",
        name: "Test Production Order",
        containerType: EnumProductionOrderContainerType.LargeBarrel,
        finalProof: 100,
      };

      // Mock the parent createProductionOrder method
      const mockParentCreate = jest.fn().mockResolvedValue(mockCreatedOrder);
      (ProductionOrderServiceBase.prototype
        .createProductionOrder as jest.Mock) = mockParentCreate;

      const result = await service.createProductionOrder(validCreateArgs);

      // Verify validation was called with the resolved container items
      expect(
        orderValidationService.validateProductionOrder
      ).toHaveBeenCalledWith({
        customer: { id: "customer-1" },
        bom: { id: "bom-1" },
        item: { id: "item-1" },
        containerType: EnumProductionOrderContainerType.LargeBarrel,
        finalProof: 100,
        containerItem: [{ id: "container-item-1" }],
        recipe: undefined,
      });

      // Verify creation was attempted
      expect(mockParentCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: validCreateArgs.data,
          include: expect.objectContaining({
            containerItem: true,
          }),
        })
      );
    });

    it("should throw error when validation fails", async () => {
      // Mock validation failure
      orderValidationService.validateProductionOrder.mockRejectedValue(
        new BadRequestException("Validation failed")
      );

      await expect(
        service.createProductionOrder(validCreateArgs)
      ).rejects.toThrow(BadRequestException);

      // Verify validation was called
      expect(orderValidationService.validateProductionOrder).toHaveBeenCalled();
    });

    it("should handle missing required fields", async () => {
      const invalidArgs = {
        data: {
          customer: { connect: { id: "customer-1" } },
          // Missing required fields
        },
      };

      // The validateProductionOrderData method should catch this
      await expect(
        service.createProductionOrder(invalidArgs as any)
      ).rejects.toThrow();
    });

    it("should validate creation with connected objects", async () => {
      const createWithNewObjects = {
        data: {
          customer: { connect: { id: "new-customer-1" } },
          bom: { connect: { id: "new-bom-1" } },
          item: { connect: { id: "new-item-1" } },
          containerType: EnumProductionOrderContainerType.LargeBarrel,
          finalProof: 100,
          createdBy: "test-user",
          // This test focuses on new object detection logic, not actual object creation
        },
      };

      // Mock successful creation
      const mockCreatedOrder = { id: "po-1" };
      const mockParentCreate = jest.fn().mockResolvedValue(mockCreatedOrder);
      (ProductionOrderServiceBase.prototype
        .createProductionOrder as jest.Mock) = mockParentCreate;

      await service.createProductionOrder(createWithNewObjects);

      // Validation should be called since we're using connect
      expect(orderValidationService.validateProductionOrder).toHaveBeenCalled();
    });

    it("should require containerType field", async () => {
      const invalidArgs = {
        data: {
          customer: { connect: { id: "customer-1" } },
          bom: { connect: { id: "bom-1" } },
          item: { connect: { id: "item-1" } },
          // Missing containerType
          finalProof: 100,
          createdBy: "test-user",
        },
      };

      await expect(
        service.createProductionOrder(invalidArgs as any)
      ).rejects.toThrow("Container type is required");
    });

    it("should require finalProof field", async () => {
      const invalidArgs = {
        data: {
          customer: { connect: { id: "customer-1" } },
          bom: { connect: { id: "bom-1" } },
          item: { connect: { id: "item-1" } },
          containerType: EnumProductionOrderContainerType.LargeBarrel,
          // Missing finalProof
          createdBy: "test-user",
        },
      };

      await expect(
        service.createProductionOrder(invalidArgs as any)
      ).rejects.toThrow("Final proof is required");
    });

    it("should reject multiple container items per MES Phase 1 constraint", async () => {
      const argsWithMultipleItems = {
        data: {
          customer: { connect: { id: "customer-1" } },
          bom: { connect: { id: "bom-1" } },
          item: { connect: { id: "item-1" } },
          containerType: EnumProductionOrderContainerType.LargeBarrel,
          finalProof: 100,
          containerItem: {
            connect: [{ id: "item-1" }, { id: "item-2" }],
          },
          createdBy: "test-user",
        },
      };

      // Should throw because MES Phase 1 only allows one container item
      await expect(
        service.createProductionOrder(argsWithMultipleItems as any)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("createProductionOrderFromWizardComplete", () => {
    it("should auto-schedule when autoSchedule is true", async () => {
      const wizardData = {
        productionOrder: {
          orderName: "Test Order",
          quantity: 10,
          units: "units-1",
          startDate: "2023-01-01",
          endDate: "2023-01-02",
          customerCode: "CUST",
          priority: "medium",
          finalProof: 120,
          containerType: EnumProductionOrderContainerType.LargeBarrel,
          fermenters: 1,
          cooks: 1,
          totalGrainLoad: 1000,
          estBblsPerFerm: 10,
          estPGsPerBshl: 5,
          estPGsPerBbl: 50,
          upperControlLimit: 11,
          lowerControlLimit: 9,
        },
        recipe: {
          id: "recipe-1",
          Recipe: "Test Recipe",
          whiskeyType: "Bourbon",
        },
        bomItems: [],
        binConfigurations: {
          sil110ConfigId: "conf-1",
          sil115ConfigId: "conf-2",
          sil120ConfigId: "conf-3",
          totalCooks: 1,
          totalFermenters: 1,
          cooksPerFermenter: 1,
          entryProof: 120,
          proofGallonsPerBarrel: 50,
          barrelsPerFermenter: 10,
        },
        scheduleOrder: {
          estimatedStart: "2023-01-01",
          estimatedEnd: "2023-01-02",
          totalBarrels: 10,
          totalProofGallons: 500,
          duration: 24,
          durationUnits: "hours",
        },
        metadata: { createdBy: "test-user", source: "test", version: "1.0" },
        autoSchedule: true,
      };

      // Mock data for createProductionOrderFromWizardData
      const mockCreatedOrder = {
        id: "po-1",
        name: "Test Order",
        scheduleOrderId: null,
        scheduled: false,
      };

      // Mock internal methods
      (service as any).generateItemNumber = jest
        .fn()
        .mockResolvedValue("ITEM-123");
      (service as any).createOrFindItem = jest.fn().mockResolvedValue({
        item: { id: "item-1" },
        validatedUnitsId: "units-1",
      });
      (service as any).createBomFromWizardItems = jest
        .fn()
        .mockResolvedValue({ id: "bom-1" });
      (service as any).createProductionOrderFromWizardData = jest
        .fn()
        .mockResolvedValue(mockCreatedOrder);

      // Mock DB lookups
      prisma.recipe.findUnique = jest.fn().mockResolvedValue({
        id: "recipe-1",
        Recipe: "Test Recipe",
        recipeGroup: { id: "group-1" },
      });

      prisma.customer.findFirst = jest.fn().mockResolvedValue({
        id: "customer-1",
        customerCode: "CUST",
      });

      const mockScheduleOrder = { id: "so-1" };
      scheduleOrderGroupingService.createScheduleOrderFromProductionOrders.mockResolvedValue(
        mockScheduleOrder
      );

      await service.createProductionOrderFromWizardComplete(wizardData as any);

      expect(
        scheduleOrderGroupingService.createScheduleOrderFromProductionOrders
      ).toHaveBeenCalledWith({
        productionOrderIds: ["po-1"],
        recipeGroupId: "group-1",
        estimatedStart: new Date("2023-01-01"),
        estimatedEnd: new Date("2023-01-02"),
        totalCooks: 1,
        totalFermenters: 1,
        estimatedBarrelsPerFermenter: 10,
        estimatedPGsPerBbl: 50,
        totalBarrels: 10,
        totalProofGallons: 500,
        totalGrainWeight: 1000,
      });

      expect(
        scheduleOrderService.createScheduleOrderQueue
      ).toHaveBeenCalledWith("so-1");
    });
  });

  describe("validateProductionOrderData", () => {
    it("should extract validation data correctly from Prisma input", async () => {
      const createData = {
        customer: { connect: { id: "customer-1" } },
        bom: { connect: { id: "bom-1" } },
        item: { connect: { id: "item-1" } },
        containerType: EnumProductionOrderContainerType.LargeBarrel,
        finalProof: 100,
        containerItem: { connect: { id: "container-item-1" } },
        recipe: { connect: { id: "recipe-1" } },
      };

      // Mock validation
      orderValidationService.validateProductionOrder.mockResolvedValue(
        undefined
      );

      // Mock container item lookup
      prisma.item.findMany.mockResolvedValue([{ id: "container-item-1" }]);

      // Mock recipe lookup for mash bill validation
      prisma.recipe.findUnique.mockResolvedValue({
        id: "recipe-1",
        Recipe: "WHK-75-21-00-04",
        recipeGroup: { id: "group-1" },
      });

      // Access the private method for testing
      await (service as any).validateProductionOrderData(createData);

      expect(
        orderValidationService.validateProductionOrder
      ).toHaveBeenCalledWith({
        customer: { id: "customer-1" },
        bom: { id: "bom-1" },
        item: { id: "item-1" },
        containerType: EnumProductionOrderContainerType.LargeBarrel,
        finalProof: 100,
        containerItem: [{ id: "container-item-1" }],
        recipe: { id: "recipe-1" },
      });
    });
  });
});
