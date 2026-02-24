import { Test, TestingModule } from "@nestjs/testing";
import { ExpressionEngineService } from "../expression-engine.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("ExpressionEngineService", () => {
  let service: ExpressionEngineService;

  const mockPrismaService = {
    formulaLibrary: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpressionEngineService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ExpressionEngineService>(ExpressionEngineService);
  });

  describe("evaluate", () => {
    it("should evaluate simple arithmetic", async () => {
      const result = await service.evaluate("=10 + 5", {});
      expect(result.success).toBe(true);
      expect(result.value).toBe(15);
    });

    it("should evaluate multiplication", async () => {
      const result = await service.evaluate("=3 * 7", {});
      expect(result.success).toBe(true);
      expect(result.value).toBe(21);
    });

    it("should evaluate division", async () => {
      const result = await service.evaluate("=100 / 4", {});
      expect(result.success).toBe(true);
      expect(result.value).toBe(25);
    });

    it("should use variables from context", async () => {
      const result = await service.evaluate("=grainLoad * 0.7", {
        grainLoad: 3000,
      });
      expect(result.success).toBe(true);
      expect(result.value).toBe(2100);
    });

    it("should handle expressions without leading =", async () => {
      const result = await service.evaluate("grainLoad * 0.7", {
        grainLoad: 3000,
      });
      expect(result.success).toBe(true);
      expect(result.value).toBe(2100);
    });

    it("should handle IF function", async () => {
      const result = await service.evaluate(
        "=IF(corn > 50, grainLoad * 0.7, grainLoad * 0.5)",
        { grainLoad: 3000, corn: 70 }
      );
      expect(result.success).toBe(true);
      expect(result.value).toBe(2100);
    });

    it("should handle IF function when condition is false", async () => {
      const result = await service.evaluate(
        "=IF(corn > 50, grainLoad * 0.7, grainLoad * 0.5)",
        { grainLoad: 3000, corn: 30 }
      );
      expect(result.success).toBe(true);
      expect(result.value).toBe(1500);
    });

    it("should handle custom BUSHELS function", async () => {
      const result = await service.evaluate("=BUSHELS(grainLoad) * 4.5", {
        grainLoad: 3000,
      });
      expect(result.success).toBe(true);
      expect(result.value).toBeCloseTo(241.07, 1);
    });

    it("should handle custom METRIC_TONS function", async () => {
      const result = await service.evaluate("=METRIC_TONS(grainLoad)", {
        grainLoad: 2205,
      });
      expect(result.success).toBe(true);
      expect(result.value).toBe(1);
    });

    it("should handle MAX function", async () => {
      const result = await service.evaluate("=max(grainLoad * 0.05, 100)", {
        grainLoad: 1000,
      });
      expect(result.success).toBe(true);
      expect(result.value).toBe(100); // max(50, 100) = 100
    });

    it("should handle MIN function", async () => {
      const result = await service.evaluate("=min(grainLoad * 0.1, 500)", {
        grainLoad: 3000,
      });
      expect(result.success).toBe(true);
      expect(result.value).toBe(300); // min(300, 500) = 300
    });

    it("should handle ROUND function", async () => {
      const result = await service.evaluate("=round(grainLoad * 0.333)", {
        grainLoad: 3000,
      });
      expect(result.success).toBe(true);
      expect(result.value).toBe(999); // round(999) = 999
    });

    it("should parse mash bill from context", async () => {
      const result = await service.evaluate("=corn", {
        mashBill: "70-21-00-09",
      });
      expect(result.success).toBe(true);
      expect(result.value).toBe(70);
    });

    it("should use mash bill components in calculation", async () => {
      const result = await service.evaluate(
        "=(corn * grainLoad / 100) + (rye * grainLoad / 100)",
        { grainLoad: 3000, mashBill: "70-21-00-09" }
      );
      expect(result.success).toBe(true);
      expect(result.value).toBe(2730); // (70*3000/100) + (21*3000/100) = 2100 + 630 = 2730
    });

    it("should handle complex expressions", async () => {
      const result = await service.evaluate(
        "=round((grainLoad * corn / 100) + 100)",
        { grainLoad: 3000, mashBill: "70-21-00-09" }
      );
      expect(result.success).toBe(true);
      expect(result.value).toBe(2200); // round((3000*70/100) + 100) = 2200
    });

    it("should use default constants", async () => {
      const result = await service.evaluate("=lbsPerBushel", {});
      expect(result.success).toBe(true);
      expect(result.value).toBe(56);
    });

    it("should handle water load", async () => {
      const result = await service.evaluate("=waterLoad * 0.25", {
        waterLoad: 241,
      });
      expect(result.success).toBe(true);
      expect(result.value).toBe(60.25);
    });

    it("should return error for invalid syntax", async () => {
      const result = await service.evaluate("=grainLoad * * 0.7", {
        grainLoad: 3000,
      });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should track execution time", async () => {
      const result = await service.evaluate("=grainLoad * 0.7", {
        grainLoad: 3000,
      });
      expect(result.success).toBe(true);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("should track variables used", async () => {
      const result = await service.evaluate("=grainLoad * corn / 100", {
        grainLoad: 3000,
        corn: 70,
      });
      expect(result.success).toBe(true);
      expect(result.variablesUsed).toContain("grainLoad");
      expect(result.variablesUsed).toContain("corn");
    });
  });

  describe("validate", () => {
    it("should validate correct syntax", () => {
      const result = service.validate("=grainLoad * 0.7");
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.detectedVariables).toContain("grainLoad");
    });

    it("should validate expression without leading =", () => {
      const result = service.validate("grainLoad * 0.7");
      expect(result.isValid).toBe(true);
      expect(result.detectedVariables).toContain("grainLoad");
    });

    it("should detect syntax errors", () => {
      const result = service.validate("=grainLoad * * 0.7");
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should detect empty expression", () => {
      const result = service.validate("");
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Expression cannot be empty");
    });

    it("should detect empty expression with just =", () => {
      const result = service.validate("=");
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Expression cannot be empty");
    });

    it("should warn about unknown variables", () => {
      const result = service.validate("=unknownVar * 2");
      expect(result.isValid).toBe(true); // Syntax is valid
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("unknownVar");
    });

    it("should detect multiple variables", () => {
      const result = service.validate("=grainLoad * corn / 100");
      expect(result.isValid).toBe(true);
      expect(result.detectedVariables).toContain("grainLoad");
      expect(result.detectedVariables).toContain("corn");
    });

    it("should identify required variables", () => {
      const result = service.validate("=grainLoad * 0.7");
      expect(result.isValid).toBe(true);
      expect(result.requiredVariables).toContain("grainLoad");
    });

    it("should identify waterLoad as required", () => {
      const result = service.validate("=waterLoad * 0.25");
      expect(result.isValid).toBe(true);
      expect(result.requiredVariables).toContain("waterLoad");
    });

    it("should validate complex expressions with functions", () => {
      const result = service.validate(
        "=IF(corn > 60, BUSHELS(grainLoad) * 4.5, BUSHELS(grainLoad) * 4)"
      );
      expect(result.isValid).toBe(true);
      expect(result.detectedVariables).toContain("corn");
      expect(result.detectedVariables).toContain("grainLoad");
    });

    it("should validate expressions with built-in constants", () => {
      const result = service.validate("=grainLoad / lbsPerBushel");
      expect(result.isValid).toBe(true);
      expect(result.detectedVariables).toContain("grainLoad");
      expect(result.detectedVariables).toContain("lbsPerBushel");
    });
  });

  describe("context building", () => {
    it("should build context with defaults", async () => {
      const result = await service.evaluate("=grainLoad", { grainLoad: 3000 });
      expect(result.success).toBe(true);
      expect(result.value).toBe(3000);
    });

    it("should parse mash bill into components", async () => {
      const result = await service.evaluate("=rye", {
        mashBill: "70-21-00-09",
      });
      expect(result.success).toBe(true);
      expect(result.value).toBe(21);
    });

    it("should handle missing mash bill", async () => {
      const result = await service.evaluate("=corn", {});
      expect(result.success).toBe(true);
      expect(result.value).toBe(0);
    });

    it("should use provided mash bill components over parsed", async () => {
      const result = await service.evaluate("=corn", {
        corn: 80,
        mashBill: "70-21-00-09",
      });
      expect(result.success).toBe(true);
      expect(result.value).toBe(80); // Explicitly provided corn value takes precedence
    });

    it("should include all constants", async () => {
      const result = await service.evaluate(
        "=lbsPerBushel + gallonsPerBushel + metricTonDivisor",
        {}
      );
      expect(result.success).toBe(true);
      expect(result.value).toBe(56 + 4.5 + 2205); // 2265.5
    });
  });
});
