import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Parser } from "expr-eval";
import { PrismaService } from "../prisma/prisma.service";

export interface ExpressionContext {
  // Load inputs
  grainLoad: number;
  waterLoad?: number;
  mashBill?: string;

  // Parsed mash bill components (legacy)
  corn: number;
  rye: number;
  wheat: number;
  malt: number;

  // Constants
  lbsPerBushel: number;
  gallonsPerBushel: number;
  metricTonDivisor: number;

  [key: string]: any;
}

/**
 * Grain character input for dynamic grain percentages
 * Allows formulas to use abbreviations like C, R, W, M, Y, S, B, O, Z
 * with optional variety codes like C1, C2, R1
 */
export interface GrainCharacterInput {
  abbreviation: string;
  varietyCode?: string;
  percentage: number;
}

export interface ExpressionResult {
  success: boolean;
  value?: number;
  error?: string;
  executionTimeMs: number;
  variablesUsed: string[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  detectedVariables: string[];
  requiredVariables: string[];
}

@Injectable()
export class ExpressionEngineService implements OnModuleInit {
  private readonly logger = new Logger(ExpressionEngineService.name);
  private readonly parser: Parser;
  private dynamicFunctionsRegistered = false;

  constructor(private readonly prisma: PrismaService) {
    this.parser = new Parser();
    this.registerSystemFunctions();
  }

  async onModuleInit() {
    await this.registerDynamicFunctions();
  }

  /**
   * Register dynamic functions from database
   * Called on module init and can be called manually to refresh
   */
  async registerDynamicFunctions(): Promise<void> {
    try {
      const functions = await this.prisma.formulaFunction.findMany({
        where: {
          isActive: true,
          implementationType: { in: ["EXPRESSION", "UNIT_CONVERSION"] },
        },
        include: {
          fromUnit: true,
          toUnit: true,
        },
      });

      for (const func of functions) {
        try {
          if (func.implementationType === "EXPRESSION" && func.expression) {
            // Register expression-based function
            // The expression uses 'x' as the input variable (for single-arg functions)
            // or 'x', 'y', 'z' for multi-arg functions
            const expr = this.parser.parse(func.expression);
            this.parser.functions[func.name] = (
              x: number,
              y?: number,
              z?: number
            ) => {
              return expr.evaluate({ x, y: y ?? 0, z: z ?? 0 });
            };
            this.logger.debug(
              `Registered EXPRESSION function: ${func.name} = ${func.expression}`
            );
          } else if (
            func.implementationType === "UNIT_CONVERSION" &&
            func.fromUnit &&
            func.toUnit
          ) {
            // Register unit conversion function
            // Use the conversions JSON field or calculate from base units
            const conversionRate = this.getConversionRate(
              func.fromUnit,
              func.toUnit
            );
            if (conversionRate !== null) {
              this.parser.functions[func.name] = (value: number) =>
                value * conversionRate;
              this.logger.debug(
                `Registered UNIT_CONVERSION function: ${func.name} (rate: ${conversionRate})`
              );
            } else {
              this.logger.warn(
                `Could not determine conversion rate for ${func.name}: ${func.fromUnit.name} -> ${func.toUnit.name}`
              );
            }
          }
        } catch (error) {
          this.logger.error(
            `Failed to register function ${func.name}: ${error}`
          );
        }
      }

      this.dynamicFunctionsRegistered = true;
      this.logger.log(
        `Registered ${functions.length} dynamic functions from database`
      );
    } catch (error) {
      this.logger.error("Failed to register dynamic functions", error);
    }
  }

  /**
   * Calculate conversion rate between two units
   * Tries to use the conversions JSON field, or calculate via base units
   */
  private getConversionRate(fromUnit: any, toUnit: any): number | null {
    // Check if fromUnit has direct conversion to toUnit in its conversions JSON
    if (fromUnit.conversions) {
      const conversions = fromUnit.conversions as Record<string, number>;
      if (conversions[toUnit.id] !== undefined) {
        return conversions[toUnit.id];
      }
      if (conversions[toUnit.name] !== undefined) {
        return conversions[toUnit.name];
      }
      if (conversions[toUnit.abbreviation] !== undefined) {
        return conversions[toUnit.abbreviation];
      }
    }

    // Check if toUnit has inverse conversion from fromUnit
    if (toUnit.conversions) {
      const conversions = toUnit.conversions as Record<string, number>;
      if (conversions[fromUnit.id] !== undefined) {
        return 1 / conversions[fromUnit.id];
      }
      if (conversions[fromUnit.name] !== undefined) {
        return 1 / conversions[fromUnit.name];
      }
      if (conversions[fromUnit.abbreviation] !== undefined) {
        return 1 / conversions[fromUnit.abbreviation];
      }
    }

    // TODO: Could add base unit chain calculation here if needed
    return null;
  }

  /**
   * Register built-in system functions
   * These are hardcoded and marked as SYSTEM type in the database
   */
  private registerSystemFunctions(): void {
    // ==================== Conditional Functions ====================

    // Excel-like IF function
    this.parser.functions.IF = (
      condition: any,
      trueValue: any,
      falseValue: any
    ) => {
      return condition ? trueValue : falseValue;
    };

    // AND: Returns true if all arguments are true
    this.parser.functions.AND = (...args: any[]) => {
      return args.every((arg) => Boolean(arg));
    };

    // OR: Returns true if any argument is true
    this.parser.functions.OR = (...args: any[]) => {
      return args.some((arg) => Boolean(arg));
    };

    // NOT: Returns the logical negation
    this.parser.functions.NOT = (value: any) => {
      return !value;
    };

    // ==================== Math Functions ====================

    // ROUND: Round to specified decimals (default 0)
    this.parser.functions.ROUND = (value: number, decimals: number = 0) => {
      const factor = Math.pow(10, decimals);
      return Math.round(value * factor) / factor;
    };

    // FLOOR: Round down to nearest integer
    this.parser.functions.FLOOR = (value: number) => {
      return Math.floor(value);
    };

    // CEIL: Round up to nearest integer
    this.parser.functions.CEIL = (value: number) => {
      return Math.ceil(value);
    };

    // ABS: Absolute value
    this.parser.functions.ABS = (value: number) => {
      return Math.abs(value);
    };

    // MIN: Minimum of arguments
    this.parser.functions.MIN = (...args: number[]) => {
      return Math.min(...args);
    };

    // MAX: Maximum of arguments
    this.parser.functions.MAX = (...args: number[]) => {
      return Math.max(...args);
    };

    // POW: Power function
    this.parser.functions.POW = (base: number, exponent: number) => {
      return Math.pow(base, exponent);
    };

    // SQRT: Square root
    this.parser.functions.SQRT = (value: number) => {
      return Math.sqrt(value);
    };

    // LOG: Natural logarithm
    this.parser.functions.LOG = (value: number) => {
      return Math.log(value);
    };

    // LOG10: Base 10 logarithm
    this.parser.functions.LOG10 = (value: number) => {
      return Math.log10(value);
    };

    // EXP: e^x
    this.parser.functions.EXP = (value: number) => {
      return Math.exp(value);
    };

    // ==================== Conversion Functions ====================

    // BUSHELS: convert lbs to bushels (1 bushel = 56 lbs)
    this.parser.functions.BUSHELS = (lbs: number) => lbs / 56;

    // METRIC_TONS: convert lbs to metric tons
    this.parser.functions.METRIC_TONS = (lbs: number) => lbs / 2205;

    // GALLONS_TO_LITERS: convert gallons to liters
    this.parser.functions.GALLONS_TO_LITERS = (gallons: number) =>
      gallons * 3.78541;

    // LITERS_TO_GALLONS: convert liters to gallons
    this.parser.functions.LITERS_TO_GALLONS = (liters: number) =>
      liters / 3.78541;

    // KG_TO_LBS: convert kilograms to pounds
    this.parser.functions.KG_TO_LBS = (kg: number) => kg * 2.20462;

    // LBS_TO_KG: convert pounds to kilograms
    this.parser.functions.LBS_TO_KG = (lbs: number) => lbs / 2.20462;
  }

  /**
   * Evaluate an expression with context
   * @param expression - The expression to evaluate (can start with = like Excel)
   * @param context - Context variables (grainLoad, waterLoad, etc.)
   * @param grainCharacters - Optional grain character inputs for dynamic grain percentages
   */
  async evaluate(
    expression: string,
    context: Partial<ExpressionContext>,
    grainCharacters?: GrainCharacterInput[]
  ): Promise<ExpressionResult> {
    const startTime = Date.now();

    try {
      // Strip leading = if present
      const cleanExpression = expression.trim().startsWith("=")
        ? expression.trim().slice(1)
        : expression.trim();

      // Build full context with defaults and grain characters
      const fullContext = this.buildContext(context, grainCharacters);

      // Parse and evaluate
      const expr = this.parser.parse(cleanExpression);
      const value = expr.evaluate(fullContext);
      const variablesUsed = expr.variables();

      return {
        success: true,
        value: typeof value === "number" ? value : parseFloat(value),
        executionTimeMs: Date.now() - startTime,
        variablesUsed,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Expression evaluation failed: ${errorMessage}`, error);
      return {
        success: false,
        error: errorMessage,
        executionTimeMs: Date.now() - startTime,
        variablesUsed: [],
      };
    }
  }

  validate(expression: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let detectedVariables: string[] = [];

    try {
      const cleanExpression = expression.trim().startsWith("=")
        ? expression.trim().slice(1)
        : expression.trim();

      if (!cleanExpression) {
        errors.push("Expression cannot be empty");
        return {
          isValid: false,
          errors,
          warnings,
          detectedVariables: [],
          requiredVariables: [],
        };
      }

      const expr = this.parser.parse(cleanExpression);
      detectedVariables = expr.variables();

      // Check for unknown variables
      const knownVariables = this.getKnownVariables();
      const unknownVars = detectedVariables.filter(
        (v) => !knownVariables.includes(v)
      );

      if (unknownVars.length > 0) {
        warnings.push(`Unknown variables: ${unknownVars.join(", ")}`);
      }

      const requiredVariables =
        this.determineRequiredVariables(detectedVariables);

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        detectedVariables,
        requiredVariables,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      errors.push(`Syntax error: ${errorMessage}`);
      return {
        isValid: false,
        errors,
        warnings,
        detectedVariables,
        requiredVariables: [],
      };
    }
  }

  private buildContext(
    partial: Partial<ExpressionContext>,
    grainCharacters?: GrainCharacterInput[]
  ): ExpressionContext {
    // Parse mash bill if provided (legacy support)
    let corn = 0,
      rye = 0,
      wheat = 0,
      malt = 0;
    if (partial.mashBill) {
      const parts = partial.mashBill.split("-").map((p) => parseFloat(p));
      if (parts.length === 4) {
        [corn, rye, wheat, malt] = parts;
      }
    }

    // Build grain character variables
    const grainVars: Record<string, number> = {};
    if (grainCharacters && grainCharacters.length > 0) {
      for (const grain of grainCharacters) {
        // Use abbreviation + varietyCode if present (e.g., "C1", "R")
        const code = grain.varietyCode
          ? `${grain.abbreviation}${grain.varietyCode}`
          : grain.abbreviation;
        grainVars[code] = grain.percentage;
      }
    }

    return {
      grainLoad: partial.grainLoad || 0,
      waterLoad: partial.waterLoad,
      mashBill: partial.mashBill,
      corn: partial.corn || corn,
      rye: partial.rye || rye,
      wheat: partial.wheat || wheat,
      malt: partial.malt || malt,
      lbsPerBushel: 56,
      gallonsPerBushel: 4.5,
      metricTonDivisor: 2205,
      ...grainVars, // Add grain character variables (C, R, W, M, etc.)
      ...partial,
    };
  }

  private getKnownVariables(): string[] {
    // Base known variables
    const baseVars = [
      "grainLoad",
      "waterLoad",
      "mashBill",
      "corn",
      "rye",
      "wheat",
      "malt",
      "lbsPerBushel",
      "gallonsPerBushel",
      "metricTonDivisor",
    ];

    // Grain character abbreviations (C=Corn, R=Rye, W=Wheat, M=Malt, Y=Barley, S=Sorghum, B=Buckwheat, O=Oats, Z=Other)
    // Also allow variety codes like C1, C2, R1, etc.
    const grainAbbreviations = ["C", "R", "W", "M", "Y", "S", "B", "O", "Z"];
    const grainWithVarieties: string[] = [];
    for (const abbr of grainAbbreviations) {
      grainWithVarieties.push(abbr);
      // Add common variety codes (1-9)
      for (let i = 1; i <= 9; i++) {
        grainWithVarieties.push(`${abbr}${i}`);
      }
    }

    return [...baseVars, ...grainWithVarieties];
  }

  private determineRequiredVariables(detected: string[]): string[] {
    const required: string[] = [];
    if (detected.includes("grainLoad")) required.push("grainLoad");
    if (detected.includes("waterLoad")) required.push("waterLoad");
    return required;
  }
}
