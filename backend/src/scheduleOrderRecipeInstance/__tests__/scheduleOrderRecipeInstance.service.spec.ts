import { Test } from "@nestjs/testing";
import { ScheduleOrderRecipeInstanceService } from "../scheduleOrderRecipeInstance.service";
import { PrismaService } from "../../prisma/prisma.service";
import { BomCalculationService } from "../../recipeBom/bom-calculation.service";
import { AuditService } from "../../audit/audit.service";
import { ProductionEventService } from "../../productionEvent/productionEvent.service";
import { BatchDeviationService } from "../../batchDeviation/batchDeviation.service";
import { ClsService } from "nestjs-cls";
import {
  EnumRecipeInstanceStatus,
  EnumProductionPhase,
  EnumBomCalculationMode,
  EnumBomFormulaType,
} from "@prisma/client";

describe("ScheduleOrderRecipeInstanceService", () => {
  let service: ScheduleOrderRecipeInstanceService;
  let prisma: any;

  const mockScheduleOrder = {
    id: "so-1",
    totalGrainWeight: 3000,
    totalWaterVolume: 241,
    scheduleOrderRecipe: {
      id: "recipe-1",
      customerCode: "70-21-00-09",
      recipeBoms: [
        {
          id: "bom-1",
          revision: 1,
          recipeBomITem: [
            {
              id: "item-1",
              itemId: "grain-1",
              quantity: 70,
              operation: "Add",
              displayUnitsId: "units-1",
              item: {
                id: "grain-1",
                itemName: "Corn",
                itemGroup: "RM-GR-CORN",
              },
              displayUnits: { id: "units-1" },
              // Formula configuration
              calculationMode: EnumBomCalculationMode.FORMULA_GRAIN,
              formulaType: EnumBomFormulaType.SIMPLE_RATIO,
              formulaMultiplier: 0.7,
              customExpression: null,
              formulaLibraryId: null,
              expressionVariables: null,
              expressionValidated: null,
            },
          ],
        },
      ],
      mashingProtocol: {
        id: "protocol-1",
        name: "Test Protocol",
        revision: 1,
        templateCategory: "Bourbon",
        templateDescription: "Test Description",
        steps: [
          {
            id: "step-1",
            index: 0,
            stepType: "Slurry",
            holdType: "Temperature",
            stepTime: 30,
            temperatureSetpoint: 160,
            heatEnabled: true,
            heatTempSp: 165,
            coolEnabled: false,
            coolTempSp: null,
            agitatorEnabled: true,
            agitatorSpdSp: 50,
            promptMessage: null,
            recipeBomItem: null,
          },
        ],
      },
    },
    productionOrders: [{ id: "po-1" }],
    scheduleOrderRecipeInstance: null,
  };

  const mockInstance = {
    id: "instance-1",
    scheduleOrderId: "so-1",
    recipeId: "recipe-1",
    status: EnumRecipeInstanceStatus.Created,
    currentPhase: EnumProductionPhase.Mashing,
    separationStarted: false,
    separationCompletedAt: null,
    createdBy: "test-user",
    createdAt: new Date(),
  };

  const mockBomCalculationService = {
    calculateInitialBomQuantities: jest.fn().mockResolvedValue(undefined),
  };

  const mockAuditService = {
    logAction: jest.fn().mockResolvedValue(undefined),
  };

  const mockClsService = {
    get: jest.fn(),
    set: jest.fn(),
  };

  beforeEach(async () => {
    const mockPrisma: any = {
      $transaction: jest.fn((callback: any) => callback(mockPrisma)),
      scheduleOrder: {
        findUnique: jest.fn(),
      },
      scheduleOrderRecipeInstance: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      recipeBom: {
        create: jest.fn(),
      },
      recipeBomItem: {
        create: jest.fn(),
      },
      mashingProtocol: {
        create: jest.fn(),
      },
      mashingProtocolStep: {
        create: jest.fn(),
      },
      recipeParameter: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        ScheduleOrderRecipeInstanceService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: BomCalculationService,
          useValue: mockBomCalculationService,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: ClsService,
          useValue: mockClsService,
        },
        {
          provide: ProductionEventService,
          useValue: { findMany: jest.fn() },
        },
        {
          provide: BatchDeviationService,
          useValue: { findMany: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ScheduleOrderRecipeInstanceService>(
      ScheduleOrderRecipeInstanceService
    );
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe("createFromScheduleOrder", () => {
    it("should create a new instance when schedule order exists", async () => {
      prisma.scheduleOrder.findUnique.mockResolvedValue(mockScheduleOrder);
      prisma.scheduleOrderRecipeInstance.create.mockResolvedValue(mockInstance);
      prisma.recipeBom.create.mockResolvedValue({ id: "new-bom-1" });
      prisma.recipeBomItem.create.mockResolvedValue({ id: "new-item-1" });
      prisma.mashingProtocol.create.mockResolvedValue({
        id: "new-protocol-1",
      });
      prisma.mashingProtocolStep.create.mockResolvedValue({ id: "new-step-1" });
      prisma.scheduleOrderRecipeInstance.findUnique.mockResolvedValue({
        ...mockInstance,
        scheduleOrder: mockScheduleOrder,
        recipe: mockScheduleOrder.scheduleOrderRecipe,
      });

      const result = await service.createFromScheduleOrder("so-1", "test-user");

      expect(prisma.scheduleOrder.findUnique).toHaveBeenCalledWith({
        where: { id: "so-1" },
        include: expect.any(Object),
      });
      expect(prisma.scheduleOrderRecipeInstance.create).toHaveBeenCalledWith({
        data: {
          scheduleOrder: { connect: { id: "so-1" } },
          recipe: { connect: { id: "recipe-1" } },
          status: EnumRecipeInstanceStatus.Created,
          currentPhase: EnumProductionPhase.Mashing,
          createdBy: "test-user",
        },
      });
      expect(result).toBeDefined();
    });

    it("should return existing instance if one already exists", async () => {
      const existingInstance = { ...mockInstance };
      prisma.scheduleOrder.findUnique.mockResolvedValue({
        ...mockScheduleOrder,
        scheduleOrderRecipeInstance: existingInstance,
      });

      const result = await service.createFromScheduleOrder("so-1", "test-user");

      expect(result).toEqual(existingInstance);
      expect(prisma.scheduleOrderRecipeInstance.create).not.toHaveBeenCalled();
    });

    it("should throw error if schedule order not found", async () => {
      prisma.scheduleOrder.findUnique.mockResolvedValue(null);

      await expect(
        service.createFromScheduleOrder("non-existent", "test-user")
      ).rejects.toThrow("Schedule order with id non-existent not found");
    });

    it("should throw error if schedule order has no recipe", async () => {
      prisma.scheduleOrder.findUnique.mockResolvedValue({
        ...mockScheduleOrder,
        scheduleOrderRecipe: null,
      });

      await expect(
        service.createFromScheduleOrder("so-1", "test-user")
      ).rejects.toThrow("No recipe found for schedule order so-1");
    });

    it("should create RecipeBom copies for the instance", async () => {
      prisma.scheduleOrder.findUnique.mockResolvedValue(mockScheduleOrder);
      prisma.scheduleOrderRecipeInstance.create.mockResolvedValue(mockInstance);
      prisma.recipeBom.create.mockResolvedValue({ id: "new-bom-1" });
      prisma.recipeBomItem.create.mockResolvedValue({ id: "new-item-1" });
      prisma.mashingProtocol.create.mockResolvedValue({
        id: "new-protocol-1",
      });
      prisma.mashingProtocolStep.create.mockResolvedValue({ id: "new-step-1" });
      prisma.scheduleOrderRecipeInstance.findUnique.mockResolvedValue(
        mockInstance
      );

      await service.createFromScheduleOrder("so-1", "test-user");

      expect(prisma.recipeBom.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          revision: 1,
          master: false,
          running: true,
          masterRecipeBom: { connect: { id: "bom-1" } },
          scheduleOrderRecipeInstance: { connect: { id: "instance-1" } },
        }),
      });
    });

    it("should copy formula configuration from master BOM items to instance BOM items", async () => {
      prisma.scheduleOrder.findUnique.mockResolvedValue(mockScheduleOrder);
      prisma.scheduleOrderRecipeInstance.create.mockResolvedValue(mockInstance);
      prisma.recipeBom.create.mockResolvedValue({ id: "new-bom-1" });
      prisma.recipeBomItem.create.mockResolvedValue({ id: "new-item-1" });
      prisma.mashingProtocol.create.mockResolvedValue({
        id: "new-protocol-1",
      });
      prisma.mashingProtocolStep.create.mockResolvedValue({ id: "new-step-1" });
      prisma.scheduleOrderRecipeInstance.findUnique.mockResolvedValue(
        mockInstance
      );

      await service.createFromScheduleOrder("so-1", "test-user");

      // Verify formula configuration fields are copied
      expect(prisma.recipeBomItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          quantity: 70,
          operation: "Add",
          // Formula configuration should be copied from master (only truthy values)
          calculationMode: EnumBomCalculationMode.FORMULA_GRAIN,
          formulaType: EnumBomFormulaType.SIMPLE_RATIO,
          formulaMultiplier: 0.7,
        }),
      });
    });

    it("should create MashingProtocol copies for the instance", async () => {
      prisma.scheduleOrder.findUnique.mockResolvedValue(mockScheduleOrder);
      prisma.scheduleOrderRecipeInstance.create.mockResolvedValue(mockInstance);
      prisma.recipeBom.create.mockResolvedValue({ id: "new-bom-1" });
      prisma.recipeBomItem.create.mockResolvedValue({ id: "new-item-1" });
      prisma.mashingProtocol.create.mockResolvedValue({
        id: "new-protocol-1",
      });
      prisma.mashingProtocolStep.create.mockResolvedValue({ id: "new-step-1" });
      prisma.scheduleOrderRecipeInstance.findUnique.mockResolvedValue(
        mockInstance
      );

      await service.createFromScheduleOrder("so-1", "test-user");

      expect(prisma.mashingProtocol.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isTemplate: false,
          master: false,
          running: true,
          masterMashingProtocol: { connect: { id: "protocol-1" } },
          scheduleOrderRecipeInstance: { connect: { id: "instance-1" } },
        }),
      });
    });
  });

  describe("transitionToPhase", () => {
    it("should update instance phase", async () => {
      prisma.scheduleOrderRecipeInstance.findUnique.mockResolvedValue(
        mockInstance
      );
      prisma.scheduleOrderRecipeInstance.update.mockResolvedValue({
        ...mockInstance,
        currentPhase: EnumProductionPhase.Fermentation,
      });

      const result = await service.transitionToPhase(
        "instance-1",
        EnumProductionPhase.Fermentation
      );

      expect(prisma.scheduleOrderRecipeInstance.update).toHaveBeenCalledWith({
        where: { id: "instance-1" },
        data: {
          currentPhase: EnumProductionPhase.Fermentation,
          status: EnumRecipeInstanceStatus.Created,
          separationStarted: false,
        },
      });
      expect(result.currentPhase).toBe(EnumProductionPhase.Fermentation);
    });

    it("should set status to InSeparation when transitioning to Barreling", async () => {
      prisma.scheduleOrderRecipeInstance.findUnique.mockResolvedValue(
        mockInstance
      );
      prisma.scheduleOrderRecipeInstance.update.mockResolvedValue({
        ...mockInstance,
        currentPhase: EnumProductionPhase.Barreling,
        status: EnumRecipeInstanceStatus.InSeparation,
        separationStarted: true,
      });

      const result = await service.transitionToPhase(
        "instance-1",
        EnumProductionPhase.Barreling
      );

      expect(prisma.scheduleOrderRecipeInstance.update).toHaveBeenCalledWith({
        where: { id: "instance-1" },
        data: {
          currentPhase: EnumProductionPhase.Barreling,
          status: EnumRecipeInstanceStatus.InSeparation,
          separationStarted: true,
        },
      });
      expect(result.separationStarted).toBe(true);
    });

    it("should throw error if instance not found", async () => {
      prisma.scheduleOrderRecipeInstance.findUnique.mockResolvedValue(null);

      await expect(
        service.transitionToPhase("non-existent", EnumProductionPhase.Mashing)
      ).rejects.toThrow("ScheduleOrderRecipeInstance non-existent not found");
    });
  });

  describe("getActualsSummary", () => {
    const mockInstanceWithActuals = {
      ...mockInstance,
      recipeBomActuals: [
        {
          id: "bom-actual-1",
          quantityPlanned: 100,
          quantityActual: 98,
          lotNumber: "LOT-001",
          recipeBomItem: { itemId: "grain-1", item: { itemName: "Corn" } },
        },
        {
          id: "bom-actual-2",
          quantityPlanned: 100,
          quantityActual: 102,
          lotNumber: "LOT-002",
          recipeBomItem: { itemId: "grain-1", item: { itemName: "Corn" } },
        },
        {
          id: "bom-actual-3",
          quantityPlanned: 50,
          quantityActual: 50,
          lotNumber: "LOT-003",
          recipeBomItem: { itemId: "grain-2", item: { itemName: "Rye" } },
        },
      ],
      recipeParameterActuals: [
        {
          id: "param-actual-1",
          valuePlanned: 160,
          valueActual: 162,
          recipeParameter: {
            recipeParamName: "mashTemp",
            parameterCategory: "Input",
          },
        },
        {
          id: "param-actual-2",
          valuePlanned: null,
          valueActual: 1000,
          recipeParameter: {
            recipeParamName: "totalWineGallons",
            parameterCategory: "Output",
          },
        },
        {
          id: "param-actual-3",
          valuePlanned: null,
          valueActual: 1275,
          recipeParameter: {
            recipeParamName: "totalProofGallons",
            parameterCategory: "Output",
          },
        },
      ],
    };

    it("should aggregate BOM actuals by item", async () => {
      prisma.scheduleOrderRecipeInstance.findUnique.mockResolvedValue(
        mockInstanceWithActuals
      );

      const result = await service.getActualsSummary("instance-1");

      expect(result.bomActuals).toHaveLength(2);

      const corn = result.bomActuals.find((b) => b.itemId === "grain-1");
      expect(corn).toBeDefined();
      expect(corn!.totalQuantityPlanned).toBe(200);
      expect(corn!.totalQuantityActual).toBe(200);
      expect(corn!.lots).toContain("LOT-001");
      expect(corn!.lots).toContain("LOT-002");

      const rye = result.bomActuals.find((b) => b.itemId === "grain-2");
      expect(rye).toBeDefined();
      expect(rye!.totalQuantityActual).toBe(50);
    });

    it("should include parameter actuals", async () => {
      prisma.scheduleOrderRecipeInstance.findUnique.mockResolvedValue(
        mockInstanceWithActuals
      );

      const result = await service.getActualsSummary("instance-1");

      expect(result.parameterActuals).toHaveLength(3);
      const mashTemp = result.parameterActuals.find(
        (p) => p.parameterName === "mashTemp"
      );
      expect(mashTemp).toBeDefined();
      expect(mashTemp!.valuePlanned).toBe(160);
      expect(mashTemp!.valueActual).toBe(162);
    });

    it("should calculate yields from output parameters", async () => {
      prisma.scheduleOrderRecipeInstance.findUnique.mockResolvedValue(
        mockInstanceWithActuals
      );

      const result = await service.getActualsSummary("instance-1");

      expect(result.yields.totalWineGallons).toBe(1000);
      expect(result.yields.totalProofGallons).toBe(1275);
    });

    it("should throw error if instance not found", async () => {
      prisma.scheduleOrderRecipeInstance.findUnique.mockResolvedValue(null);

      await expect(service.getActualsSummary("non-existent")).rejects.toThrow(
        "ScheduleOrderRecipeInstance non-existent not found"
      );
    });

    it("should handle empty actuals", async () => {
      prisma.scheduleOrderRecipeInstance.findUnique.mockResolvedValue({
        ...mockInstance,
        recipeBomActuals: [],
        recipeParameterActuals: [],
      });

      const result = await service.getActualsSummary("instance-1");

      expect(result.bomActuals).toHaveLength(0);
      expect(result.parameterActuals).toHaveLength(0);
      expect(result.yields.totalWineGallons).toBe(0);
      expect(result.yields.totalProofGallons).toBe(0);
    });
  });

  describe("markCompleted", () => {
    it("should update instance status to Completed", async () => {
      const completedInstance = {
        ...mockInstance,
        status: EnumRecipeInstanceStatus.Completed,
        separationCompletedAt: new Date(),
      };
      prisma.scheduleOrderRecipeInstance.update.mockResolvedValue(
        completedInstance
      );

      const result = await service.markCompleted("instance-1");

      expect(prisma.scheduleOrderRecipeInstance.update).toHaveBeenCalledWith({
        where: { id: "instance-1" },
        data: {
          status: EnumRecipeInstanceStatus.Completed,
          separationCompletedAt: expect.any(Date),
        },
      });
      expect(result.status).toBe(EnumRecipeInstanceStatus.Completed);
    });
  });

  describe("findByScheduleOrderId", () => {
    it("should find instance by schedule order id", async () => {
      prisma.scheduleOrderRecipeInstance.findUnique.mockResolvedValue(
        mockInstance
      );

      const result = await service.findByScheduleOrderId("so-1");

      expect(
        prisma.scheduleOrderRecipeInstance.findUnique
      ).toHaveBeenCalledWith({
        where: { scheduleOrderId: "so-1" },
      });
      expect(result).toEqual(mockInstance);
    });

    it("should return null if not found", async () => {
      prisma.scheduleOrderRecipeInstance.findUnique.mockResolvedValue(null);

      const result = await service.findByScheduleOrderId("non-existent");

      expect(result).toBeNull();
    });
  });

  describe("createFromScheduleOrderWithTransaction", () => {
    it("should create instance using provided transaction client", async () => {
      // Create a mock transaction client
      const mockTxClient: any = {
        scheduleOrder: {
          findUnique: jest.fn().mockResolvedValue(mockScheduleOrder),
        },
        scheduleOrderRecipeInstance: {
          create: jest.fn().mockResolvedValue(mockInstance),
          findUnique: jest.fn().mockResolvedValue({
            ...mockInstance,
            scheduleOrder: mockScheduleOrder,
            recipe: mockScheduleOrder.scheduleOrderRecipe,
          }),
        },
        recipeBom: {
          create: jest.fn().mockResolvedValue({ id: "new-bom-1" }),
        },
        recipeBomItem: {
          create: jest.fn().mockResolvedValue({ id: "new-item-1" }),
        },
        mashingProtocol: {
          create: jest.fn().mockResolvedValue({ id: "new-protocol-1" }),
        },
        mashingProtocolStep: {
          create: jest.fn().mockResolvedValue({ id: "new-step-1" }),
        },
      };

      const result = await service.createFromScheduleOrderWithTransaction(
        mockTxClient,
        "so-1",
        "test-user"
      );

      // Verify the transaction client was used, not the regular prisma
      expect(mockTxClient.scheduleOrder.findUnique).toHaveBeenCalledWith({
        where: { id: "so-1" },
        include: expect.any(Object),
      });
      expect(
        mockTxClient.scheduleOrderRecipeInstance.create
      ).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it("should throw error if schedule order not found using transaction client", async () => {
      const mockTxClient: any = {
        scheduleOrder: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };

      await expect(
        service.createFromScheduleOrderWithTransaction(
          mockTxClient,
          "non-existent",
          "test-user"
        )
      ).rejects.toThrow("Schedule order with id non-existent not found");
    });

    it("should throw error if schedule order has no recipe using transaction client", async () => {
      const mockTxClient: any = {
        scheduleOrder: {
          findUnique: jest.fn().mockResolvedValue({
            ...mockScheduleOrder,
            scheduleOrderRecipe: null,
          }),
        },
      };

      await expect(
        service.createFromScheduleOrderWithTransaction(
          mockTxClient,
          "so-1",
          "test-user"
        )
      ).rejects.toThrow("No recipe found for schedule order so-1");
    });

    it("should return existing instance if one already exists using transaction client", async () => {
      const existingInstance = { ...mockInstance };
      const mockTxClient: any = {
        scheduleOrder: {
          findUnique: jest.fn().mockResolvedValue({
            ...mockScheduleOrder,
            scheduleOrderRecipeInstance: existingInstance,
          }),
        },
        scheduleOrderRecipeInstance: {
          create: jest.fn(),
        },
      };

      const result = await service.createFromScheduleOrderWithTransaction(
        mockTxClient,
        "so-1",
        "test-user"
      );

      expect(result).toEqual(existingInstance);
      expect(
        mockTxClient.scheduleOrderRecipeInstance.create
      ).not.toHaveBeenCalled();
    });
  });
});
