import { Injectable, Logger } from "@nestjs/common";
import { EnumRecipeWhiskeyType } from "@prisma/client";
import { ProductionMetricService } from "../productionMetric/productionMetric.service";
import { ExpressionEngineService } from "../expressionEngine/expression-engine.service";
import { FormulaLibraryService } from "../formulaLibrary/formula-library.service";
import { PrismaService } from "../prisma/prisma.service";

export interface YieldEstimateInput {
  whiskeyType: EnumRecipeWhiskeyType;
  totalBarrels: number;
  entryProof: number;
  containerType?: string; // LargeBarrel=53gal, SmallBarrel=30gal
  grainPerCook?: number; // from recipe/SO, or fall back to solver
  cooksPerFerm?: number; // from Recipe.cooksPerFerm, default 3
  yieldRateOverride?: number; // manual override
}

export interface SolverResult {
  grainPerCook: number;
  scheduledFermenters: number;
  grainPerFerm: number;
  targetPG: number;
  minGrain: number;
  maxGrain: number;
}

export interface YieldEstimateResult {
  estimatedPGsPerBushel: number;
  estimatedPGsPerBbl: number;
  estimatedBarrelsPerFermenter: number;
  totalProofGallons: number;
  totalGrainWeight: number;
  totalCooks: number;
  totalFermenters: number;
  grainUnitsPerFerm: number;
  pgPerFerm: number;
  totalBarrels: number;
  plannedCooks: number;
  plannedFermenters: number;
  /** PRD CALC-04: projected barrels from scheduled fermenters (≥ totalBarrels) */
  estBarrelYield: number;
  /** PRD CALC-05: production days at 4 fermenters/day */
  daysProduction: number;
  /** PRD CALC-06: estBarrelYield / totalBarrels (target ~1.01) */
  fcstAttainment: number;
  metricsUsed: { name: string; value: number }[];
}

interface CachedFormula {
  expression: string;
  id: string;
}

/** Ordered steps for sequential formula evaluation */
const FORMULA_STEPS: {
  name: string;
  contextKey: string;
  fallback: string;
}[] = [
  {
    name: "Grain Units per Fermenter",
    contextKey: "grainUnitsPerFerm",
    fallback: "grainPerCook * cooksPerFerm / lbsPerBushel",
  },
  {
    name: "Proof Gallons per Barrel",
    contextKey: "pgPerBarrel",
    fallback: "(entryProof / 100) * avgBarrelFill",
  },
  {
    name: "Proof Gallons per Fermenter",
    contextKey: "pgPerFerm",
    fallback: "grainUnitsPerFerm * yieldRate",
  },
  {
    name: "Barrels per Fermenter",
    contextKey: "bblPerFerm",
    fallback: "pgPerFerm / pgPerBarrel",
  },
  {
    name: "Total Fermenters Required",
    contextKey: "totalFermenters",
    fallback: "CEIL(totalBarrels / bblPerFerm)",
  },
  {
    name: "Total Grain Weight",
    contextKey: "totalGrainWeight",
    fallback: "totalCooks * grainPerCook",
  },
];

@Injectable()
export class YieldEstimationService {
  private readonly logger = new Logger(YieldEstimationService.name);

  /** Cached yield formulas: Map<name, { expression, id }> */
  private formulaCache: Map<string, CachedFormula> | null = null;
  private formulaCacheExpiry = 0;
  private static readonly CACHE_TTL_MS = 30_000;

  constructor(
    private readonly productionMetricService: ProductionMetricService,
    private readonly expressionEngineService: ExpressionEngineService,
    private readonly formulaLibraryService: FormulaLibraryService,
    private readonly prisma: PrismaService
  ) {}

  /**
   * Load yield formulas from FormulaLibrary with 30s cache TTL.
   */
  private async getYieldFormulas(): Promise<Map<string, CachedFormula>> {
    const now = Date.now();
    if (this.formulaCache && now < this.formulaCacheExpiry) {
      return this.formulaCache;
    }

    try {
      const formulas = await this.formulaLibraryService.search({
        category: "Yield",
        isActive: true,
      });

      const map = new Map<string, CachedFormula>();
      for (const f of formulas) {
        map.set(f.name, { expression: f.expression, id: f.id });
      }

      this.formulaCache = map;
      this.formulaCacheExpiry = now + YieldEstimationService.CACHE_TTL_MS;
      this.logger.debug(`Loaded ${map.size} yield formulas into cache`);
      return map;
    } catch (err) {
      this.logger.warn(
        `Failed to load yield formulas, using fallbacks: ${err}`
      );
      return new Map();
    }
  }

  /**
   * Evaluate a single formula step via the expression engine.
   * Falls back to the hardcoded expression on any failure.
   */
  private async evaluateStep(
    formulaName: string,
    fallbackExpression: string,
    context: Record<string, number>,
    formulas: Map<string, CachedFormula>
  ): Promise<number> {
    const formula = formulas.get(formulaName);
    const expression = formula?.expression ?? fallbackExpression;

    try {
      const result = await this.expressionEngineService.evaluate(
        expression,
        context
      );

      if (result.success && result.value != null) {
        // Fire-and-forget execution log
        if (formula) {
          this.prisma.formulaExecutionLog
            .create({
              data: {
                formulaId: formula.id,
                expression,
                variables: context as any,
                result: result.value,
                executionTimeMs: result.executionTimeMs,
                success: true,
              },
            })
            .catch((e) =>
              this.logger.warn(`Failed to log formula execution: ${e}`)
            );
        }
        return result.value;
      }

      // Expression engine returned failure — try fallback if we used a DB formula
      if (formula && expression !== fallbackExpression) {
        this.logger.warn(
          `Formula "${formulaName}" eval failed (${result.error}), using fallback`
        );
        const fallbackResult = await this.expressionEngineService.evaluate(
          fallbackExpression,
          context
        );
        if (fallbackResult.success && fallbackResult.value != null) {
          return fallbackResult.value;
        }
      }

      throw new Error(result.error ?? "Expression returned no value");
    } catch (err) {
      this.logger.warn(`Formula step "${formulaName}" failed: ${err}`);
      // Last-resort: try fallback expression
      try {
        const fallbackResult = await this.expressionEngineService.evaluate(
          fallbackExpression,
          context
        );
        if (fallbackResult.success && fallbackResult.value != null) {
          return fallbackResult.value;
        }
      } catch {
        // ignore
      }
      throw err;
    }
  }

  /**
   * Core yield calculation chain:
   *   GU_per_Ferm = grainPerCook * cooksPerFerm / lbsPerBushel
   *   PG_per_Barrel = (entryProof / 100) * avgBarrelFill
   *   PG_per_Ferm = GU_per_Ferm * yieldRate
   *   BBL_per_Ferm = PG_per_Ferm / PG_per_Barrel
   */
  async calculateYieldEstimate(
    input: YieldEstimateInput
  ): Promise<YieldEstimateResult> {
    const metricsUsed: { name: string; value: number }[] = [];

    // Step 1 — Resolve metrics from ProductionMetricService (unchanged)
    const metrics =
      await this.productionMetricService.resolveMetricsForWhiskeyType(
        input.whiskeyType
      );

    // --- Resolve individual parameters ---

    const yieldRate =
      input.yieldRateOverride ??
      metrics["yield_pg_per_gu"]?.value ??
      this.getDefaultYieldRate(input.whiskeyType);
    metricsUsed.push({ name: "yieldRate", value: yieldRate });

    const avgBarrelFill =
      metrics["avg_barrel_fill_gallons"]?.value ??
      this.getDefaultBarrelFill(input.containerType);
    metricsUsed.push({ name: "avgBarrelFill", value: avgBarrelFill });

    const cooksPerFerm =
      input.cooksPerFerm ?? metrics["cooks_per_fermenter"]?.value ?? 3;
    metricsUsed.push({ name: "cooksPerFerm", value: cooksPerFerm });

    const lbsPerBushel = metrics["lbs_per_bushel"]?.value ?? 56;
    metricsUsed.push({ name: "lbsPerBushel", value: lbsPerBushel });

    // Resolve grainPerCook: use provided value, or run solver, or fall back to 23000
    let grainPerCook: number;
    let solverResult: SolverResult | null = null;
    if (input.grainPerCook != null) {
      grainPerCook = input.grainPerCook;
    } else {
      try {
        solverResult = await this.solveGrainPerCook(
          input.whiskeyType,
          input.totalBarrels,
          input.entryProof || 125,
          cooksPerFerm,
          avgBarrelFill,
          yieldRate,
          lbsPerBushel
        );
        grainPerCook = solverResult.grainPerCook;
        metricsUsed.push({
          name: "solverFermenters",
          value: solverResult.scheduledFermenters,
        });
        metricsUsed.push({
          name: "solverTargetPG",
          value: solverResult.targetPG,
        });
        metricsUsed.push({
          name: "solverMinGrain",
          value: solverResult.minGrain,
        });
        metricsUsed.push({
          name: "solverMaxGrain",
          value: solverResult.maxGrain,
        });
      } catch (err) {
        this.logger.warn(`Grain solver failed, using 23000 default: ${err}`);
        grainPerCook = 23000;
      }
    }
    metricsUsed.push({ name: "grainPerCook", value: grainPerCook });

    const entryProof = input.entryProof || 125;
    metricsUsed.push({ name: "entryProof", value: entryProof });

    // Step 2 — Load yield formulas from cache
    const formulas = await this.getYieldFormulas();

    // Step 3 — Build context with all input variables
    const context: Record<string, number> = {
      grainPerCook,
      cooksPerFerm,
      lbsPerBushel,
      entryProof,
      avgBarrelFill,
      yieldRate,
      totalBarrels: input.totalBarrels,
    };

    // Step 4 — Evaluate formulas sequentially, each feeding results into context
    for (const step of FORMULA_STEPS) {
      // Between steps 5 and 6: compute totalCooks
      if (step.contextKey === "totalGrainWeight") {
        const totalFermenters = context["totalFermenters"];
        context["totalCooks"] = totalFermenters * cooksPerFerm;
      }

      const value = await this.evaluateStep(
        step.name,
        step.fallback,
        context,
        formulas
      );
      context[step.contextKey] = value;
    }

    // Extract computed values
    const grainUnitsPerFerm = context["grainUnitsPerFerm"];
    const pgPerBarrel = context["pgPerBarrel"];
    const pgPerFerm = context["pgPerFerm"];
    const bblPerFerm = context["bblPerFerm"];
    const totalFermenters = context["totalFermenters"];
    const totalCooks = context["totalCooks"];
    const totalGrainWeight = context["totalGrainWeight"];
    const totalProofGallons = input.totalBarrels * pgPerBarrel;

    // PRD CALC-04: projected barrels from scheduled fermenters (N × PG/Ferm / PG/BBL)
    const estBarrelYield = totalFermenters * bblPerFerm;
    // PRD CALC-05: days at 4 fermenters/day
    const daysProduction = totalFermenters / 4;
    // PRD CALC-06: forecast attainment ratio
    const fcstAttainment =
      input.totalBarrels > 0 ? estBarrelYield / input.totalBarrels : 0;

    this.logger.debug(
      `Yield estimate: ${input.whiskeyType} — ` +
        `GU/Ferm=${grainUnitsPerFerm.toFixed(1)}, ` +
        `PG/BBL=${pgPerBarrel.toFixed(1)}, ` +
        `PG/Ferm=${pgPerFerm.toFixed(1)}, ` +
        `BBL/Ferm=${bblPerFerm.toFixed(1)}, ` +
        `Fermenters=${totalFermenters}, Cooks=${totalCooks}`
    );

    // Step 5 — Return result
    return {
      estimatedPGsPerBushel: yieldRate,
      estimatedPGsPerBbl: Math.round(pgPerBarrel * 100) / 100,
      estimatedBarrelsPerFermenter: Math.round(bblPerFerm * 10) / 10,
      totalProofGallons: Math.round(totalProofGallons * 100) / 100,
      totalGrainWeight: Math.round(totalGrainWeight),
      totalCooks,
      totalFermenters,
      grainUnitsPerFerm: Math.round(grainUnitsPerFerm * 100) / 100,
      pgPerFerm: Math.round(pgPerFerm * 100) / 100,
      totalBarrels: input.totalBarrels,
      plannedCooks: totalCooks,
      plannedFermenters: totalFermenters,
      estBarrelYield: Math.round(estBarrelYield * 100) / 100,
      daysProduction: Math.round(daysProduction * 100) / 100,
      fcstAttainment: Math.round(fcstAttainment * 10000) / 10000,
      metricsUsed,
    };
  }

  /**
   * Preview only — same calculation, no side effects.
   */
  async previewYieldEstimate(
    input: YieldEstimateInput
  ): Promise<YieldEstimateResult> {
    return this.calculateYieldEstimate(input);
  }

  /**
   * Recalculate yield for an existing schedule order, pulling its data.
   * (Schedule order lookup is handled by the caller / resolver.)
   */
  async recalculateForScheduleOrder(
    whiskeyType: EnumRecipeWhiskeyType,
    totalBarrels: number,
    entryProof: number,
    containerType?: string,
    grainPerCook?: number,
    cooksPerFerm?: number
  ): Promise<YieldEstimateResult> {
    return this.calculateYieldEstimate({
      whiskeyType,
      totalBarrels,
      entryProof,
      containerType,
      grainPerCook,
      cooksPerFerm,
    });
  }

  // --- Grain/Fermenter Solver (PRD Section 6B — simplified min-fermenter solver) ---

  /**
   * Solves for optimal grainPerCook and minimum fermenters to produce
   * 101% of contracted PG within equipment grain limits.
   *
   * Steps:
   *  1. Calculate PG yield per pound of grain
   *  2. Calculate target PG (contract barrels * PG/barrel * overshoot)
   *  3. Calculate max grain per fermenter (maxGrainPerCook * cooksPerFerm)
   *  4. Find minimum fermenters: ceil(targetPG / (maxGrainPerFerm * pgPerLb))
   *  5. Distribute grain evenly across fermenters, clamped to [min, max]
   *  6. Return grainPerCook = ceil(grainPerFerm / cooksPerFerm)
   */
  async solveGrainPerCook(
    whiskeyType: EnumRecipeWhiskeyType,
    contractBarrels: number,
    entryProof: number,
    cooksPerFerm: number,
    avgBarrelFill: number,
    yieldRate: number,
    lbsPerBushel: number
  ): Promise<SolverResult> {
    // Resolve grain limits from ProductionMetric
    const minGrainMetric = await this.productionMetricService.getMetricValue(
      "min_grain_per_cook",
      whiskeyType
    );
    const maxGrainMetric = await this.productionMetricService.getMetricValue(
      "max_grain_per_cook",
      whiskeyType
    );
    const overshootMetric = await this.productionMetricService.getMetricValue(
      "overshoot_target",
      null
    );

    const minGrain = minGrainMetric?.value ?? 17750;
    const maxGrain = maxGrainMetric?.value ?? 24080;
    const overshoot = overshootMetric?.value ?? 1.01;

    // Per-pound yield: PG per lb of grain
    const pgPerLb = yieldRate / lbsPerBushel;

    // Target PG
    const pgPerBarrel = (entryProof / 100) * avgBarrelFill;
    const targetPG = contractBarrels * pgPerBarrel * overshoot;

    // Max grain per fermenter
    const maxGrainPerFerm = maxGrain * cooksPerFerm;

    // Max PG per fermenter at max grain
    const maxPGPerFerm = maxGrainPerFerm * pgPerLb;

    // Minimum fermenters needed
    const minFermenters = Math.max(1, Math.ceil(targetPG / maxPGPerFerm));

    // Grain needed per fermenter to hit target
    const grainPerFermNeeded = targetPG / (minFermenters * pgPerLb);

    // Clamp grain per fermenter to equipment limits
    const minGrainPerFerm = minGrain * cooksPerFerm;
    const grainPerFerm = Math.min(
      Math.max(grainPerFermNeeded, minGrainPerFerm),
      maxGrainPerFerm
    );

    // Grain per cook (round up to whole lbs)
    const grainPerCook = Math.ceil(grainPerFerm / cooksPerFerm);

    this.logger.debug(
      `Solver: ${whiskeyType} — ` +
        `targetPG=${targetPG.toFixed(0)}, minFerm=${minFermenters}, ` +
        `grainPerCook=${grainPerCook}, limits=[${minGrain}, ${maxGrain}]`
    );

    return {
      grainPerCook,
      scheduledFermenters: minFermenters,
      grainPerFerm,
      targetPG,
      minGrain,
      maxGrain,
    };
  }

  // --- Defaults ---

  private getDefaultYieldRate(whiskeyType: EnumRecipeWhiskeyType): number {
    switch (whiskeyType) {
      case "RyeBourbon":
      case "WheatedBourbon":
      case "FourGrainBourbon":
        return 5.2;
      default:
        return 4.9;
    }
  }

  private getDefaultBarrelFill(containerType?: string): number {
    switch (containerType) {
      case "SmallBarrel":
        return 30;
      default:
        return 53.07;
    }
  }
}
