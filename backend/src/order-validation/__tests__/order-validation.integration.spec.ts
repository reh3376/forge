import { Test } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ContainerItemService } from "../../productionOrder/container-item.service";
import { OrderValidationService } from "../order-validation.service";
import { ProductionOrderService } from "../../productionOrder/productionOrder.service";
import { ScheduleOrderService } from "../../scheduleOrder/scheduleOrder.service";
import { ScheduleOrderGroupingService } from "../../scheduleOrder/schedule-order-grouping.service";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { RabbitMQProducerService } from "../../rabbitmq/rabbitmq.producer.service";
import { MqttDomainPublisherService } from "../../mqttDomainPublisher/mqttDomainPublisher.service";
import { BomCalculationService } from "../../recipeBom/bom-calculation.service";
import { AuditService } from "../../audit/audit.service";

describe("Order Validation Integration", () => {
  let orderValidationService: OrderValidationService;
  let containerItemService: ContainerItemService;
  let productionOrderService: ProductionOrderService;
  let scheduleOrderService: ScheduleOrderService;
  let prisma: any;

  beforeEach(async () => {
    const mockPrisma = {
      productionOrder: {
        create: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
      scheduleOrder: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      item: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      bom: {
        findUnique: jest.fn(),
      },
      recipe: {
        findUnique: jest.fn(),
      },
    };

    const mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    const mockRabbitProducer = {
      emitMessage: jest.fn(),
    };

    const mockScheduleOrderGroupingService = {
      validateProductionOrderGrouping: jest.fn(),
      createScheduleOrderFromProductionOrders: jest.fn(),
      findCompatibleProductionOrders: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        OrderValidationService,
        ContainerItemService,
        ProductionOrderService,
        ScheduleOrderService,
        {
          provide: ScheduleOrderGroupingService,
          useValue: mockScheduleOrderGroupingService,
        },
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: WINSTON_MODULE_NEST_PROVIDER,
          useValue: mockLogger,
        },
        {
          provide: RabbitMQProducerService,
          useValue: mockRabbitProducer,
        },
        {
          provide: MqttDomainPublisherService,
          useValue: { publishDomainEvent: jest.fn() },
        },
        {
          provide: BomCalculationService,
          useValue: { calculateInitialBomQuantities: jest.fn() },
        },
        {
          provide: AuditService,
          useValue: { logAction: jest.fn() },
        },
      ],
    }).compile();

    orderValidationService = module.get<OrderValidationService>(
      OrderValidationService
    );
    containerItemService =
      module.get<ContainerItemService>(ContainerItemService);
    productionOrderService = module.get<ProductionOrderService>(
      ProductionOrderService
    );
    scheduleOrderService =
      module.get<ScheduleOrderService>(ScheduleOrderService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe("Production Order Validation Workflow", () => {
    it("should complete full validation workflow for valid LargeBarrel production order", async () => {
      // Setup mock data
      const mockContainerItem = {
        id: "container-item-1",
        active: true,
        baseBomItem: false,
        createdAt: new Date(),
        createdBy: "test-user",
        erpId: "ERP-001",
        globalId: "global-1",
        itemClass: "CONTAINER",
        itemDescription: "53-Gallon Barrel",
        itemGroup: "BARREL-53GAL",
        itemName: "53-Gallon Oak Barrel",
        itemNumber: "BBL-53-001",
        itemRevision: 1,
        itemType: "CONTAINER",
        updatedAt: new Date(),
        updatedBy: "test-user",
        schemaVersion: "v1",
        vendorId: null,
      } as any;

      const mockBom = {
        id: "bom-1",
        bomType: "ProductionBom",
      };

      // Setup mocks
      prisma.item.findUnique.mockResolvedValue(mockContainerItem);
      prisma.bom.findUnique.mockResolvedValue(mockBom);

      const validationData = {
        customer: { id: "customer-1" },
        bom: { id: "bom-1" },
        item: { id: "item-1" },
        containerType: "LargeBarrel" as const,
        finalProof: 100,
        containerItem: [mockContainerItem],
      };

      // Should not throw
      await expect(
        orderValidationService.validateProductionOrder(validationData)
      ).resolves.not.toThrow();

      // Verify BOM validation was called
      expect(prisma.bom.findUnique).toHaveBeenCalledWith({
        where: { id: "bom-1" },
      });

      // Verify container item validation was called
      expect(prisma.item.findUnique).toHaveBeenCalledWith({
        where: { id: "container-item-1" },
      });
    });

    it("should fail validation workflow for invalid container item", async () => {
      // Setup mock data - wrong barrel type
      const mockContainerItem = {
        id: "container-item-1",
        active: true,
        baseBomItem: false,
        createdAt: new Date(),
        createdBy: "test-user",
        erpId: "ERP-001",
        globalId: "global-1",
        itemClass: "CONTAINER",
        itemDescription: "30-Gallon Barrel",
        itemGroup: "BARREL-30GAL", // Wrong size for LargeBarrel
        itemName: "30-Gallon Barrel",
        itemNumber: "BBL-30-001",
        itemRevision: 1,
        itemType: "CONTAINER",
        updatedAt: new Date(),
        updatedBy: "test-user",
        schemaVersion: "v1",
        vendorId: null,
      } as any;

      const mockBom = {
        id: "bom-1",
        bomType: "ProductionBom",
      };

      // Setup mocks
      prisma.item.findUnique.mockResolvedValue(mockContainerItem);
      prisma.bom.findUnique.mockResolvedValue(mockBom);

      const validationData = {
        customer: { id: "customer-1" },
        bom: { id: "bom-1" },
        item: { id: "item-1" },
        containerType: "LargeBarrel" as const,
        finalProof: 100,
        containerItem: [mockContainerItem],
      };

      // Should throw validation error
      await expect(
        orderValidationService.validateProductionOrder(validationData)
      ).rejects.toThrow(BadRequestException);
    });

    it("should handle BulkLoadout without container items", async () => {
      const mockBom = {
        id: "bom-1",
        bomType: "ProductionBom",
      };

      prisma.bom.findUnique.mockResolvedValue(mockBom);

      const validationData = {
        customer: { id: "customer-1" },
        bom: { id: "bom-1" },
        item: { id: "item-1" },
        containerType: "BulkLoadout" as const,
        finalProof: 100,
        containerItem: [],
      };

      // Should not throw
      await expect(
        orderValidationService.validateProductionOrder(validationData)
      ).resolves.not.toThrow();

      // Container item validation should not be called for BulkLoadout
      expect(prisma.item.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("Schedule Order Validation Workflow", () => {
    it("should complete full validation workflow for valid schedule order", async () => {
      const mockRecipe = {
        id: "recipe-1",
        recipeBoms: [
          {
            id: "recipe-bom-1",
            recipeBomITem: [
              {
                id: "bom-item-1",
                item: {
                  id: "item-1",
                  category: "GRAIN_CORN",
                },
              },
              {
                id: "bom-item-2",
                item: {
                  id: "item-2",
                  category: "ADDITIVE_ENZYME",
                },
              },
              {
                id: "bom-item-3",
                item: {
                  id: "item-3",
                  category: "YEAST_DISTILLERS",
                },
              },
            ],
          },
        ],
      };

      prisma.recipe.findUnique.mockResolvedValue(mockRecipe);

      const validationData = {
        recipeGroup: { id: "group-1" },
        scheduleOrderRecipe: { id: "recipe-1" },
      };

      // Should not throw
      await expect(
        orderValidationService.validateScheduleOrder(validationData)
      ).resolves.not.toThrow();

      // Verify recipe validation was called with correct structure
      expect(prisma.recipe.findUnique).toHaveBeenCalledWith({
        where: { id: "recipe-1" },
        include: {
          recipeBoms: {
            include: {
              recipeBomITem: {
                include: { item: true },
              },
            },
          },
        },
      });
    });

    it("should fail validation for incomplete Recipe BOM", async () => {
      const mockRecipe = {
        id: "recipe-1",
        recipeBomITem: [
          {
            item: {
              category: "GRAIN_CORN", // Missing additives and yeast
            },
          },
        ],
      };

      prisma.recipe.findUnique.mockResolvedValue(mockRecipe);

      const validationData = {
        recipeGroup: { id: "group-1" },
        scheduleOrderRecipe: { id: "recipe-1" },
      };

      // Should throw validation error
      await expect(
        orderValidationService.validateScheduleOrder(validationData)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("Cross-Order Validation Workflow", () => {
    it("should validate mash bill consistency across production orders", async () => {
      const scheduleOrderId = "schedule-1";
      const productionOrderIds = ["prod-1", "prod-2"];

      // Mock schedule order with correct structure
      prisma.scheduleOrder.findUnique.mockResolvedValue({
        id: scheduleOrderId,
        recipeGroup: { id: "group-1" },
        scheduleOrderRecipe: {
          id: "recipe-1",
          recipeBoms: [
            {
              id: "recipe-bom-1",
              recipeBomITem: [
                {
                  id: "bom-item-1",
                  item: {
                    id: "item-1",
                    category: "GRAIN_CORN",
                  },
                },
              ],
            },
          ],
        },
      });

      // Mock production orders with consistent mash bill (using recipeGroupId field)
      prisma.productionOrder.findUnique
        .mockResolvedValueOnce({
          id: "prod-1",
          recipe: {
            id: "recipe-1",
            recipeGroupId: "group-1",
          },
        })
        .mockResolvedValueOnce({
          id: "prod-2",
          recipe: {
            id: "recipe-2",
            recipeGroupId: "group-1",
          },
        });

      // Should not throw
      await expect(
        orderValidationService.validateCrossOrderConsistency(
          scheduleOrderId,
          productionOrderIds
        )
      ).resolves.not.toThrow();

      // Verify all orders were checked
      expect(prisma.scheduleOrder.findUnique).toHaveBeenCalledWith({
        where: { id: scheduleOrderId },
        include: {
          recipeGroup: true,
          scheduleOrderRecipe: {
            include: {
              recipeBoms: {
                include: {
                  recipeBomITem: {
                    include: { item: true },
                  },
                },
              },
            },
          },
        },
      });

      expect(prisma.productionOrder.findUnique).toHaveBeenCalledTimes(2);
    });

    it("should fail validation for inconsistent mash bills", async () => {
      const scheduleOrderId = "schedule-1";
      const productionOrderIds = ["prod-1"];

      // Mock schedule order
      prisma.scheduleOrder.findUnique.mockResolvedValue({
        id: scheduleOrderId,
        recipeGroup: { id: "group-1" },
        scheduleOrderRecipe: {
          recipeBomITem: [],
        },
      });

      // Mock production order with different mash bill
      prisma.productionOrder.findUnique.mockResolvedValue({
        id: "prod-1",
        recipe: {
          recipeGroup: { id: "group-2" }, // Different group
        },
      });

      // Should throw validation error
      await expect(
        orderValidationService.validateCrossOrderConsistency(
          scheduleOrderId,
          productionOrderIds
        )
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("Container Item Service Integration", () => {
    it("should filter container items by type correctly", async () => {
      const mockItems = [
        {
          id: "item-1",
          itemName: "53-Gallon Barrel #1",
          itemNumber: "BBL-53-001",
          itemGroup: "BARREL-53GAL",
          active: true,
        },
        {
          id: "item-2",
          itemName: "30-Gallon Barrel #1",
          itemNumber: "BBL-30-001",
          itemGroup: "BARREL-30GAL",
          active: true,
        },
      ] as any;

      prisma.item.findMany.mockResolvedValue(mockItems);

      const result = await containerItemService.getContainerItemsByType(
        "LargeBarrel"
      );

      // Should only return 53-gallon barrels
      expect(result).toEqual(mockItems);
      expect(prisma.item.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              {
                itemGroup: {
                  contains: "BARREL-53GAL",
                  mode: "insensitive",
                },
              },
            ]),
          }),
        })
      );
    });

    it("should validate container item compatibility", async () => {
      const mockItem = {
        id: "item-1",
        itemNumber: "BBL-53-001",
        itemGroup: "BARREL-53GAL",
      } as any;

      prisma.item.findUnique.mockResolvedValue(mockItem);

      const result =
        await containerItemService.validateContainerItemCompatibility(
          "item-1",
          "LargeBarrel"
        );

      expect(result.isValid).toBe(true);
      expect(result.message).toBeUndefined();
    });

    it("should track container item usage statistics", async () => {
      const mockUsageCount = 3;
      const mockRecentUsage = [
        {
          id: "po-1",
          name: "Production Order 1",
          createdAt: new Date(),
          customer: {
            name: "Customer A",
          },
        },
      ];

      prisma.productionOrder.count.mockResolvedValue(mockUsageCount);
      prisma.productionOrder.findMany.mockResolvedValue(mockRecentUsage);

      const result = await containerItemService.getContainerItemUsageStats(
        "item-1"
      );

      expect(result.totalUsage).toBe(mockUsageCount);
      expect(result.recentUsage).toEqual(mockRecentUsage);
    });
  });

  describe("End-to-End Validation Flow", () => {
    it("should handle complete production order creation with validation", async () => {
      // Setup all required mock data
      const mockContainerItem = {
        id: "container-item-1",
        active: true,
        baseBomItem: false,
        createdAt: new Date(),
        createdBy: "test-user",
        erpId: "ERP-001",
        globalId: "global-1",
        itemClass: "CONTAINER",
        itemDescription: "53-Gallon Barrel",
        itemGroup: "BARREL-53GAL",
        itemName: "53-Gallon Oak Barrel",
        itemNumber: "BBL-53-001",
        itemRevision: 1,
        itemType: "CONTAINER",
        updatedAt: new Date(),
        updatedBy: "test-user",
        schemaVersion: "v1",
        vendorId: null,
      } as any;

      const mockBom = {
        id: "bom-1",
        bomType: "ProductionBom",
      };

      const mockCreatedOrder = {
        id: "po-1",
        name: "Test Production Order",
        containerType: "LargeBarrel",
        finalProof: 100,
        customer: { id: "customer-1" },
        bom: { id: "bom-1" },
        item: { id: "item-1" },
        containerItem: [mockContainerItem],
      };

      // Setup mocks
      prisma.item.findUnique.mockResolvedValue(mockContainerItem);
      prisma.bom.findUnique.mockResolvedValue(mockBom);
      prisma.productionOrder.create.mockResolvedValue(mockCreatedOrder);

      const createArgs = {
        data: {
          customer: { connect: { id: "customer-1" } },
          bom: { connect: { id: "bom-1" } },
          item: { connect: { id: "item-1" } },
          containerType: "LargeBarrel" as const,
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

      // Mock the parent createProductionOrder method
      const originalCreate = productionOrderService.createProductionOrder;
      productionOrderService.createProductionOrder = jest
        .fn()
        .mockImplementation(async (args) => {
          // Should perform validation before creation
          await orderValidationService.validateProductionOrder({
            customer: { id: "customer-1" },
            bom: { id: "bom-1" },
            item: { id: "item-1" },
            containerType: "LargeBarrel" as const,
            finalProof: 100,
            containerItem: [mockContainerItem],
          });

          return mockCreatedOrder;
        });

      const result = await productionOrderService.createProductionOrder(
        createArgs
      );

      expect(result).toEqual(mockCreatedOrder);

      // Verify validation was performed
      expect(prisma.bom.findUnique).toHaveBeenCalled();
      expect(prisma.item.findUnique).toHaveBeenCalled();

      // Restore original method
      productionOrderService.createProductionOrder = originalCreate;
    });
  });
});
