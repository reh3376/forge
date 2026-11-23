import { Test } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { EnumProductionOrderContainerType } from "@prisma/client";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { ProductionOrderService } from "../productionOrder.service";
import { PrismaService } from "../../prisma/prisma.service";
import { OrderValidationService } from "../../order-validation/order-validation.service";
import { ContainerItemService } from "../container-item.service";
import { RabbitMQProducerService } from "../../rabbitmq/rabbitmq.producer.service";
import { ScheduleOrderGroupingService } from "../../scheduleOrder/schedule-order-grouping.service";
import { ScheduleOrderService } from "../../scheduleOrder/scheduleOrder.service";
import { MqttDomainPublisherService } from "../../mqttDomainPublisher/mqttDomainPublisher.service";

// Mock the base service
jest.mock("../base/productionOrder.service.base");

describe("ProductionOrderService - MES Phase 1 Constraints", () => {
  let service: ProductionOrderService;
  let prisma: any;
  let orderValidationService: any;
  let containerItemService: any;

  beforeEach(async () => {
    const mockPrisma = {
      productionOrder: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      item: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      recipe: {
        findUnique: jest.fn(),
      },
    };

    const mockOrderValidationService = {
      validateProductionOrder: jest.fn(),
    };

    const mockContainerItemService = {
      validateContainerItemCompatibility: jest.fn(),
    };

    const mockRabbitMQProducerService = {
      emitMessage: jest.fn(),
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
          useValue: { createScheduleOrderFromProductionOrders: jest.fn() },
        },
        {
          provide: ScheduleOrderService,
          useValue: { createScheduleOrderQueue: jest.fn() },
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
  });

  describe("MES Phase 1 Constraint: ONE Container Type", () => {
    it("should reject production order without container type", async () => {
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
      ).rejects.toThrow(
        new BadRequestException(
          "Container type is required for MES Phase 1 compliance. Each Production Order must specify exactly one container type."
        )
      );
    });

    it("should accept production order with valid container type", async () => {
      const validArgs = {
        data: {
          customer: { connect: { id: "customer-1" } },
          bom: { connect: { id: "bom-1" } },
          item: { connect: { id: "item-1" } },
          containerType: EnumProductionOrderContainerType.LargeBarrel,
          finalProof: 100,
          createdBy: "test-user",
        },
      };

      // Mock successful validation
      orderValidationService.validateProductionOrder.mockResolvedValue(
        undefined
      );

      // Mock successful creation
      const mockCreatedOrder = { id: "po-1", containerType: "LargeBarrel" };
      const mockParentCreate = jest.fn().mockResolvedValue(mockCreatedOrder);
      (service as any).__proto__.__proto__.createProductionOrder =
        mockParentCreate;

      await service.createProductionOrder(validArgs);

      expect(orderValidationService.validateProductionOrder).toHaveBeenCalled();
    });
  });

  describe("MES Phase 1 Constraint: ONE Final Proof", () => {
    it("should reject production order without final proof", async () => {
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
      ).rejects.toThrow(
        new BadRequestException(
          "Final proof is required and must be greater than 0 for MES Phase 1 compliance. Each Production Order must specify exactly one proof level."
        )
      );
    });

    it("should reject production order with zero or negative final proof", async () => {
      const invalidArgs = {
        data: {
          customer: { connect: { id: "customer-1" } },
          bom: { connect: { id: "bom-1" } },
          item: { connect: { id: "item-1" } },
          containerType: EnumProductionOrderContainerType.LargeBarrel,
          finalProof: 0, // Invalid proof
          createdBy: "test-user",
        },
      };

      await expect(
        service.createProductionOrder(invalidArgs as any)
      ).rejects.toThrow(
        new BadRequestException(
          "Final proof is required and must be greater than 0 for MES Phase 1 compliance. Each Production Order must specify exactly one proof level."
        )
      );
    });

    it("should accept production order with valid final proof", async () => {
      const validArgs = {
        data: {
          customer: { connect: { id: "customer-1" } },
          bom: { connect: { id: "bom-1" } },
          item: { connect: { id: "item-1" } },
          containerType: EnumProductionOrderContainerType.LargeBarrel,
          finalProof: 120.5, // Valid proof
          createdBy: "test-user",
        },
      };

      // Mock successful validation
      orderValidationService.validateProductionOrder.mockResolvedValue(
        undefined
      );

      const mockCreatedOrder = { id: "po-1", finalProof: 120.5 };
      const mockParentCreate = jest.fn().mockResolvedValue(mockCreatedOrder);
      (service as any).__proto__.__proto__.createProductionOrder =
        mockParentCreate;

      await service.createProductionOrder(validArgs);

      expect(
        orderValidationService.validateProductionOrder
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          finalProof: 120.5,
        })
      );
    });
  });

  describe("MES Phase 1 Constraint: ONE Customer", () => {
    it("should reject production order without customer", async () => {
      const invalidArgs = {
        data: {
          // Missing customer
          bom: { connect: { id: "bom-1" } },
          item: { connect: { id: "item-1" } },
          containerType: EnumProductionOrderContainerType.LargeBarrel,
          finalProof: 100,
          createdBy: "test-user",
        },
      };

      await expect(
        service.createProductionOrder(invalidArgs as any)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("MES Phase 1 Constraint: ONE BOM", () => {
    it("should reject production order without BOM", async () => {
      const invalidArgs = {
        data: {
          customer: { connect: { id: "customer-1" } },
          // Missing bom
          item: { connect: { id: "item-1" } },
          containerType: EnumProductionOrderContainerType.LargeBarrel,
          finalProof: 100,
          createdBy: "test-user",
        },
      };

      await expect(
        service.createProductionOrder(invalidArgs as any)
      ).rejects.toThrow(
        new BadRequestException(
          "BOM is required for MES Phase 1 compliance. Each Production Order must specify exactly one production BOM."
        )
      );
    });
  });

  describe("MES Phase 1 Constraint: ONE Final Item FG Code", () => {
    it("should reject production order without item", async () => {
      const invalidArgs = {
        data: {
          customer: { connect: { id: "customer-1" } },
          bom: { connect: { id: "bom-1" } },
          // Missing item
          containerType: EnumProductionOrderContainerType.LargeBarrel,
          finalProof: 100,
          createdBy: "test-user",
        },
      };

      await expect(
        service.createProductionOrder(invalidArgs as any)
      ).rejects.toThrow(
        new BadRequestException(
          "Item is required for MES Phase 1 compliance. Each Production Order must specify exactly one final FG item code."
        )
      );
    });
  });

  describe("MES Phase 1 Constraint: Single Container Item", () => {
    it("should reject production order with multiple container items", async () => {
      const invalidArgs = {
        data: {
          customer: { connect: { id: "customer-1" } },
          bom: { connect: { id: "bom-1" } },
          item: { connect: { id: "item-1" } },
          containerType: EnumProductionOrderContainerType.LargeBarrel,
          finalProof: 100,
          containerItem: {
            connect: [
              { id: "container-item-1" },
              { id: "container-item-2" }, // Multiple container items not allowed
            ],
          },
          createdBy: "test-user",
        },
      };

      await expect(
        service.createProductionOrder(invalidArgs as any)
      ).rejects.toThrow(
        new BadRequestException(
          "MES Phase 1 constraint violation: Production Order cannot have multiple container items (2 provided). Each Production Order must specify at most one specific container item."
        )
      );
    });

    it("should accept production order with single container item", async () => {
      const validArgs = {
        data: {
          customer: { connect: { id: "customer-1" } },
          bom: { connect: { id: "bom-1" } },
          item: { connect: { id: "item-1" } },
          containerType: EnumProductionOrderContainerType.LargeBarrel,
          finalProof: 100,
          containerItem: {
            connect: { id: "container-item-1" }, // Single container item allowed
          },
          createdBy: "test-user",
        },
      };

      // Mock container item validation
      const mockContainerItem = {
        id: "container-item-1",
        itemNumber: "BBL-53-001",
        itemGroup: "BARREL-53GAL",
      };

      prisma.item.findMany.mockResolvedValue([mockContainerItem]);
      containerItemService.validateContainerItemCompatibility.mockResolvedValue(
        {
          isValid: true,
        }
      );
      orderValidationService.validateProductionOrder.mockResolvedValue(
        undefined
      );

      const mockCreatedOrder = { id: "po-1" };
      const mockParentCreate = jest.fn().mockResolvedValue(mockCreatedOrder);
      (service as any).__proto__.__proto__.createProductionOrder =
        mockParentCreate;

      await service.createProductionOrder(validArgs);

      expect(
        containerItemService.validateContainerItemCompatibility
      ).toHaveBeenCalledWith(
        "container-item-1",
        EnumProductionOrderContainerType.LargeBarrel
      );
    });

    it("should reject production order with incompatible container item", async () => {
      const invalidArgs = {
        data: {
          customer: { connect: { id: "customer-1" } },
          bom: { connect: { id: "bom-1" } },
          item: { connect: { id: "item-1" } },
          containerType: EnumProductionOrderContainerType.LargeBarrel,
          finalProof: 100,
          containerItem: {
            connect: { id: "small-barrel-item" },
          },
          createdBy: "test-user",
        },
      };

      // Mock incompatible container item
      const mockContainerItem = {
        id: "small-barrel-item",
        itemNumber: "BBL-30-001",
        itemGroup: "BARREL-30GAL",
      };

      prisma.item.findMany.mockResolvedValue([mockContainerItem]);
      containerItemService.validateContainerItemCompatibility.mockResolvedValue(
        {
          isValid: false,
          message:
            "30-gallon barrel is not compatible with LargeBarrel container type",
        }
      );

      await expect(
        service.createProductionOrder(invalidArgs as any)
      ).rejects.toThrow(
        new BadRequestException(
          "Container item compatibility error: 30-gallon barrel is not compatible with LargeBarrel container type"
        )
      );
    });
  });

  describe("MES Phase 1 Constraint: ONE Mash Bill", () => {
    it("should validate mash bill consistency when recipe is provided", async () => {
      const validArgs = {
        data: {
          customer: { connect: { id: "customer-1" } },
          bom: { connect: { id: "bom-1" } },
          item: { connect: { id: "item-1" } },
          recipe: { connect: { id: "recipe-1" } },
          containerType: EnumProductionOrderContainerType.LargeBarrel,
          finalProof: 100,
          createdBy: "test-user",
        },
      };

      // Mock recipe with recipe group
      const mockRecipe = {
        id: "recipe-1",
        Recipe: "DWL-75-21-00-04-v01",
        recipeGroup: {
          id: "recipe-group-1",
          name: "Corn-Wheat-Malt-Rye 75-21-00-04",
        },
      };

      prisma.recipe.findUnique.mockResolvedValue(mockRecipe);
      orderValidationService.validateProductionOrder.mockResolvedValue(
        undefined
      );

      const mockCreatedOrder = { id: "po-1" };
      const mockParentCreate = jest.fn().mockResolvedValue(mockCreatedOrder);
      (service as any).__proto__.__proto__.createProductionOrder =
        mockParentCreate;

      await service.createProductionOrder(validArgs);

      expect(prisma.recipe.findUnique).toHaveBeenCalledWith({
        where: { id: "recipe-1" },
        include: { recipeGroup: true },
      });
    });

    it("should reject recipe without associated recipe group", async () => {
      const invalidArgs = {
        data: {
          customer: { connect: { id: "customer-1" } },
          bom: { connect: { id: "bom-1" } },
          item: { connect: { id: "item-1" } },
          recipe: { connect: { id: "recipe-without-group" } },
          containerType: EnumProductionOrderContainerType.LargeBarrel,
          finalProof: 100,
          createdBy: "test-user",
        },
      };

      // Mock recipe without recipe group
      const mockRecipe = {
        id: "recipe-without-group",
        Recipe: "Invalid-Recipe",
        recipeGroup: null, // No recipe group
      };

      prisma.recipe.findUnique.mockResolvedValue(mockRecipe);

      await expect(
        service.createProductionOrder(invalidArgs as any)
      ).rejects.toThrow(
        new BadRequestException(
          "Recipe Invalid-Recipe must be associated with a recipe group for mash bill validation. MES Phase 1 requires explicit mash bill tracking."
        )
      );
    });
  });

  describe("Comprehensive MES Phase 1 Validation", () => {
    it("should validate all constraints together", async () => {
      const validArgs = {
        data: {
          customer: { connect: { id: "customer-1" } },
          bom: { connect: { id: "bom-1" } },
          item: { connect: { id: "item-1" } },
          recipe: { connect: { id: "recipe-1" } },
          containerType: EnumProductionOrderContainerType.LargeBarrel,
          finalProof: 120,
          containerItem: {
            connect: { id: "container-item-1" },
          },
          createdBy: "test-user",
        },
      };

      // Mock all dependencies
      const mockRecipe = {
        id: "recipe-1",
        Recipe: "DWL-75-21-00-04-v01",
        recipeGroup: {
          id: "recipe-group-1",
          name: "Corn-Wheat-Malt-Rye 75-21-00-04",
        },
      };
      const mockContainerItem = {
        id: "container-item-1",
        itemGroup: "BARREL-53GAL",
      };

      prisma.recipe.findUnique.mockResolvedValue(mockRecipe);
      prisma.item.findMany.mockResolvedValue([mockContainerItem]);
      containerItemService.validateContainerItemCompatibility.mockResolvedValue(
        { isValid: true }
      );
      orderValidationService.validateProductionOrder.mockResolvedValue(
        undefined
      );

      const mockCreatedOrder = { id: "po-1" };
      const mockParentCreate = jest.fn().mockResolvedValue(mockCreatedOrder);
      (service as any).__proto__.__proto__.createProductionOrder =
        mockParentCreate;

      await service.createProductionOrder(validArgs);

      // Verify comprehensive validation was called
      expect(
        orderValidationService.validateProductionOrder
      ).toHaveBeenCalledWith({
        customer: { id: "customer-1" },
        bom: { id: "bom-1" },
        item: { id: "item-1" },
        recipe: { id: "recipe-1" },
        containerType: EnumProductionOrderContainerType.LargeBarrel,
        finalProof: 120,
        containerItem: [mockContainerItem],
      });
    });
  });
});
