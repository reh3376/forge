import { Test } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { OrderValidationService } from "../../order-validation/order-validation.service";
import { ScheduleOrderGroupingService } from "../schedule-order-grouping.service";
import { ScheduleOrderRecipeInstanceService } from "../../scheduleOrderRecipeInstance/scheduleOrderRecipeInstance.service";
import { YieldEstimationService } from "../../yieldEstimation/yieldEstimation.service";
import { EnumProductionOrderContainerType } from "@prisma/client";

describe("ScheduleOrderGroupingService", () => {
  let service: ScheduleOrderGroupingService;
  let prisma: any;
  let orderValidationService: any;
  let scheduleOrderRecipeInstanceService: any;

  beforeEach(async () => {
    const mockPrisma: any = {
      productionOrder: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      scheduleOrder: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      recipeGroup: {
        findUnique: jest.fn(),
      },
    };
    // Add $transaction after to avoid circular reference issue
    mockPrisma.$transaction = jest.fn((callback: any) => callback(mockPrisma));

    const mockOrderValidationService = {
      validateCrossOrderConsistency: jest.fn(),
    };

    const mockScheduleOrderRecipeInstanceService = {
      createFromScheduleOrder: jest.fn(),
      createFromScheduleOrderWithTransaction: jest.fn(),
    };

    const mockYieldEstimationService = {
      calculateYieldEstimate: jest.fn().mockResolvedValue({
        estimatedPGsPerBushel: 5.2,
        estimatedPGsPerBbl: 66.34,
        estimatedBarrelsPerFermenter: 100,
        totalProofGallons: 33170,
        totalGrainWeight: 414000,
        totalCooks: 6,
        totalFermenters: 2,
        grainUnitsPerFerm: 1232.14,
        pgPerFerm: 6407.14,
        totalBarrels: 500,
        plannedCooks: 6,
        plannedFermenters: 2,
        metricsUsed: [],
      }),
      previewYieldEstimate: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        ScheduleOrderGroupingService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: OrderValidationService,
          useValue: mockOrderValidationService,
        },
        {
          provide: ScheduleOrderRecipeInstanceService,
          useValue: mockScheduleOrderRecipeInstanceService,
        },
        {
          provide: YieldEstimationService,
          useValue: mockYieldEstimationService,
        },
      ],
    }).compile();

    service = module.get<ScheduleOrderGroupingService>(
      ScheduleOrderGroupingService
    );
    prisma = module.get<PrismaService>(PrismaService);
    orderValidationService = module.get<OrderValidationService>(
      OrderValidationService
    );
    scheduleOrderRecipeInstanceService =
      module.get<ScheduleOrderRecipeInstanceService>(
        ScheduleOrderRecipeInstanceService
      );
  });

  describe("validateProductionOrderGrouping", () => {
    const mockProductionOrders = [
      {
        id: "po-1",
        name: "Production Order 1",
        recipe: {
          id: "recipe-1",
          recipeGroup: { id: "group-1", recipe: "Mash Bill 1" },
        },
        customer: { id: "customer-1", name: "Customer A" },
        containerType: EnumProductionOrderContainerType.LargeBarrel,
        finalProof: 100,
        scheduleOrderId: null,
        scheduled: false,
      },
      {
        id: "po-2",
        name: "Production Order 2",
        recipe: {
          id: "recipe-2",
          recipeGroup: { id: "group-1", recipe: "Mash Bill 1" },
        },
        customer: { id: "customer-1", name: "Customer A" },
        containerType: EnumProductionOrderContainerType.LargeBarrel,
        finalProof: 100,
        scheduleOrderId: null,
        scheduled: false,
      },
    ];

    it("should return compatible for orders with same mash bill", async () => {
      prisma.productionOrder.findMany.mockResolvedValue(mockProductionOrders);

      const result = await service.validateProductionOrderGrouping([
        "po-1",
        "po-2",
      ]);

      expect(result.isCompatible).toBe(true);
      expect(result.incompatibilityReasons).toHaveLength(0);
    });

    it("should return incompatible for empty order list", async () => {
      const result = await service.validateProductionOrderGrouping([]);

      expect(result.isCompatible).toBe(false);
      expect(result.incompatibilityReasons).toContain(
        "At least one Production Order must be selected for grouping"
      );
    });

    it("should return incompatible for orders with different mash bills", async () => {
      const ordersWithDifferentMashBills = [
        {
          ...mockProductionOrders[0],
          recipe: {
            id: "recipe-1",
            recipeGroup: { id: "group-1", recipe: "Mash Bill 1" },
          },
        },
        {
          ...mockProductionOrders[1],
          recipe: {
            id: "recipe-2",
            recipeGroup: { id: "group-2", recipe: "Mash Bill 2" },
          },
        },
      ];

      prisma.productionOrder.findMany.mockResolvedValue(
        ordersWithDifferentMashBills
      );

      const result = await service.validateProductionOrderGrouping([
        "po-1",
        "po-2",
      ]);

      expect(result.isCompatible).toBe(false);
      expect(result.incompatibilityReasons).toContain(
        "All Production Orders must have the same mash bill (recipe group) for MES Phase 1"
      );
    });

    it("should return incompatible for orders that are already scheduled", async () => {
      const scheduledOrders = [
        {
          ...mockProductionOrders[0],
          scheduleOrderId: "schedule-1",
          scheduled: true,
        },
        { ...mockProductionOrders[1] },
      ];

      prisma.productionOrder.findMany.mockResolvedValue(scheduledOrders);

      const result = await service.validateProductionOrderGrouping([
        "po-1",
        "po-2",
      ]);

      expect(result.isCompatible).toBe(false);
      expect(result.incompatibilityReasons).toContain(
        "Production Orders already scheduled: po-1"
      );
    });

    it("should add warnings for different container types", async () => {
      const ordersWithDifferentContainers = [
        {
          ...mockProductionOrders[0],
          containerType: EnumProductionOrderContainerType.LargeBarrel,
        },
        {
          ...mockProductionOrders[1],
          containerType: EnumProductionOrderContainerType.SmallBarrel,
        },
      ];

      prisma.productionOrder.findMany.mockResolvedValue(
        ordersWithDifferentContainers
      );

      const result = await service.validateProductionOrderGrouping([
        "po-1",
        "po-2",
      ]);

      expect(result.isCompatible).toBe(true);
      expect(result.warnings).toContain(
        "Production Orders have different container types: LargeBarrel, SmallBarrel"
      );
    });

    it("should handle missing production orders", async () => {
      prisma.productionOrder.findMany.mockResolvedValue([
        mockProductionOrders[0],
      ]); // Only return one order

      const result = await service.validateProductionOrderGrouping([
        "po-1",
        "po-2",
      ]);

      expect(result.isCompatible).toBe(false);
      expect(result.incompatibilityReasons).toContain(
        "Production Orders not found: po-2"
      );
    });
  });

  describe("createScheduleOrderFromProductionOrders", () => {
    const mockRecipeGroup = {
      id: "group-1",
      recipe: "Test Mash Bill",
    };

    const mockCreatedScheduleOrder = {
      id: "schedule-1",
      name: "SchO-Test Mash Bill-2024-01-01",
      recipeName: "Test Mash Bill",
      recipeGroup: mockRecipeGroup,
      productionOrders: [],
      totalCooks: 6,
      totalFermenters: 2,
    };

    it("should create schedule order from compatible production orders", async () => {
      // Mock successful validation
      jest.spyOn(service, "validateProductionOrderGrouping").mockResolvedValue({
        isCompatible: true,
        incompatibilityReasons: [],
        warnings: [],
      });

      const mockProductionOrders = [
        {
          id: "po-1",
          recipe: { id: "recipe-1", recipeGroup: { id: "group-1" } },
          customer: { id: "customer-1" },
        },
        {
          id: "po-2",
          recipe: { id: "recipe-2", recipeGroup: { id: "group-1" } },
          customer: { id: "customer-1" },
        },
      ];

      prisma.productionOrder.findMany.mockResolvedValue(mockProductionOrders);
      prisma.recipeGroup.findUnique.mockResolvedValue(mockRecipeGroup);
      prisma.scheduleOrder.create.mockResolvedValue(mockCreatedScheduleOrder);
      prisma.productionOrder.updateMany.mockResolvedValue({});
      scheduleOrderRecipeInstanceService.createFromScheduleOrderWithTransaction.mockResolvedValue(
        { id: "instance-1" }
      );

      const result = await service.createScheduleOrderFromProductionOrders({
        productionOrderIds: ["po-1", "po-2"],
        recipeGroupId: "group-1",
      });

      expect(result).toEqual(mockCreatedScheduleOrder);
      expect(prisma.scheduleOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recipeName: "Test Mash Bill",
            totalCooks: 6,
            totalFermenters: 2,
          }),
        })
      );

      // Verify production orders were linked
      expect(prisma.productionOrder.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["po-1", "po-2"] } },
        data: {
          scheduleOrderId: "schedule-1",
          scheduled: true,
        },
      });

      // Verify ScheduleOrderRecipeInstance was created within the transaction
      expect(
        scheduleOrderRecipeInstanceService.createFromScheduleOrderWithTransaction
      ).toHaveBeenCalledWith(
        expect.anything(), // tx client
        "schedule-1",
        "system"
      );
    });

    it("should create ScheduleOrderRecipeInstance atomically with ScheduleOrder", async () => {
      jest.spyOn(service, "validateProductionOrderGrouping").mockResolvedValue({
        isCompatible: true,
        incompatibilityReasons: [],
        warnings: [],
      });

      const mockProductionOrders = [
        {
          id: "po-1",
          recipe: { id: "recipe-1" },
          customer: { id: "customer-1" },
        },
      ];

      prisma.productionOrder.findMany.mockResolvedValue(mockProductionOrders);
      prisma.recipeGroup.findUnique.mockResolvedValue(mockRecipeGroup);
      prisma.scheduleOrder.create.mockResolvedValue(mockCreatedScheduleOrder);
      prisma.productionOrder.updateMany.mockResolvedValue({});
      scheduleOrderRecipeInstanceService.createFromScheduleOrderWithTransaction.mockResolvedValue(
        { id: "instance-1" }
      );

      await service.createScheduleOrderFromProductionOrders({
        productionOrderIds: ["po-1"],
        recipeGroupId: "group-1",
      });

      // Verify transaction was used
      expect(prisma.$transaction).toHaveBeenCalled();

      // Verify instance creation was called with transaction client
      expect(
        scheduleOrderRecipeInstanceService.createFromScheduleOrderWithTransaction
      ).toHaveBeenCalledTimes(1);
    });

    it("should roll back ScheduleOrder creation if ScheduleOrderRecipeInstance creation fails", async () => {
      jest.spyOn(service, "validateProductionOrderGrouping").mockResolvedValue({
        isCompatible: true,
        incompatibilityReasons: [],
        warnings: [],
      });

      const mockProductionOrders = [
        {
          id: "po-1",
          recipe: { id: "recipe-1" },
          customer: { id: "customer-1" },
        },
      ];

      prisma.productionOrder.findMany.mockResolvedValue(mockProductionOrders);
      prisma.recipeGroup.findUnique.mockResolvedValue(mockRecipeGroup);
      prisma.scheduleOrder.create.mockResolvedValue(mockCreatedScheduleOrder);
      prisma.productionOrder.updateMany.mockResolvedValue({});

      // Mock instance creation failure
      const instanceError = new Error(
        "Failed to create recipe instance - no recipe found"
      );
      scheduleOrderRecipeInstanceService.createFromScheduleOrderWithTransaction.mockRejectedValue(
        instanceError
      );

      // Mock $transaction to properly propagate the error
      prisma.$transaction.mockImplementation(async (callback: any) => {
        return callback(prisma);
      });

      await expect(
        service.createScheduleOrderFromProductionOrders({
          productionOrderIds: ["po-1"],
          recipeGroupId: "group-1",
        })
      ).rejects.toThrow("Failed to create recipe instance");
    });

    it("should throw error for incompatible production orders", async () => {
      jest.spyOn(service, "validateProductionOrderGrouping").mockResolvedValue({
        isCompatible: false,
        incompatibilityReasons: ["Different mash bills"],
        warnings: [],
      });

      await expect(
        service.createScheduleOrderFromProductionOrders({
          productionOrderIds: ["po-1", "po-2"],
          recipeGroupId: "group-1",
        })
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw error when recipe group not found", async () => {
      jest.spyOn(service, "validateProductionOrderGrouping").mockResolvedValue({
        isCompatible: true,
        incompatibilityReasons: [],
        warnings: [],
      });

      prisma.productionOrder.findMany.mockResolvedValue([]);
      prisma.recipeGroup.findUnique.mockResolvedValue(null);

      await expect(
        service.createScheduleOrderFromProductionOrders({
          productionOrderIds: ["po-1"],
          recipeGroupId: "non-existent-group",
        })
      ).rejects.toThrow(BadRequestException);
    });

    it("should use provided schedule name", async () => {
      jest.spyOn(service, "validateProductionOrderGrouping").mockResolvedValue({
        isCompatible: true,
        incompatibilityReasons: [],
        warnings: [],
      });

      const mockProductionOrders = [
        {
          id: "po-1",
          recipe: { id: "recipe-1" },
          customer: { id: "customer-1" },
        },
      ];
      prisma.productionOrder.findMany.mockResolvedValue(mockProductionOrders);
      prisma.recipeGroup.findUnique.mockResolvedValue(mockRecipeGroup);
      prisma.scheduleOrder.create.mockResolvedValue({
        ...mockCreatedScheduleOrder,
        name: "Custom Schedule Name",
      });
      prisma.productionOrder.updateMany.mockResolvedValue({});

      await service.createScheduleOrderFromProductionOrders({
        productionOrderIds: ["po-1"],
        recipeGroupId: "group-1",
        scheduleName: "Custom Schedule Name",
      });

      expect(prisma.scheduleOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: expect.stringContaining("Custom Schedule Name"),
          }),
        })
      );
    });
  });

  describe("findCompatibleProductionOrders", () => {
    const mockBaseOrder = {
      id: "base-order",
      recipe: {
        id: "recipe-1",
        recipeGroup: { id: "group-1" },
        recipeGroupId: "group-1",
      },
    };

    it("should find compatible orders with same recipe group", async () => {
      const mockCompatibleOrders = [
        {
          id: "po-1",
          name: "Compatible Order 1",
          recipe: { recipeGroupId: "group-1" },
        },
        {
          id: "po-2",
          name: "Compatible Order 2",
          recipe: { recipeGroupId: "group-1" },
        },
      ];

      prisma.productionOrder.findUnique.mockResolvedValue(mockBaseOrder);
      prisma.productionOrder.findMany.mockResolvedValue(mockCompatibleOrders);

      const result = await service.findCompatibleProductionOrders("base-order");

      expect(result).toEqual(mockCompatibleOrders);
      expect(prisma.productionOrder.findMany).toHaveBeenCalledWith({
        where: {
          id: { not: "base-order" },
          scheduled: false,
          scheduleOrderId: null,
          recipe: {
            recipeGroupId: "group-1",
          },
        },
        include: expect.any(Object),
        take: 10,
        orderBy: { createdAt: "desc" },
      });
    });

    it("should return empty array when base order has no recipe group", async () => {
      const orderWithoutRecipeGroup = {
        id: "base-order",
        recipe: { id: "recipe-1", recipeGroup: null },
      };

      prisma.productionOrder.findUnique.mockResolvedValue(
        orderWithoutRecipeGroup
      );

      const result = await service.findCompatibleProductionOrders("base-order");

      expect(result).toEqual([]);
    });

    it("should throw error when base order not found", async () => {
      prisma.productionOrder.findUnique.mockResolvedValue(null);

      await expect(
        service.findCompatibleProductionOrders("non-existent")
      ).rejects.toThrow(BadRequestException);
    });

    it("should respect limit parameter", async () => {
      prisma.productionOrder.findUnique.mockResolvedValue(mockBaseOrder);
      prisma.productionOrder.findMany.mockResolvedValue([]);

      await service.findCompatibleProductionOrders("base-order", 5);

      expect(prisma.productionOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 })
      );
    });
  });
});
