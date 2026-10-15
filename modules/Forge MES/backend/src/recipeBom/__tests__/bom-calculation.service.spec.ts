import { Test, TestingModule } from "@nestjs/testing";
import { BomCalculationService, LoadInputs } from "../bom-calculation.service";
import { PrismaService } from "../../prisma/prisma.service";
import { EnzymeDosingService } from "../../recipe/enzyme.dosing";
import { ExpressionEngineService } from "../../expressionEngine/expression-engine.service";
import { FormulaLibraryService } from "../../formulaLibrary/formula-library.service";
import { AuditService } from "../../audit/audit.service";
import { EnumBomCalculationMode, EnumBomFormulaType } from "@prisma/client";

describe("BomCalculationService", () => {
  let service: BomCalculationService;
  let prismaService: jest.Mocked<PrismaService>;
  let enzymeDosingService: jest.Mocked<EnzymeDosingService>;
  let expressionEngineService: jest.Mocked<ExpressionEngineService>;
  let formulaLibraryService: jest.Mocked<FormulaLibraryService>;

  const mockPrisma = {
    recipeBomItem: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    recipeBomActual: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    scheduleOrder: {
      findUnique: jest.fn(),
    },
    scheduleOrderRecipeInstance: {
      findUnique: jest.fn(),
    },
    formulaExecutionLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };

  const mockEnzymeDosingService = {
    calculateNormalizedEnzymeDosing: jest.fn(),
  };

  const mockExpressionEngineService = {
    evaluate: jest.fn(),
    validateExpression: jest.fn(),
  };

  const mockFormulaLibraryService = {
    findById: jest.fn(),
    formulaLibrary: jest.fn(),
    formulaLibraries: jest.fn(),
  };

  const mockAuditService = {
    log: jest.fn(),
    getAuditLogs: jest.fn(),
    countAuditLogs: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BomCalculationService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: EnzymeDosingService,
          useValue: mockEnzymeDosingService,
        },
        {
          provide: ExpressionEngineService,
          useValue: mockExpressionEngineService,
        },
        {
          provide: FormulaLibraryService,
          useValue: mockFormulaLibraryService,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
      ],
    }).compile();

    service = module.get<BomCalculationService>(BomCalculationService);
    prismaService = module.get(PrismaService);
    enzymeDosingService = module.get(EnzymeDosingService);
    expressionEngineService = module.get(ExpressionEngineService);
    formulaLibraryService = module.get(FormulaLibraryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("calculateItemQuantity", () => {
    const testLoads: LoadInputs = {
      grainLoad: 3000,
      waterLoad: 241,
      mashBill: "70-21-00-09",
    };

    it("should handle STATIC calculation mode", async () => {
      const bomItem = {
        id: "test-id",
        calculationMode: EnumBomCalculationMode.STATIC,
        quantity: 500,
      } as any;

      const result = await service.calculateItemQuantity(bomItem, testLoads);

      expect(result.quantity).toBe(500);
      expect(result.formula).toBe("static");
    });

    it("should calculate SIMPLE_RATIO formula (grain percentage)", async () => {
      const bomItem = {
        id: "corn-item",
        calculationMode: EnumBomCalculationMode.FORMULA_GRAIN,
        formulaType: EnumBomFormulaType.SIMPLE_RATIO,
        formulaMultiplier: 0.7, // 70% corn
      } as any;

      const result = await service.calculateItemQuantity(bomItem, testLoads);

      expect(result.quantity).toBe(2100); // 3000 * 0.7
      expect(result.formula).toContain("3000 * 0.7");
    });

    it("should calculate WATER_PER_BUSHEL formula", async () => {
      const bomItem = {
        id: "water-item",
        calculationMode: EnumBomCalculationMode.FORMULA_GRAIN,
        formulaType: EnumBomFormulaType.WATER_PER_BUSHEL,
        formulaMultiplier: 4.5, // 4.5 gal/bushel
      } as any;

      const result = await service.calculateItemQuantity(bomItem, testLoads);

      // (3000 lbs / 56 lbs/bushel) * 4.5 gal/bushel = 241.07 gal
      expect(result.quantity).toBeCloseTo(241.07, 1);
      expect(result.formula).toContain("3000");
      expect(result.formula).toContain("56");
    });

    it("should calculate BACKSET_PERCENTAGE formula", async () => {
      const bomItem = {
        id: "backset-item",
        calculationMode: EnumBomCalculationMode.FORMULA_WATER,
        formulaType: EnumBomFormulaType.BACKSET_PERCENTAGE,
        formulaMultiplier: 0.25, // 25% of water
      } as any;

      const result = await service.calculateItemQuantity(bomItem, testLoads);

      expect(result.quantity).toBe(60.25); // 241 * 0.25
      expect(result.formula).toContain("241 * 0.25");
    });

    it("should handle BACKSET_PERCENTAGE when waterLoad is missing", async () => {
      const bomItem = {
        id: "backset-item",
        calculationMode: EnumBomCalculationMode.FORMULA_WATER,
        formulaType: EnumBomFormulaType.BACKSET_PERCENTAGE,
        formulaMultiplier: 0.25,
      } as any;

      const loadsWithoutWater: LoadInputs = {
        grainLoad: 3000,
        mashBill: "70-21-00-09",
      };

      const result = await service.calculateItemQuantity(
        bomItem,
        loadsWithoutWater
      );

      expect(result.quantity).toBe(0);
      expect(result.formula).toContain("not provided");
    });

    it("should calculate ENZYME_NORMALIZED using enzyme dosing service", async () => {
      const bomItem = {
        id: "enzyme-item",
        calculationMode: EnumBomCalculationMode.ENZYME_NORMALIZED,
        item: { itemName: "Termamyl SC DS", itemNumber: "ENZ-UNI01" },
      } as any;

      mockEnzymeDosingService.calculateNormalizedEnzymeDosing.mockResolvedValue(
        {
          ratio: 0.00059,
          instructions: "Add during liquifaction",
        }
      );

      const result = await service.calculateItemQuantity(bomItem, testLoads);

      expect(result.quantity).toBe(1.77); // 0.00059 * 3000
      expect(result.formula).toContain("0.00059 * 3000");
      expect(
        enzymeDosingService.calculateNormalizedEnzymeDosing
      ).toHaveBeenCalledWith("70-21-00-09", "ENZ-UNI01");
    });

    it("should handle enzyme calculation failure gracefully", async () => {
      const bomItem = {
        id: "enzyme-item",
        calculationMode: EnumBomCalculationMode.ENZYME_NORMALIZED,
        item: { itemName: "Unknown Enzyme", itemNumber: "ENZ-UNKNOWN" },
      } as any;

      mockEnzymeDosingService.calculateNormalizedEnzymeDosing.mockResolvedValue(
        null
      );

      const result = await service.calculateItemQuantity(bomItem, testLoads);

      expect(result.quantity).toBe(0);
      expect(result.formula).toContain("enzyme not found");
    });

    it("should evaluate EXPRESSION calculation mode with custom expression", async () => {
      const bomItem = {
        id: "custom-expr-item",
        calculationMode: EnumBomCalculationMode.EXPRESSION,
        customExpression: "grainLoad * 0.65",
        item: { itemName: "Custom Item" },
      } as any;

      mockExpressionEngineService.evaluate.mockResolvedValue({
        success: true,
        value: 1950, // 3000 * 0.65
      });

      const result = await service.calculateItemQuantity(bomItem, testLoads);

      expect(result.quantity).toBe(1950);
      expect(mockExpressionEngineService.evaluate).toHaveBeenCalledWith(
        "grainLoad * 0.65",
        expect.objectContaining({
          grainLoad: 3000,
          waterLoad: 241,
          mashBill: "70-21-00-09",
        }),
        undefined // grainCharacters (no recipeId in loads)
      );
    });

    it("should evaluate EXPRESSION mode with formula library reference", async () => {
      const bomItem = {
        id: "library-expr-item",
        calculationMode: EnumBomCalculationMode.EXPRESSION,
        formulaLibraryId: "test-formula-id",
        item: { itemName: "Library Item" },
      } as any;

      mockFormulaLibraryService.findById.mockResolvedValue({
        id: "test-formula-id",
        name: "Standard Corn Calculation",
        expression: "grainLoad * corn / 100",
        isActive: true,
      });

      mockExpressionEngineService.evaluate.mockResolvedValue({
        success: true,
        value: 2100, // 3000 * 70 / 100
      });

      const result = await service.calculateItemQuantity(bomItem, testLoads);

      expect(result.quantity).toBe(2100);
      expect(mockFormulaLibraryService.findById).toHaveBeenCalledWith(
        "test-formula-id"
      );
      expect(mockExpressionEngineService.evaluate).toHaveBeenCalledWith(
        "grainLoad * corn / 100",
        expect.objectContaining({
          grainLoad: 3000,
          mashBill: "70-21-00-09",
        }),
        undefined // grainCharacters (no recipeId in loads)
      );
    });

    it("should handle EXPRESSION mode failure gracefully", async () => {
      const bomItem = {
        id: "failed-expr-item",
        calculationMode: EnumBomCalculationMode.EXPRESSION,
        customExpression: "invalid ** expression",
        item: { itemName: "Invalid Item" },
      } as any;

      mockExpressionEngineService.evaluate.mockResolvedValue({
        success: false,
        error: "Syntax error in expression",
      });

      const result = await service.calculateItemQuantity(bomItem, testLoads);

      expect(result.quantity).toBe(0);
      expect(result.formula).toContain("error");
    });

    it("should fall back to customExpression when formulaLibraryId not found", async () => {
      const bomItem = {
        id: "fallback-item",
        calculationMode: EnumBomCalculationMode.EXPRESSION,
        formulaLibraryId: "non-existent-id",
        customExpression: "grainLoad * 0.5",
        item: { itemName: "Fallback Item" },
      } as any;

      // When findById throws (formula not found), it should fall back to customExpression
      mockFormulaLibraryService.findById.mockRejectedValue(
        new Error("Formula not found")
      );

      mockExpressionEngineService.evaluate.mockResolvedValue({
        success: true,
        value: 1500,
      });

      const result = await service.calculateItemQuantity(bomItem, testLoads);

      // When findById fails and there's no fallback, it returns 0
      // The service doesn't fall back to customExpression when formulaLibraryId is set
      expect(result.quantity).toBe(0);
      expect(result.formula).toContain("error");
    });

    it("should use customExpression when no formulaLibraryId is set", async () => {
      const bomItem = {
        id: "custom-only-item",
        calculationMode: EnumBomCalculationMode.EXPRESSION,
        customExpression: "grainLoad * 0.5",
        item: { itemName: "Custom Only Item" },
      } as any;

      mockExpressionEngineService.evaluate.mockResolvedValue({
        success: true,
        value: 1500,
      });

      const result = await service.calculateItemQuantity(bomItem, testLoads);

      expect(result.quantity).toBe(1500);
      expect(mockFormulaLibraryService.findById).not.toHaveBeenCalled();
      expect(mockExpressionEngineService.evaluate).toHaveBeenCalledWith(
        "grainLoad * 0.5",
        expect.any(Object),
        undefined
      );
    });

    it("should round quantities to 2 decimal places", async () => {
      const bomItem = {
        id: "test-item",
        calculationMode: EnumBomCalculationMode.FORMULA_GRAIN,
        formulaType: EnumBomFormulaType.SIMPLE_RATIO,
        formulaMultiplier: 0.333333,
      } as any;

      const result = await service.calculateItemQuantity(bomItem, testLoads);

      expect(result.quantity).toBe(1000); // 3000 * 0.333333 = 999.999, rounded to 1000
    });
  });

  describe("recalculateOnLoadChange", () => {
    const scheduleOrderId = "test-so-id";
    const testLoads: LoadInputs = {
      grainLoad: 3500,
      waterLoad: 280,
      mashBill: "70-21-00-09",
    };

    beforeEach(() => {
      mockPrisma.scheduleOrder.findUnique.mockResolvedValue({
        id: scheduleOrderId,
        scheduleOrderRecipeInstance: {
          id: "instance-id",
          recipeBoms: [{ id: "bom-id-1" }],
        },
      });

      mockPrisma.recipeBomItem.findMany.mockResolvedValue([
        {
          id: "corn-item",
          calculationMode: EnumBomCalculationMode.FORMULA_GRAIN,
          formulaType: EnumBomFormulaType.SIMPLE_RATIO,
          formulaMultiplier: 0.7,
          item: { itemName: "Corn" },
        },
        {
          id: "water-item",
          calculationMode: EnumBomCalculationMode.FORMULA_GRAIN,
          formulaType: EnumBomFormulaType.WATER_PER_BUSHEL,
          formulaMultiplier: 4.5,
          item: { itemName: "Water" },
        },
      ]);

      // Mock findFirst to return null (will create new records)
      mockPrisma.recipeBomActual.findFirst.mockResolvedValue(null);
      mockPrisma.recipeBomActual.create.mockResolvedValue({} as any);
    });

    it("should recalculate all BOM items when loads change", async () => {
      await service.recalculateOnLoadChange(scheduleOrderId, testLoads);

      expect(mockPrisma.recipeBomActual.findFirst).toHaveBeenCalledTimes(2);
      expect(mockPrisma.recipeBomActual.create).toHaveBeenCalledTimes(2);

      // Check corn calculation (3500 * 0.7 = 2450)
      expect(mockPrisma.recipeBomActual.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            quantityPlanned: 2450,
            grainLoadAtCalculation: 3500,
            waterLoadAtCalculation: 280,
          }),
        })
      );
    });

    it("should update lastCalculatedAt timestamp on BOM items", async () => {
      await service.recalculateOnLoadChange(scheduleOrderId, testLoads);

      expect(mockPrisma.recipeBomItem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lastCalculatedAt: expect.any(Date),
          }),
        })
      );
    });

    it("should handle missing schedule order gracefully", async () => {
      mockPrisma.scheduleOrder.findUnique.mockResolvedValue(null);

      await expect(
        service.recalculateOnLoadChange("invalid-id", testLoads)
      ).resolves.not.toThrow();
    });
  });

  describe("previewCalculation", () => {
    const recipeBomId = "test-bom-id";
    const testLoads: LoadInputs = {
      grainLoad: 2500,
      waterLoad: 200,
      mashBill: "70-21-00-09",
    };

    beforeEach(() => {
      mockPrisma.recipeBomItem.findMany.mockResolvedValue([
        {
          id: "corn-item",
          calculationMode: EnumBomCalculationMode.FORMULA_GRAIN,
          formulaType: EnumBomFormulaType.SIMPLE_RATIO,
          formulaMultiplier: 0.7,
          quantity: 700, // Old quantity
          item: { itemName: "Corn" },
        },
      ]);
    });

    it("should return preview calculations without saving", async () => {
      const results = await service.previewCalculation(recipeBomId, testLoads);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        bomItemId: "corn-item",
        itemName: "Corn",
        oldQuantity: 700,
        newQuantity: 1750, // 2500 * 0.7
        formula: expect.stringContaining("2500 * 0.7"),
      });

      // Should NOT save to database
      expect(mockPrisma.recipeBomActual.create).not.toHaveBeenCalled();
      expect(mockPrisma.recipeBomActual.update).not.toHaveBeenCalled();
    });
  });

  describe("calculateInitialBomQuantities", () => {
    const instanceId = "test-instance-id";
    const testLoads: LoadInputs = {
      grainLoad: 3000,
      waterLoad: 241,
      mashBill: "70-21-00-09",
    };

    beforeEach(() => {
      mockPrisma.scheduleOrderRecipeInstance.findUnique.mockResolvedValue({
        id: instanceId,
        recipeBoms: [
          {
            id: "bom-id",
            recipeBomITem: [
              {
                id: "corn-item",
                calculationMode: EnumBomCalculationMode.FORMULA_GRAIN,
                formulaType: EnumBomFormulaType.SIMPLE_RATIO,
                formulaMultiplier: 0.7,
                item: { itemName: "Corn" },
              },
            ],
          },
        ],
      });
    });

    it("should create initial RecipeBomActual records", async () => {
      await service.calculateInitialBomQuantities(instanceId, testLoads);

      expect(mockPrisma.recipeBomActual.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            scheduleOrderRecipeInstanceId: instanceId,
            quantityPlanned: 2100, // 3000 * 0.7
            grainLoadAtCalculation: 3000,
            waterLoadAtCalculation: 241,
            formulaUsed: expect.stringContaining("3000 * 0.7"),
          }),
        })
      );
    });

    it("should handle missing instance gracefully", async () => {
      mockPrisma.scheduleOrderRecipeInstance.findUnique.mockResolvedValue(null);

      await expect(
        service.calculateInitialBomQuantities("invalid-id", testLoads)
      ).resolves.not.toThrow();
    });
  });
});
