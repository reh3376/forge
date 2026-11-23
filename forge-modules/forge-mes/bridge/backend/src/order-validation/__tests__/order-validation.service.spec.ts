import { Test } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ContainerItemService } from "../../productionOrder/container-item.service";
import {
  OrderValidationService,
  ProductionOrderValidationData,
  ScheduleOrderValidationData,
} from "../order-validation.service";
import { EnumProductionOrderContainerType } from "@prisma/client";

describe("OrderValidationService", () => {
  let service: OrderValidationService;
  let prisma: any;
  let containerItemService: any;

  beforeEach(async () => {
    const mockPrisma = {
      productionOrder: {
        findUnique: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
      scheduleOrder: {
        findUnique: jest.fn(),
      },
      item: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      bom: {
        findUnique: jest.fn(),
      },
      recipe: {
        findUnique: jest.fn(),
      },
    };

    const mockContainerItemService = {
      validateContainerItemCompatibility: jest.fn(),
      getContainerItemsByType: jest.fn(),
      getContainerItemUsageStats: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        OrderValidationService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: ContainerItemService,
          useValue: mockContainerItemService,
        },
      ],
    }).compile();

    service = module.get<OrderValidationService>(OrderValidationService);
    prisma = module.get<PrismaService>(PrismaService);
    containerItemService =
      module.get<ContainerItemService>(ContainerItemService);
  });

  describe("validateProductionOrder", () => {
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
      itemGroup: "BARREL-53GAL", // This is a string, not an object
      itemName: "53-Gallon Oak Barrel",
      itemNumber: "BBL-53-001",
      itemRevision: 1,
      itemType: "CONTAINER",
      updatedAt: new Date(),
      updatedBy: "test-user",
      schemaVersion: "v1",
    } as any; // Use 'as any' to avoid having to mock all relations

    const validProductionOrderData: ProductionOrderValidationData = {
      customer: { id: "customer-1" },
      bom: { id: "bom-1" },
      item: { id: "item-1" },
      containerType: "LargeBarrel" as EnumProductionOrderContainerType,
      finalProof: 100,
      containerItem: [mockContainerItem],
    };

    it("should validate successfully with valid data", async () => {
      // Mock BOM validation
      prisma.bom.findUnique.mockResolvedValue({
        id: "bom-1",
        bomType: "ProductionBom",
      });

      // Mock container item validation
      containerItemService.validateContainerItemCompatibility.mockResolvedValue(
        {
          isValid: true,
        }
      );

      await expect(
        service.validateProductionOrder(validProductionOrderData)
      ).resolves.not.toThrow();

      expect(
        containerItemService.validateContainerItemCompatibility
      ).toHaveBeenCalledWith(mockContainerItem.id, "LargeBarrel");
    });

    it("should throw error when customer is missing", async () => {
      const invalidData = {
        ...validProductionOrderData,
        customer: { id: "" },
      };

      await expect(
        service.validateProductionOrder(invalidData)
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw error when BOM is missing", async () => {
      const invalidData = {
        ...validProductionOrderData,
        bom: { id: "" },
      };

      await expect(
        service.validateProductionOrder(invalidData)
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw error when final proof is invalid", async () => {
      const invalidData = {
        ...validProductionOrderData,
        finalProof: 0,
      };

      await expect(
        service.validateProductionOrder(invalidData)
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw error when container item is missing for barrel types", async () => {
      const invalidData = {
        ...validProductionOrderData,
        containerItem: [],
      };

      await expect(
        service.validateProductionOrder(invalidData)
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw error when multiple container items are selected", async () => {
      const secondMockItem = { ...mockContainerItem, id: "item-2" };
      const invalidData = {
        ...validProductionOrderData,
        containerItem: [mockContainerItem, secondMockItem],
      };

      await expect(
        service.validateProductionOrder(invalidData)
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw error when container item is incompatible", async () => {
      // Mock BOM validation
      prisma.bom.findUnique.mockResolvedValue({
        id: "bom-1",
        bomType: "ProductionBom",
      });

      // Mock container item validation failure
      containerItemService.validateContainerItemCompatibility.mockResolvedValue(
        {
          isValid: false,
          message: "Item is not compatible with container type",
        }
      );

      await expect(
        service.validateProductionOrder(validProductionOrderData)
      ).rejects.toThrow(BadRequestException);
    });

    it("should allow non-barrel container types without container items", async () => {
      const validData = {
        ...validProductionOrderData,
        containerType: "BulkLoadout" as EnumProductionOrderContainerType,
        containerItem: [],
      };

      // Mock BOM validation
      prisma.bom.findUnique.mockResolvedValue({
        id: "bom-1",
        bomType: "ProductionBom",
      });

      await expect(
        service.validateProductionOrder(validData)
      ).resolves.not.toThrow();
    });

    it("should throw error when using Recipe BOM instead of Production BOM", async () => {
      // Mock BOM validation
      prisma.bom.findUnique.mockResolvedValue({
        id: "bom-1",
        bomType: "RecipeBom",
      });

      // Mock container item validation
      containerItemService.validateContainerItemCompatibility.mockResolvedValue(
        {
          isValid: true,
        }
      );

      await expect(
        service.validateProductionOrder(validProductionOrderData)
      ).rejects.toThrow(BadRequestException);
    });

    it("should validate mash bill consistency when both recipe and schedule order are provided", async () => {
      const dataWithMashBillMismatch = {
        ...validProductionOrderData,
        recipe: { id: "recipe-1", recipeGroupId: "group-1" },
        scheduleOrder: { id: "schedule-1", recipeGroup: { id: "group-2" } },
      };

      // Mock BOM validation
      prisma.bom.findUnique.mockResolvedValue({
        id: "bom-1",
        bomType: "ProductionBom",
      });

      // Mock container item validation
      containerItemService.validateContainerItemCompatibility.mockResolvedValue(
        {
          isValid: true,
        }
      );

      await expect(
        service.validateProductionOrder(dataWithMashBillMismatch)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("validateScheduleOrder", () => {
    const validScheduleOrderData: ScheduleOrderValidationData = {
      recipeGroup: { id: "group-1" },
      scheduleOrderRecipe: { id: "recipe-1" },
    };

    it("should validate successfully with complete Recipe BOM", async () => {
      // Mock recipe with complete BOM
      prisma.recipe.findUnique.mockResolvedValue({
        id: "recipe-1",
        recipeBoms: [
          {
            recipeBomITem: [
              {
                item: {
                  category: "GRAIN_CORN",
                },
              },
              {
                item: {
                  category: "ADDITIVE_ENZYME",
                },
              },
              {
                item: {
                  category: "YEAST_DISTILLERS",
                },
              },
            ],
          },
        ],
      });

      await expect(
        service.validateScheduleOrder(validScheduleOrderData)
      ).resolves.not.toThrow();
    });

    it("should throw error when Recipe BOM is missing", async () => {
      const invalidData = {
        ...validScheduleOrderData,
        scheduleOrderRecipe: undefined,
      };

      await expect(service.validateScheduleOrder(invalidData)).rejects.toThrow(
        BadRequestException
      );
    });

    it("should throw error when Recipe BOM lacks mashing additives", async () => {
      // Mock recipe missing additives
      prisma.recipe.findUnique.mockResolvedValue({
        id: "recipe-1",
        recipeBoms: [
          {
            recipeBomITem: [
              {
                item: {
                  category: "GRAIN_CORN",
                },
              },
              {
                item: {
                  category: "YEAST_DISTILLERS",
                },
              },
            ],
          },
        ],
      });

      await expect(
        service.validateScheduleOrder(validScheduleOrderData)
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw error when Recipe BOM lacks yeast", async () => {
      // Mock recipe missing yeast
      prisma.recipe.findUnique.mockResolvedValue({
        id: "recipe-1",
        recipeBoms: [
          {
            recipeBomITem: [
              {
                item: {
                  category: "GRAIN_CORN",
                },
              },
              {
                item: {
                  category: "ADDITIVE_ENZYME",
                },
              },
            ],
          },
        ],
      });

      await expect(
        service.validateScheduleOrder(validScheduleOrderData)
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw error when Recipe BOM lacks grain", async () => {
      // Mock recipe missing grain
      prisma.recipe.findUnique.mockResolvedValue({
        id: "recipe-1",
        recipeBoms: [
          {
            recipeBomITem: [
              {
                item: {
                  category: "ADDITIVE_ENZYME",
                },
              },
              {
                item: {
                  category: "YEAST_DISTILLERS",
                },
              },
            ],
          },
        ],
      });

      await expect(
        service.validateScheduleOrder(validScheduleOrderData)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("validateCrossOrderConsistency", () => {
    it("should validate successfully when mash bills match", async () => {
      const scheduleOrderId = "schedule-1";
      const productionOrderIds = ["prod-1", "prod-2"];

      // Mock schedule order
      prisma.scheduleOrder.findUnique.mockResolvedValue({
        id: scheduleOrderId,
        recipeGroup: { id: "group-1" },
        scheduleOrderRecipe: {
          recipeBoms: [
            {
              recipeBomITem: [
                {
                  item: {
                    category: "GRAIN_CORN",
                  },
                },
              ],
            },
          ],
        },
      });

      // Mock production orders with matching mash bill
      prisma.productionOrder.findUnique
        .mockResolvedValueOnce({
          id: "prod-1",
          recipe: {
            recipeGroupId: "group-1",
          },
        })
        .mockResolvedValueOnce({
          id: "prod-2",
          recipe: {
            recipeGroupId: "group-1",
          },
        });

      await expect(
        service.validateCrossOrderConsistency(
          scheduleOrderId,
          productionOrderIds
        )
      ).resolves.not.toThrow();
    });

    it("should throw error when mash bills don't match", async () => {
      const scheduleOrderId = "schedule-1";
      const productionOrderIds = ["prod-1"];

      // Mock schedule order
      prisma.scheduleOrder.findUnique.mockResolvedValue({
        id: scheduleOrderId,
        recipeGroup: { id: "group-1" },
        scheduleOrderRecipe: {
          recipeBoms: [
            {
              recipeBomITem: [],
            },
          ],
        },
      });

      // Mock production order with different mash bill
      prisma.productionOrder.findUnique.mockResolvedValue({
        id: "prod-1",
        recipe: {
          recipeGroupId: "group-2",
        },
      });

      await expect(
        service.validateCrossOrderConsistency(
          scheduleOrderId,
          productionOrderIds
        )
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw error when schedule order is not found", async () => {
      const scheduleOrderId = "schedule-1";
      const productionOrderIds = ["prod-1"];

      // Mock schedule order not found
      prisma.scheduleOrder.findUnique.mockResolvedValue(null);

      await expect(
        service.validateCrossOrderConsistency(
          scheduleOrderId,
          productionOrderIds
        )
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("getAvailableContainerItems", () => {
    it("should delegate to ContainerItemService", async () => {
      const containerType = "LargeBarrel" as EnumProductionOrderContainerType;
      const expectedItems = [
        {
          id: "item-1",
          itemName: "53-Gallon Barrel",
          itemNumber: "BBL-53-001",
        },
      ];

      containerItemService.getContainerItemsByType.mockResolvedValue(
        expectedItems
      );

      const result = await service.getAvailableContainerItems(containerType);

      expect(containerItemService.getContainerItemsByType).toHaveBeenCalledWith(
        containerType
      );
      expect(result).toEqual(expectedItems);
    });
  });
});
