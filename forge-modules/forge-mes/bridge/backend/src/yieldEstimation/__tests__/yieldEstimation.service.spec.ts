import { Test, TestingModule } from "@nestjs/testing";
import { Parser } from "expr-eval";
import { YieldEstimationService } from "../yieldEstimation.service";
import { ProductionMetricService } from "../../productionMetric/productionMetric.service";
import { ExpressionEngineService } from "../../expressionEngine/expression-engine.service";
import { FormulaLibraryService } from "../../formulaLibrary/formula-library.service";
import { PrismaService } from "../../prisma/prisma.service";
import { EnumRecipeWhiskeyType } from "@prisma/client";

/** The 6 seeded yield formulas matching seed-formula-library.ts */
const YIELD_FORMULAS = [
  {
    id: "f1",
    name: "Grain Units per Fermenter",
    expression: "grainPerCook * cooksPerFerm / lbsPerBushel",
    category: "Yield",
    isActive: true,
  },
  {
    id: "f2",
    name: "Proof Gallons per Barrel",
    expression: "(entryProof / 100) * avgBarrelFill",
    category: "Yield",
    isActive: true,
  },
  {
    id: "f3",
    name: "Proof Gallons per Fermenter",
    expression: "grainUnitsPerFerm * yieldRate",
    category: "Yield",
    isActive: true,
  },
  {
    id: "f4",
    name: "Barrels per Fermenter",
    expression: "pgPerFerm / pgPerBarrel",
    category: "Yield",
    isActive: true,
  },
  {
    id: "f5",
    name: "Total Fermenters Required",
    expression: "CEIL(totalBarrels / bblPerFerm)",
    category: "Yield",
    isActive: true,
  },
  {
    id: "f6",
    name: "Total Grain Weight",
    expression: "totalCooks * grainPerCook",
    category: "Yield",
    isActive: true,
  },
];

describe("YieldEstimationService", () => {
  let service: YieldEstimationService;
  let metricService: ProductionMetricService;

  const mockResolveMetrics = jest.fn();
  const mockFormulaSearch = jest.fn();
  const mockLogCreate = jest.fn().mockResolvedValue({});

  /** Real expression evaluator using expr-eval for numeric accuracy */
  const mockEvaluate = jest
    .fn()
    .mockImplementation(async (expression: string, context: any) => {
      try {
        const parser = new Parser();
        // Register CEIL function to match the expression engine
        parser.functions.CEIL = Math.ceil;
        parser.functions.FLOOR = Math.floor;
        parser.functions.ROUND = Math.round;
        parser.functions.ABS = Math.abs;
        parser.functions.MIN = Math.min;
        parser.functions.MAX = Math.max;

        const start = Date.now();
        const expr = parser.parse(expression);
        const value = expr.evaluate(context);
        return {
          success: true,
          value,
          executionTimeMs: Date.now() - start,
          variablesUsed: expr.variables(),
        };
      } catch (err: any) {
        return {
          success: false,
          error: err.message,
          executionTimeMs: 0,
          variablesUsed: [],
        };
      }
    });

  beforeEach(async () => {
    mockFormulaSearch.mockResolvedValue(YIELD_FORMULAS);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YieldEstimationService,
        {
          provide: ProductionMetricService,
          useValue: {
            resolveMetricsForWhiskeyType: mockResolveMetrics,
            getMetricValue: jest.fn(),
            getMetricsByCategory: jest.fn(),
          },
        },
        {
          provide: ExpressionEngineService,
          useValue: {
            evaluate: mockEvaluate,
            validate: jest.fn(),
          },
        },
        {
          provide: FormulaLibraryService,
          useValue: {
            search: mockFormulaSearch,
          },
        },
        {
          provide: PrismaService,
          useValue: {
            formulaExecutionLog: {
              create: mockLogCreate,
            },
          },
        },
      ],
    }).compile();

    service = module.get<YieldEstimationService>(YieldEstimationService);
    metricService = module.get<ProductionMetricService>(
      ProductionMetricService
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("calculateYieldEstimate", () => {
    it("should match spreadsheet values for bourbon (5.2 yield, 23k grain, 3 cooks)", async () => {
      // Setup metrics matching spreadsheet values
      mockResolveMetrics.mockResolvedValue({
        yield_pg_per_gu: {
          name: "yield_pg_per_gu",
          value: 5.2,
          source: "exact",
        },
        avg_barrel_fill_gallons: {
          name: "avg_barrel_fill_gallons",
          value: 53.07,
          source: "fallback",
        },
        cooks_per_fermenter: {
          name: "cooks_per_fermenter",
          value: 3,
          source: "fallback",
        },
        lbs_per_bushel: {
          name: "lbs_per_bushel",
          value: 56,
          source: "fallback",
        },
      });

      const result = await service.calculateYieldEstimate({
        whiskeyType: EnumRecipeWhiskeyType.RyeBourbon,
        totalBarrels: 500,
        entryProof: 125,
        containerType: "LargeBarrel",
        grainPerCook: 23000,
        cooksPerFerm: 3,
      });

      // Verify calculation chain matches spreadsheet:
      // GU/Ferm = 23000 * 3 / 56 = 1232.14 bushels
      expect(result.grainUnitsPerFerm).toBeCloseTo(1232.14, 1);

      // PG/BBL = (125/100) * 53.07 = 66.34
      expect(result.estimatedPGsPerBbl).toBeCloseTo(66.34, 1);

      // PG/Ferm = 1232.14 * 5.2 = 6407.14
      expect(result.pgPerFerm).toBeCloseTo(6407.14, 0);

      // BBL/Ferm = 6407.14 / 66.34 = 96.58 (rounds to ~96.6)
      // Note: spreadsheet shows ~100.7 with slightly different inputs
      expect(result.estimatedBarrelsPerFermenter).toBeGreaterThan(90);
      expect(result.estimatedBarrelsPerFermenter).toBeLessThan(110);

      // Yield rate should be 5.2 for bourbon
      expect(result.estimatedPGsPerBushel).toBe(5.2);

      // Should track metrics used
      expect(result.metricsUsed.length).toBeGreaterThan(0);
      expect(
        result.metricsUsed.find((m) => m.name === "yieldRate")?.value
      ).toBe(5.2);
    });

    it("should match spreadsheet ~100.7 BBL/ferm with exact spreadsheet inputs", async () => {
      // Exact spreadsheet values: 24000 lbs/cook, 3 cooks, 5.2 yield, 125 proof, 53.07 fill
      mockResolveMetrics.mockResolvedValue({
        yield_pg_per_gu: {
          name: "yield_pg_per_gu",
          value: 5.2,
          source: "exact",
        },
        avg_barrel_fill_gallons: {
          name: "avg_barrel_fill_gallons",
          value: 53.07,
          source: "fallback",
        },
        cooks_per_fermenter: {
          name: "cooks_per_fermenter",
          value: 3,
          source: "fallback",
        },
        lbs_per_bushel: {
          name: "lbs_per_bushel",
          value: 56,
          source: "fallback",
        },
      });

      const result = await service.calculateYieldEstimate({
        whiskeyType: EnumRecipeWhiskeyType.RyeBourbon,
        totalBarrels: 500,
        entryProof: 125,
        containerType: "LargeBarrel",
        grainPerCook: 24000,
        cooksPerFerm: 3,
      });

      // GU/Ferm = 24000 * 3 / 56 = 1285.71
      // PG/BBL = 1.25 * 53.07 = 66.3375
      // PG/Ferm = 1285.71 * 5.2 = 6685.71
      // BBL/Ferm = 6685.71 / 66.3375 = 100.78 ≈ 100.8
      expect(result.estimatedBarrelsPerFermenter).toBeCloseTo(100.8, 0);
    });

    it("should use lower yield rate for non-bourbon whiskey types", async () => {
      mockResolveMetrics.mockResolvedValue({
        yield_pg_per_gu: {
          name: "yield_pg_per_gu",
          value: 4.9,
          source: "exact",
        },
        avg_barrel_fill_gallons: {
          name: "avg_barrel_fill_gallons",
          value: 53.07,
          source: "fallback",
        },
        cooks_per_fermenter: {
          name: "cooks_per_fermenter",
          value: 3,
          source: "fallback",
        },
        lbs_per_bushel: {
          name: "lbs_per_bushel",
          value: 56,
          source: "fallback",
        },
      });

      const result = await service.calculateYieldEstimate({
        whiskeyType: EnumRecipeWhiskeyType.RyeWhiskey,
        totalBarrels: 500,
        entryProof: 125,
        grainPerCook: 23000,
      });

      expect(result.estimatedPGsPerBushel).toBe(4.9);
      // Lower yield → fewer BBL/ferm → more fermenters needed
      expect(result.estimatedBarrelsPerFermenter).toBeLessThan(100);
    });

    it("should allow yield rate override", async () => {
      mockResolveMetrics.mockResolvedValue({
        yield_pg_per_gu: {
          name: "yield_pg_per_gu",
          value: 5.2,
          source: "exact",
        },
        avg_barrel_fill_gallons: {
          name: "avg_barrel_fill_gallons",
          value: 53.07,
          source: "fallback",
        },
        cooks_per_fermenter: {
          name: "cooks_per_fermenter",
          value: 3,
          source: "fallback",
        },
        lbs_per_bushel: {
          name: "lbs_per_bushel",
          value: 56,
          source: "fallback",
        },
      });

      const result = await service.calculateYieldEstimate({
        whiskeyType: EnumRecipeWhiskeyType.RyeBourbon,
        totalBarrels: 500,
        entryProof: 125,
        grainPerCook: 23000,
        yieldRateOverride: 6.0,
      });

      expect(result.estimatedPGsPerBushel).toBe(6.0);
      // Higher yield → more BBL/ferm
      expect(result.estimatedBarrelsPerFermenter).toBeGreaterThan(100);
    });

    it("should fall back to hardcoded defaults when no metrics exist", async () => {
      mockResolveMetrics.mockResolvedValue({});

      const result = await service.calculateYieldEstimate({
        whiskeyType: EnumRecipeWhiskeyType.RyeBourbon,
        totalBarrels: 500,
        entryProof: 125,
        grainPerCook: 23000,
      });

      // Should use hardcoded defaults: 5.2 yield for bourbon, 53.07 fill, 3 cooks, 56 lbs/bu
      expect(result.estimatedPGsPerBushel).toBe(5.2);
      expect(result.estimatedPGsPerBbl).toBeCloseTo(66.34, 1);
      expect(result.totalFermenters).toBeGreaterThan(0);
    });

    it("should handle SmallBarrel container type", async () => {
      mockResolveMetrics.mockResolvedValue({});

      const result = await service.calculateYieldEstimate({
        whiskeyType: EnumRecipeWhiskeyType.RyeBourbon,
        totalBarrels: 500,
        entryProof: 125,
        containerType: "SmallBarrel",
        grainPerCook: 23000,
      });

      // SmallBarrel = 30 gal fill
      // PG/BBL = 1.25 * 30 = 37.5
      expect(result.estimatedPGsPerBbl).toBeCloseTo(37.5, 1);
      // Fewer PG per barrel → more barrels per fermenter? No, more PG per ferm / fewer PG per bbl = more BBL/ferm
      expect(result.estimatedBarrelsPerFermenter).toBeGreaterThan(150);
    });

    it("should calculate correct total grain weight", async () => {
      mockResolveMetrics.mockResolvedValue({
        yield_pg_per_gu: {
          name: "yield_pg_per_gu",
          value: 5.2,
          source: "exact",
        },
        avg_barrel_fill_gallons: {
          name: "avg_barrel_fill_gallons",
          value: 53.07,
          source: "fallback",
        },
        cooks_per_fermenter: {
          name: "cooks_per_fermenter",
          value: 3,
          source: "fallback",
        },
        lbs_per_bushel: {
          name: "lbs_per_bushel",
          value: 56,
          source: "fallback",
        },
      });

      const result = await service.calculateYieldEstimate({
        whiskeyType: EnumRecipeWhiskeyType.RyeBourbon,
        totalBarrels: 100,
        entryProof: 125,
        grainPerCook: 23000,
        cooksPerFerm: 3,
      });

      // totalGrainWeight = totalCooks * grainPerCook
      expect(result.totalGrainWeight).toBe(result.totalCooks * 23000);
      expect(result.plannedCooks).toBe(result.totalCooks);
      expect(result.plannedFermenters).toBe(result.totalFermenters);
    });

    it("should use fallback expressions when formula search fails", async () => {
      mockResolveMetrics.mockResolvedValue({
        yield_pg_per_gu: {
          name: "yield_pg_per_gu",
          value: 5.2,
          source: "exact",
        },
        avg_barrel_fill_gallons: {
          name: "avg_barrel_fill_gallons",
          value: 53.07,
          source: "fallback",
        },
        cooks_per_fermenter: {
          name: "cooks_per_fermenter",
          value: 3,
          source: "fallback",
        },
        lbs_per_bushel: {
          name: "lbs_per_bushel",
          value: 56,
          source: "fallback",
        },
      });
      // Simulate formula search failure
      mockFormulaSearch.mockRejectedValueOnce(new Error("DB unavailable"));

      const result = await service.calculateYieldEstimate({
        whiskeyType: EnumRecipeWhiskeyType.RyeBourbon,
        totalBarrels: 500,
        entryProof: 125,
        grainPerCook: 23000,
        cooksPerFerm: 3,
      });

      // Should still produce correct results using fallback expressions
      expect(result.grainUnitsPerFerm).toBeCloseTo(1232.14, 1);
      expect(result.estimatedPGsPerBbl).toBeCloseTo(66.34, 1);
      expect(result.totalFermenters).toBeGreaterThan(0);
    });

    it("should call solver when grainPerCook not provided", async () => {
      mockResolveMetrics.mockResolvedValue({
        yield_pg_per_gu: {
          name: "yield_pg_per_gu",
          value: 5.2,
          source: "exact",
        },
        avg_barrel_fill_gallons: {
          name: "avg_barrel_fill_gallons",
          value: 53.07,
          source: "fallback",
        },
        cooks_per_fermenter: {
          name: "cooks_per_fermenter",
          value: 3,
          source: "fallback",
        },
        lbs_per_bushel: {
          name: "lbs_per_bushel",
          value: 56,
          source: "fallback",
        },
      });
      // Mock getMetricValue for solver grain limits
      const mockGetMetricValue = jest
        .fn()
        .mockImplementation(async (name: string) => {
          if (name === "min_grain_per_cook") return { value: 17750 };
          if (name === "max_grain_per_cook") return { value: 24080 };
          if (name === "overshoot_target") return { value: 1.01 };
          return null;
        });
      (metricService as any).getMetricValue = mockGetMetricValue;

      const result = await service.calculateYieldEstimate({
        whiskeyType: EnumRecipeWhiskeyType.RyeBourbon,
        totalBarrels: 800,
        entryProof: 125,
        // grainPerCook NOT provided — solver should run
      });

      // Solver should have computed grainPerCook, not defaulted to 23000
      const grainMetric = result.metricsUsed.find(
        (m) => m.name === "grainPerCook"
      );
      expect(grainMetric).toBeDefined();
      // Solver should produce a value in the bourbon range [17750, 24080]
      expect(grainMetric!.value).toBeGreaterThanOrEqual(17750);
      expect(grainMetric!.value).toBeLessThanOrEqual(24080);
      // Should include solver metadata
      expect(
        result.metricsUsed.find((m) => m.name === "solverFermenters")
      ).toBeDefined();
    });

    it("should log formula executions to FormulaExecutionLog", async () => {
      mockResolveMetrics.mockResolvedValue({
        yield_pg_per_gu: {
          name: "yield_pg_per_gu",
          value: 5.2,
          source: "exact",
        },
        avg_barrel_fill_gallons: {
          name: "avg_barrel_fill_gallons",
          value: 53.07,
          source: "fallback",
        },
        cooks_per_fermenter: {
          name: "cooks_per_fermenter",
          value: 3,
          source: "fallback",
        },
        lbs_per_bushel: {
          name: "lbs_per_bushel",
          value: 56,
          source: "fallback",
        },
      });

      await service.calculateYieldEstimate({
        whiskeyType: EnumRecipeWhiskeyType.RyeBourbon,
        totalBarrels: 500,
        entryProof: 125,
        grainPerCook: 23000,
        cooksPerFerm: 3,
      });

      // Should have logged 6 formula executions (one per step)
      expect(mockLogCreate).toHaveBeenCalledTimes(6);
      // First call should be for Grain Units per Fermenter
      expect(mockLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            formulaId: "f1",
            success: true,
          }),
        })
      );
    });
  });

  /**
   * Validation against WHK Beer Chemistry H2 2024.xlsx — "2026 Production Planning" tab.
   * Each case supplies the spreadsheet's grain/cook (column I) directly so we test
   * the formula chain, not the solver. estBarrelYield and fcstAttainment are the
   * PRD CALC-04 / CALC-06 fields we just added.
   *
   * Spreadsheet header: Avg Brl Fill = 53.07, Planned Yield = 5.2 (bourbon) / 4.9 (rye/whiskey)
   */
  describe("Spreadsheet validation — 2026 Production Planning", () => {
    /** Standard metric mock factory */
    const makeMetrics = (yieldRate: number) => ({
      yield_pg_per_gu: {
        name: "yield_pg_per_gu",
        value: yieldRate,
        source: "exact",
      },
      avg_barrel_fill_gallons: {
        name: "avg_barrel_fill_gallons",
        value: 53.07,
        source: "fallback",
      },
      cooks_per_fermenter: {
        name: "cooks_per_fermenter",
        value: 3,
        source: "fallback",
      },
      lbs_per_bushel: { name: "lbs_per_bushel", value: 56, source: "fallback" },
    });

    it("BGA Jan — Bourbon 78-10-00-12, 720 bbl, 125 proof, 22833 grain/cook, 8 ferms (manual)", async () => {
      // Spreadsheet row 3: scheduled_ferms=8 (manual override), est_bbl=767.06, attain=106.5%
      mockResolveMetrics.mockResolvedValue(makeMetrics(5.2));

      const result = await service.calculateYieldEstimate({
        whiskeyType: EnumRecipeWhiskeyType.RyeBourbon,
        totalBarrels: 720,
        entryProof: 125,
        grainPerCook: 22833,
        cooksPerFerm: 3,
      });

      // GU/Ferm = 22833 * 3 / 56 = 1223.196
      expect(result.grainUnitsPerFerm).toBeCloseTo(1223.196, 2);
      // PG/BBL = 1.25 * 53.07 = 66.3375
      expect(result.estimatedPGsPerBbl).toBeCloseTo(66.34, 1);
      // PG/Ferm = 1223.196 * 5.2 = 6360.62
      expect(result.pgPerFerm).toBeCloseTo(6360.62, 1);
      // BBL/Ferm = 6360.62 / 66.3375 ≈ 95.88
      expect(result.estimatedBarrelsPerFermenter).toBeCloseTo(95.88, 1);
      // totalFermenters = CEIL(720 / 95.88) = 8
      expect(result.totalFermenters).toBe(8);
      // estBarrelYield = 8 * 95.88 = 767.06 (spreadsheet: 767.06 ✓)
      expect(result.estBarrelYield).toBeCloseTo(767.06, 0);
      // daysProduction = 8 / 4 = 2
      expect(result.daysProduction).toBeCloseTo(2, 0);
      // fcstAttainment = 767.06 / 720 ≈ 1.065 (spreadsheet Fcst Attainment: 1.065 ✓)
      expect(result.fcstAttainment).toBeCloseTo(1.065, 2);
    });

    it("WSC Jan — Bourbon 74-18-00-08, 3150 bbl, 125 proof, 24080 grain/cook, solver", async () => {
      // Spreadsheet row 6: est_bbl=3033.58 at 30 ferms (manual). Our solver gives 32 ferms at 101%.
      // This tests the formula chain with max grain — solver case.
      mockResolveMetrics.mockResolvedValue(makeMetrics(5.2));

      const result = await service.calculateYieldEstimate({
        whiskeyType: EnumRecipeWhiskeyType.RyeBourbon,
        totalBarrels: 3150,
        entryProof: 125,
        grainPerCook: 24080,
        cooksPerFerm: 3,
      });

      // GU/Ferm = 24080 * 3 / 56 = 1290
      expect(result.grainUnitsPerFerm).toBeCloseTo(1290, 1);
      // PG/Ferm = 1290 * 5.2 = 6708
      expect(result.pgPerFerm).toBeCloseTo(6708, 0);
      // BBL/Ferm = 6708 / 66.3375 ≈ 101.12
      expect(result.estimatedBarrelsPerFermenter).toBeCloseTo(101.12, 1);
      // totalFermenters = CEIL(3150 / 101.12) = 32 (solver; spreadsheet manual=30)
      expect(result.totalFermenters).toBe(32);
      // estBarrelYield = 32 * 101.12 = 3235.8 (all 32 ferms at 101.12 bbl each)
      expect(result.estBarrelYield).toBeCloseTo(3235.8, 0);
      // fcstAttainment = 3235.8 / 3150 ≈ 1.027
      expect(result.fcstAttainment).toBeCloseTo(1.027, 2);
    });

    it("WSC Jan — Rye 00-91-00-09, 525 bbl, 125 proof, 19143 grain/cook, 7 ferms", async () => {
      // Spreadsheet row 15: est_bbl=530.26, attain=1.010 — solver-computed run
      mockResolveMetrics.mockResolvedValue(makeMetrics(4.9));

      const result = await service.calculateYieldEstimate({
        whiskeyType: EnumRecipeWhiskeyType.RyeWhiskey,
        totalBarrels: 525,
        entryProof: 125,
        grainPerCook: 19143.333,
        cooksPerFerm: 3,
      });

      // GU/Ferm = 19143.333 * 3 / 56 = 1025.536
      expect(result.grainUnitsPerFerm).toBeCloseTo(1025.536, 2);
      // PG/Ferm = 1025.536 * 4.9 = 5025.125
      expect(result.pgPerFerm).toBeCloseTo(5025.13, 1);
      // BBL/Ferm = 5025.125 / 66.3375 = 75.76
      expect(result.estimatedBarrelsPerFermenter).toBeCloseTo(75.76, 1);
      // totalFermenters = CEIL(525 / 75.76) = 7
      expect(result.totalFermenters).toBe(7);
      // estBarrelYield = 7 * 75.76 = 530.26 (spreadsheet: 530.26 ✓)
      expect(result.estBarrelYield).toBeCloseTo(530.26, 0);
      // daysProduction = 7 / 4 = 1.75 (spreadsheet: 1.75 ✓)
      expect(result.daysProduction).toBeCloseTo(1.75, 2);
      // fcstAttainment = 530.26 / 525 ≈ 1.010 (spreadsheet: 1.010 ✓)
      expect(result.fcstAttainment).toBeCloseTo(1.01, 2);
    });

    it("CBI Feb — Bourbon 80-10-00-10, 713 bbl, 120 proof, 23518 grain/cook, 7 ferms", async () => {
      // Spreadsheet row 27: proof=120, est_bbl=720.14, attain=1.010
      mockResolveMetrics.mockResolvedValue(makeMetrics(5.2));

      const result = await service.calculateYieldEstimate({
        whiskeyType: EnumRecipeWhiskeyType.RyeBourbon,
        totalBarrels: 713,
        entryProof: 120,
        grainPerCook: 23518.667,
        cooksPerFerm: 3,
      });

      // PG/BBL = (120/100) * 53.07 = 63.684
      expect(result.estimatedPGsPerBbl).toBeCloseTo(63.684, 2);
      // GU/Ferm = 23518.667 * 3 / 56 = 1259.929
      expect(result.grainUnitsPerFerm).toBeCloseTo(1259.929, 2);
      // PG/Ferm = 1259.929 * 5.2 = 6551.63
      expect(result.pgPerFerm).toBeCloseTo(6551.63, 1);
      // BBL/Ferm = 6551.63 / 63.684 ≈ 102.87
      expect(result.estimatedBarrelsPerFermenter).toBeCloseTo(102.87, 1);
      // totalFermenters = CEIL(713 / 102.87) = 7
      expect(result.totalFermenters).toBe(7);
      // estBarrelYield = 7 * 102.87 = 720.07 (spreadsheet: 720.14 ✓)
      expect(result.estBarrelYield).toBeCloseTo(720.1, 0);
      // daysProduction = 7 / 4 = 1.75 (spreadsheet: 1.75 ✓)
      expect(result.daysProduction).toBeCloseTo(1.75, 2);
      // fcstAttainment ≈ 1.010 (spreadsheet: 1.010 ✓)
      expect(result.fcstAttainment).toBeCloseTo(1.01, 2);
    });

    it("TEF Feb — Whiskey 00-00-00-00, 50 bbl, 120 proof, 17750 grain/cook, 1 ferm (min grain)", async () => {
      // Spreadsheet row 33: est_bbl=73.16, attain=1.463 — min grain case
      mockResolveMetrics.mockResolvedValue(makeMetrics(4.9));

      const result = await service.calculateYieldEstimate({
        whiskeyType: EnumRecipeWhiskeyType.WheatWhiskey,
        totalBarrels: 50,
        entryProof: 120,
        grainPerCook: 17750,
        cooksPerFerm: 3,
      });

      // PG/BBL = (120/100) * 53.07 = 63.684
      expect(result.estimatedPGsPerBbl).toBeCloseTo(63.684, 2);
      // GU/Ferm = 17750 * 3 / 56 = 950.893
      expect(result.grainUnitsPerFerm).toBeCloseTo(950.893, 2);
      // PG/Ferm = 950.893 * 4.9 = 4659.375
      expect(result.pgPerFerm).toBeCloseTo(4659.375, 1);
      // BBL/Ferm = 4659.375 / 63.684 ≈ 73.17
      expect(result.estimatedBarrelsPerFermenter).toBeCloseTo(73.17, 1);
      // totalFermenters = CEIL(50 / 73.17) = 1
      expect(result.totalFermenters).toBe(1);
      // estBarrelYield = 1 * 73.17 = 73.17 (spreadsheet: 73.16 ✓)
      expect(result.estBarrelYield).toBeCloseTo(73.16, 0);
      // daysProduction = 1 / 4 = 0.25 (spreadsheet: 0.25 ✓)
      expect(result.daysProduction).toBeCloseTo(0.25, 2);
      // fcstAttainment = 73.17 / 50 ≈ 1.463 (spreadsheet: 1.463 ✓)
      expect(result.fcstAttainment).toBeCloseTo(1.463, 2);
    });

    it("ULP Feb — Bourbon 75-21-00-04, 1250 bbl, 125 proof, 23126 grain/cook, 13 ferms", async () => {
      // Spreadsheet row 21: est_bbl=1262.51, attain=1.010
      mockResolveMetrics.mockResolvedValue(makeMetrics(5.2));

      const result = await service.calculateYieldEstimate({
        whiskeyType: EnumRecipeWhiskeyType.RyeBourbon,
        totalBarrels: 1250,
        entryProof: 125,
        grainPerCook: 23126.667,
        cooksPerFerm: 3,
      });

      expect(result.totalFermenters).toBe(13);
      // estBarrelYield = 13 * bblPerFerm (spreadsheet: 1262.51 ✓)
      expect(result.estBarrelYield).toBeCloseTo(1262.5, 0);
      // daysProduction = 13 / 4 = 3.25 (spreadsheet: 3.25 ✓)
      expect(result.daysProduction).toBeCloseTo(3.25, 2);
      expect(result.fcstAttainment).toBeCloseTo(1.01, 2);
    });
  });

  describe("solveGrainPerCook", () => {
    beforeEach(() => {
      // Default grain limit mocks — overridden per test as needed
      const mockGetMetricValue = jest
        .fn()
        .mockImplementation(async (name: string) => {
          if (name === "min_grain_per_cook") return { value: 17750 };
          if (name === "max_grain_per_cook") return { value: 24080 }; // default/bourbon
          if (name === "overshoot_target") return { value: 1.01 };
          return null;
        });
      (metricService as any).getMetricValue = mockGetMetricValue;
    });

    it("should solve Rye Whiskey: 500bbl → ~18232 grain/cook, 7 fermenters", async () => {
      // Rye max grain = 20500
      const mockGetMetricValue = jest
        .fn()
        .mockImplementation(async (name: string) => {
          if (name === "min_grain_per_cook") return { value: 17750 };
          if (name === "max_grain_per_cook") return { value: 20500 }; // Rye limit
          if (name === "overshoot_target") return { value: 1.01 };
          return null;
        });
      (metricService as any).getMetricValue = mockGetMetricValue;

      const result = await service.solveGrainPerCook(
        EnumRecipeWhiskeyType.RyeWhiskey,
        500, // contractBarrels
        125, // entryProof
        3, // cooksPerFerm
        53.07, // avgBarrelFill
        4.9, // yieldRate (rye)
        56 // lbsPerBushel
      );

      expect(result.scheduledFermenters).toBe(7);
      expect(result.grainPerCook).toBe(18232);
      expect(result.minGrain).toBe(17750);
      expect(result.maxGrain).toBe(20500);
    });

    it("should solve Bourbon: 800bbl → 24052 grain/cook, 8 fermenters", async () => {
      const result = await service.solveGrainPerCook(
        EnumRecipeWhiskeyType.RyeBourbon,
        800, // contractBarrels
        125, // entryProof
        3, // cooksPerFerm
        53.07, // avgBarrelFill
        5.2, // yieldRate (bourbon)
        56 // lbsPerBushel
      );

      expect(result.scheduledFermenters).toBe(8);
      expect(result.grainPerCook).toBe(24052);
      expect(result.maxGrain).toBe(24080);
    });

    it("should solve large Bourbon: 3000bbl → 24052 grain/cook, 30 fermenters", async () => {
      const result = await service.solveGrainPerCook(
        EnumRecipeWhiskeyType.RyeBourbon,
        3000, // contractBarrels
        125, // entryProof
        3, // cooksPerFerm
        53.07, // avgBarrelFill
        5.2, // yieldRate (bourbon)
        56 // lbsPerBushel
      );

      expect(result.scheduledFermenters).toBe(30);
      expect(result.grainPerCook).toBe(24052);
    });

    it("should clamp to min grain for very small orders", async () => {
      const result = await service.solveGrainPerCook(
        EnumRecipeWhiskeyType.WheatWhiskey,
        10, // very small order
        125,
        3,
        53.07,
        4.9,
        56
      );

      // minFermenters should be 1, grainPerCook clamped to minGrain
      expect(result.scheduledFermenters).toBe(1);
      expect(result.grainPerCook).toBe(17750);
    });

    it("should use fallback values when metrics are missing", async () => {
      // All metrics return null
      const mockGetMetricValue = jest.fn().mockResolvedValue(null);
      (metricService as any).getMetricValue = mockGetMetricValue;

      const result = await service.solveGrainPerCook(
        EnumRecipeWhiskeyType.RyeBourbon,
        800,
        125,
        3,
        53.07,
        5.2,
        56
      );

      // Should use hardcoded fallbacks: minGrain=17750, maxGrain=24080, overshoot=1.01
      expect(result.minGrain).toBe(17750);
      expect(result.maxGrain).toBe(24080);
      expect(result.scheduledFermenters).toBe(8);
    });

    it("should produce exactly 1 fermenter for minimal order", async () => {
      const result = await service.solveGrainPerCook(
        EnumRecipeWhiskeyType.RyeBourbon,
        1, // 1 barrel
        125,
        3,
        53.07,
        5.2,
        56
      );

      expect(result.scheduledFermenters).toBe(1);
      // Even 1 barrel needs min grain per cook
      expect(result.grainPerCook).toBe(17750);
    });
  });
});
