/**
 * E2E Tests for BOM Formula Calculation Mechanism
 *
 * These tests verify the formula configuration and BOM calculation flow
 * using the real BomCalculationService with mocked dependencies.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { BomCalculationService, LoadInputs } from "../bom-calculation.service";
import { EnzymeDosingService } from "../../recipe/enzyme.dosing";
import { ExpressionEngineService } from "../../expressionEngine/expression-engine.service";
import { FormulaLibraryService } from "../../formulaLibrary/formula-library.service";
import { AuditService } from "../../audit/audit.service";
import {
  EnumBomCalculationMode,
  EnumBomFormulaType,
  RecipeBomItem,
} from "@prisma/client";

describe("BOM Formula Calculation (e2e)", () => {
  let bomService: BomCalculationService;
  let prisma: PrismaService;
  let expressionEngine: ExpressionEngineService;

  // Track created formula execution logs for cleanup
  const createdLogIds: string[] = [];

  // Mock for EnzymeDosingService
  const mockEnzymeDosingService = {
    calculateNormalizedEnzymeDosing: jest.fn().mockResolvedValue({
      ratio: 0.0015, // Example enzyme ratio
      category: "LIQUIFACTION",
    }),
  };

  // Mock for FormulaLibraryService (real expressions will work, only library lookup is mocked)
  const mockFormulaLibraryService = {
    findById: jest.fn().mockImplementation((id: string) => {
      // Return a mock formula if requested
      if (id === "test-formula-id") {
        return Promise.resolve({
          id: "test-formula-id",
          expression: "=grainLoad * 0.1",
          name: "Test Formula",
        });
      }
      throw new Error("Formula not found");
    }),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
      providers: [
        BomCalculationService,
        ExpressionEngineService,
        {
          provide: EnzymeDosingService,
          useValue: mockEnzymeDosingService,
        },
        {
          provide: FormulaLibraryService,
          useValue: mockFormulaLibraryService,
        },
        {
          provide: AuditService,
          useValue: {
            logChange: jest.fn().mockResolvedValue({}),
            log: jest.fn(),
          },
        },
      ],
    }).compile();

    bomService = module.get<BomCalculationService>(BomCalculationService);
    prisma = module.get<PrismaService>(PrismaService);
    expressionEngine = module.get<ExpressionEngineService>(
      ExpressionEngineService
    );
  });

  afterAll(async () => {
    // Clean up any formula execution logs we created
    if (createdLogIds.length > 0) {
      try {
        await prisma.formulaExecutionLog.deleteMany({
          where: { id: { in: createdLogIds } },
        });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  // Helper to create a mock BOM item for testing
  function createMockBomItem(options: {
    calculationMode?: EnumBomCalculationMode;
    formulaType?: EnumBomFormulaType | null;
    formulaMultiplier?: number | null;
    customExpression?: string | null;
    formulaLibraryId?: string | null;
    quantity?: number;
    itemName?: string;
  }): RecipeBomItem & { item?: { itemName?: string } | null } {
    return {
      id: `mock-bom-item-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      recipeBomsId: "mock-bom-id",
      itemId: "mock-item-id",
      displayUnitsId: null,
      globalId: null,
      quantity: options.quantity ?? 0,
      operation: "Mashing01",
      calculationMode: options.calculationMode || EnumBomCalculationMode.STATIC,
      formulaType: options.formulaType ?? null,
      formulaMultiplier: options.formulaMultiplier ?? null,
      formulaLibraryId: options.formulaLibraryId ?? null,
      customExpression: options.customExpression ?? null,
      expressionVariables: null,
      expressionValidated: null,
      expressionError: null,
      lastCalculatedAt: null,
      createdAt: new Date(),
      createdBy: "e2e-test",
      updatedAt: new Date(),
      schemaVersion: null,
      isClassDefinition: false,
      activeInstanceId: null,
      updatedBy: null,
      item: options.itemName ? { itemName: options.itemName } : null,
    };
  }

  // Track logs created by expression evaluation
  async function trackCreatedLogs(bomItemId: string) {
    const logs = await prisma.formulaExecutionLog.findMany({
      where: { recipeBomItemId: bomItemId },
    });
    createdLogIds.push(...logs.map((l) => l.id));
  }

  // ============================================
  // TEST SUITES
  // ============================================

  describe("calculateItemQuantity", () => {
    describe("STATIC mode", () => {
      it("should return the fixed quantity from the BOM item", async () => {
        const bomItem = createMockBomItem({
          calculationMode: EnumBomCalculationMode.STATIC,
          quantity: 150,
        });

        const loads: LoadInputs = {
          grainLoad: 3000,
          waterLoad: 241,
          mashBill: "70-21-00-09",
        };

        const result = await bomService.calculateItemQuantity(bomItem, loads);

        expect(result.quantity).toBe(150);
        expect(result.formula).toBe("static");
        expect(result.calculatedAt).toBeInstanceOf(Date);
      });

      it("should return 0 for zero quantity", async () => {
        const bomItem = createMockBomItem({
          calculationMode: EnumBomCalculationMode.STATIC,
          quantity: 0,
        });

        const result = await bomService.calculateItemQuantity(bomItem, {
          grainLoad: 3000,
        });

        expect(result.quantity).toBe(0);
      });
    });

    describe("FORMULA_GRAIN mode", () => {
      it("should calculate grainLoad × multiplier for SIMPLE_RATIO", async () => {
        const bomItem = createMockBomItem({
          calculationMode: EnumBomCalculationMode.FORMULA_GRAIN,
          formulaType: EnumBomFormulaType.SIMPLE_RATIO,
          formulaMultiplier: 0.7,
        });

        const loads: LoadInputs = {
          grainLoad: 3000,
          waterLoad: 241,
          mashBill: "70-21-00-09",
        };

        const result = await bomService.calculateItemQuantity(bomItem, loads);

        // 3000 * 0.70 = 2100
        expect(result.quantity).toBe(2100);
        expect(result.formula).toBe("3000 * 0.7");
      });

      it("should calculate 21% for rye component", async () => {
        const bomItem = createMockBomItem({
          calculationMode: EnumBomCalculationMode.FORMULA_GRAIN,
          formulaType: EnumBomFormulaType.SIMPLE_RATIO,
          formulaMultiplier: 0.21,
        });

        const result = await bomService.calculateItemQuantity(bomItem, {
          grainLoad: 3000,
          mashBill: "70-21-00-09",
        });

        // 3000 * 0.21 = 630
        expect(result.quantity).toBe(630);
      });

      it("should calculate bushels × multiplier for WATER_PER_BUSHEL", async () => {
        const bomItem = createMockBomItem({
          calculationMode: EnumBomCalculationMode.FORMULA_GRAIN,
          formulaType: EnumBomFormulaType.WATER_PER_BUSHEL,
          formulaMultiplier: 4.5,
        });

        const loads: LoadInputs = {
          grainLoad: 3000, // 3000 lbs / 56 lbs/bushel = 53.57 bushels
          waterLoad: 241,
          mashBill: "70-21-00-09",
        };

        const result = await bomService.calculateItemQuantity(bomItem, loads);

        // (3000 / 56) * 4.5 ≈ 241.07
        expect(result.quantity).toBeCloseTo(241.07, 1);
        expect(result.formula).toContain("56");
      });

      it("should handle zero multiplier", async () => {
        const bomItem = createMockBomItem({
          calculationMode: EnumBomCalculationMode.FORMULA_GRAIN,
          formulaType: EnumBomFormulaType.SIMPLE_RATIO,
          formulaMultiplier: 0,
        });

        const result = await bomService.calculateItemQuantity(bomItem, {
          grainLoad: 3000,
        });

        expect(result.quantity).toBe(0);
      });

      it("should handle null multiplier", async () => {
        const bomItem = createMockBomItem({
          calculationMode: EnumBomCalculationMode.FORMULA_GRAIN,
          formulaType: EnumBomFormulaType.SIMPLE_RATIO,
          formulaMultiplier: null,
        });

        const result = await bomService.calculateItemQuantity(bomItem, {
          grainLoad: 3000,
        });

        expect(result.quantity).toBe(0);
      });
    });

    describe("FORMULA_WATER mode", () => {
      it("should calculate waterLoad × multiplier for BACKSET_PERCENTAGE", async () => {
        const bomItem = createMockBomItem({
          calculationMode: EnumBomCalculationMode.FORMULA_WATER,
          formulaType: EnumBomFormulaType.BACKSET_PERCENTAGE,
          formulaMultiplier: 0.25,
        });

        const loads: LoadInputs = {
          grainLoad: 3000,
          waterLoad: 241,
          mashBill: "70-21-00-09",
        };

        const result = await bomService.calculateItemQuantity(bomItem, loads);

        // 241 * 0.25 = 60.25
        expect(result.quantity).toBe(60.25);
        expect(result.formula).toBe("241 * 0.25");
      });

      it("should return 0 when waterLoad is not provided", async () => {
        const bomItem = createMockBomItem({
          calculationMode: EnumBomCalculationMode.FORMULA_WATER,
          formulaType: EnumBomFormulaType.BACKSET_PERCENTAGE,
          formulaMultiplier: 0.25,
        });

        const result = await bomService.calculateItemQuantity(bomItem, {
          grainLoad: 3000,
          mashBill: "70-21-00-09",
        });

        expect(result.quantity).toBe(0);
        expect(result.formula).toContain("not provided");
      });

      it("should handle 33% backset", async () => {
        const bomItem = createMockBomItem({
          calculationMode: EnumBomCalculationMode.FORMULA_WATER,
          formulaType: EnumBomFormulaType.BACKSET_PERCENTAGE,
          formulaMultiplier: 0.33,
        });

        const result = await bomService.calculateItemQuantity(bomItem, {
          grainLoad: 3000,
          waterLoad: 300,
        });

        // 300 * 0.33 = 99
        expect(result.quantity).toBe(99);
      });
    });

    describe("EXPRESSION mode", () => {
      it("should evaluate custom arithmetic expressions", async () => {
        const bomItem = createMockBomItem({
          calculationMode: EnumBomCalculationMode.EXPRESSION,
          customExpression: "=grainLoad * 0.05",
        });

        const loads: LoadInputs = {
          grainLoad: 3000,
          waterLoad: 241,
          mashBill: "70-21-00-09",
        };

        const result = await bomService.calculateItemQuantity(bomItem, loads);

        // 3000 * 0.05 = 150
        expect(result.quantity).toBe(150);
        expect(result.formula).toBe("=grainLoad * 0.05");

        await trackCreatedLogs(bomItem.id);
      });

      it("should evaluate expressions with mash bill components", async () => {
        const bomItem = createMockBomItem({
          calculationMode: EnumBomCalculationMode.EXPRESSION,
          customExpression: "=grainLoad * corn / 100",
        });

        const loads: LoadInputs = {
          grainLoad: 3000,
          waterLoad: 241,
          mashBill: "70-21-00-09", // corn=70
        };

        const result = await bomService.calculateItemQuantity(bomItem, loads);

        // 3000 * 70 / 100 = 2100
        expect(result.quantity).toBe(2100);

        await trackCreatedLogs(bomItem.id);
      });

      it("should evaluate IF conditions", async () => {
        const bomItem = createMockBomItem({
          calculationMode: EnumBomCalculationMode.EXPRESSION,
          customExpression: "=IF(corn > 60, grainLoad * 0.7, grainLoad * 0.5)",
        });

        const loads: LoadInputs = {
          grainLoad: 3000,
          waterLoad: 241,
          mashBill: "70-21-00-09", // corn=70 > 60
        };

        const result = await bomService.calculateItemQuantity(bomItem, loads);

        // corn=70 > 60, so 3000 * 0.7 = 2100
        expect(result.quantity).toBe(2100);

        await trackCreatedLogs(bomItem.id);
      });

      it("should evaluate BUSHELS function", async () => {
        const bomItem = createMockBomItem({
          calculationMode: EnumBomCalculationMode.EXPRESSION,
          customExpression: "=BUSHELS(grainLoad) * 4.5",
        });

        const result = await bomService.calculateItemQuantity(bomItem, {
          grainLoad: 3000,
          mashBill: "70-21-00-09",
        });

        // BUSHELS(3000) = 3000/56 ≈ 53.57, * 4.5 ≈ 241.07
        expect(result.quantity).toBeCloseTo(241.07, 1);

        await trackCreatedLogs(bomItem.id);
      });

      it("should return 0 when no expression is configured", async () => {
        const bomItem = createMockBomItem({
          calculationMode: EnumBomCalculationMode.EXPRESSION,
        });

        const result = await bomService.calculateItemQuantity(bomItem, {
          grainLoad: 3000,
          mashBill: "70-21-00-09",
        });

        expect(result.quantity).toBe(0);
        expect(result.formula).toContain("error");
      });

      it("should handle invalid expression syntax", async () => {
        const bomItem = createMockBomItem({
          calculationMode: EnumBomCalculationMode.EXPRESSION,
          customExpression: "=grainLoad * * 0.1",
        });

        const result = await bomService.calculateItemQuantity(bomItem, {
          grainLoad: 3000,
        });

        expect(result.quantity).toBe(0);
        expect(result.formula).toContain("error");
      });
    });
  });

  describe("formula types", () => {
    it("SIMPLE_RATIO: should multiply load by ratio", async () => {
      const bomItem = createMockBomItem({
        calculationMode: EnumBomCalculationMode.FORMULA_GRAIN,
        formulaType: EnumBomFormulaType.SIMPLE_RATIO,
        formulaMultiplier: 0.15,
      });

      const result = await bomService.calculateItemQuantity(bomItem, {
        grainLoad: 2000,
        mashBill: "70-21-00-09",
      });

      // 2000 * 0.15 = 300
      expect(result.quantity).toBe(300);
    });

    it("WATER_PER_BUSHEL: should convert lbs to bushels then multiply", async () => {
      const bomItem = createMockBomItem({
        calculationMode: EnumBomCalculationMode.FORMULA_GRAIN,
        formulaType: EnumBomFormulaType.WATER_PER_BUSHEL,
        formulaMultiplier: 5.0,
      });

      const result = await bomService.calculateItemQuantity(bomItem, {
        grainLoad: 2800, // 2800 / 56 = 50 bushels
        mashBill: "70-21-00-09",
      });

      // (2800 / 56) * 5.0 = 50 * 5 = 250
      expect(result.quantity).toBe(250);
    });

    it("BACKSET_PERCENTAGE: should calculate percentage of water load", async () => {
      const bomItem = createMockBomItem({
        calculationMode: EnumBomCalculationMode.FORMULA_WATER,
        formulaType: EnumBomFormulaType.BACKSET_PERCENTAGE,
        formulaMultiplier: 0.3,
      });

      const result = await bomService.calculateItemQuantity(bomItem, {
        grainLoad: 3000,
        waterLoad: 200,
        mashBill: "70-21-00-09",
      });

      // 200 * 0.30 = 60
      expect(result.quantity).toBe(60);
    });
  });

  describe("expression engine integration", () => {
    it("should evaluate MAX function", async () => {
      const bomItem = createMockBomItem({
        calculationMode: EnumBomCalculationMode.EXPRESSION,
        customExpression: "=max(grainLoad * 0.05, 100)",
      });

      // grainLoad * 0.05 = 1000 * 0.05 = 50, max(50, 100) = 100
      const result1 = await bomService.calculateItemQuantity(bomItem, {
        grainLoad: 1000,
        mashBill: "70-21-00-09",
      });
      expect(result1.quantity).toBe(100);

      // grainLoad * 0.05 = 3000 * 0.05 = 150, max(150, 100) = 150
      const result2 = await bomService.calculateItemQuantity(bomItem, {
        grainLoad: 3000,
        mashBill: "70-21-00-09",
      });
      expect(result2.quantity).toBe(150);

      await trackCreatedLogs(bomItem.id);
    });

    it("should evaluate MIN function", async () => {
      const bomItem = createMockBomItem({
        calculationMode: EnumBomCalculationMode.EXPRESSION,
        customExpression: "=min(grainLoad * 0.1, 500)",
      });

      // grainLoad * 0.1 = 3000 * 0.1 = 300, min(300, 500) = 300
      const result = await bomService.calculateItemQuantity(bomItem, {
        grainLoad: 3000,
        mashBill: "70-21-00-09",
      });
      expect(result.quantity).toBe(300);

      await trackCreatedLogs(bomItem.id);
    });

    it("should evaluate ROUND function", async () => {
      const bomItem = createMockBomItem({
        calculationMode: EnumBomCalculationMode.EXPRESSION,
        customExpression: "=round(grainLoad * 0.333)",
      });

      // 3000 * 0.333 = 999, round(999) = 999
      const result = await bomService.calculateItemQuantity(bomItem, {
        grainLoad: 3000,
        mashBill: "70-21-00-09",
      });
      expect(result.quantity).toBe(999);

      await trackCreatedLogs(bomItem.id);
    });

    it("should use built-in constants (lbsPerBushel)", async () => {
      const bomItem = createMockBomItem({
        calculationMode: EnumBomCalculationMode.EXPRESSION,
        customExpression: "=grainLoad / lbsPerBushel",
      });

      // 3360 / 56 = 60 bushels
      const result = await bomService.calculateItemQuantity(bomItem, {
        grainLoad: 3360,
        mashBill: "70-21-00-09",
      });
      expect(result.quantity).toBe(60);

      await trackCreatedLogs(bomItem.id);
    });

    it("should parse all mash bill components", async () => {
      const bomItem = createMockBomItem({
        calculationMode: EnumBomCalculationMode.EXPRESSION,
        customExpression: "=corn + rye + wheat + malt", // 70 + 21 + 0 + 9 = 100
      });

      const result = await bomService.calculateItemQuantity(bomItem, {
        grainLoad: 3000,
        mashBill: "70-21-00-09",
      });
      expect(result.quantity).toBe(100);

      await trackCreatedLogs(bomItem.id);
    });

    it("should handle different mash bill compositions", async () => {
      const bomItem = createMockBomItem({
        calculationMode: EnumBomCalculationMode.EXPRESSION,
        customExpression: "=grainLoad * rye / 100",
      });

      // 51% rye high-rye bourbon
      const result = await bomService.calculateItemQuantity(bomItem, {
        grainLoad: 2000,
        mashBill: "49-51-00-00", // corn=49, rye=51
      });

      // 2000 * 51 / 100 = 1020
      expect(result.quantity).toBe(1020);

      await trackCreatedLogs(bomItem.id);
    });
  });

  describe("edge cases and error handling", () => {
    it("should handle unknown calculation mode by falling back to STATIC", async () => {
      const bomItem = createMockBomItem({
        calculationMode: "UNKNOWN_MODE" as EnumBomCalculationMode,
        quantity: 50,
      });

      const result = await bomService.calculateItemQuantity(bomItem, {
        grainLoad: 3000,
      });

      expect(result.quantity).toBe(50);
    });

    it("should handle very large grain loads", async () => {
      const bomItem = createMockBomItem({
        calculationMode: EnumBomCalculationMode.FORMULA_GRAIN,
        formulaType: EnumBomFormulaType.SIMPLE_RATIO,
        formulaMultiplier: 0.7,
      });

      const result = await bomService.calculateItemQuantity(bomItem, {
        grainLoad: 100000, // 100,000 lbs
        mashBill: "70-21-00-09",
      });

      // 100000 * 0.70 = 70000
      expect(result.quantity).toBe(70000);
    });

    it("should handle decimal precision correctly", async () => {
      const bomItem = createMockBomItem({
        calculationMode: EnumBomCalculationMode.FORMULA_GRAIN,
        formulaType: EnumBomFormulaType.SIMPLE_RATIO,
        formulaMultiplier: 0.1374, // 13.74% (e.g., malted barley)
      });

      const result = await bomService.calculateItemQuantity(bomItem, {
        grainLoad: 3000,
        mashBill: "70-21-00-09",
      });

      // 3000 * 0.1374 = 412.2
      expect(result.quantity).toBe(412.2);
    });

    it("should round results to 2 decimal places", async () => {
      const bomItem = createMockBomItem({
        calculationMode: EnumBomCalculationMode.FORMULA_GRAIN,
        formulaType: EnumBomFormulaType.SIMPLE_RATIO,
        formulaMultiplier: 0.333333,
      });

      const result = await bomService.calculateItemQuantity(bomItem, {
        grainLoad: 3000,
        mashBill: "70-21-00-09",
      });

      // 3000 * 0.333333 = 999.999, should round to 1000
      expect(result.quantity).toBe(1000);
    });
  });
});
