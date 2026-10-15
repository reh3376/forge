import { Test, TestingModule } from "@nestjs/testing";
import { RecipeGenerator } from "../recipe.generation";
import { RabbitMQProducerService } from "../../rabbitmq/rabbitmq.producer.service";
import { EnzymeDosingService } from "../enzyme.dosing";
import { EnzymeConfigurationService } from "../../enzymeConfiguration/enzymeConfiguration.service";
import { SystemConfigurationService } from "../../systemConfiguration/systemConfiguration.service";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { Logger } from "@nestjs/common";
import {
  createTestingModule,
  mockPrismaClient,
  mockEnzymeDosingService,
} from "./test.setup";

describe("RecipeGenerator - Enzyme Dosing", () => {
  let module: TestingModule;
  let service: RecipeGenerator;
  let enzymeDosingService: EnzymeDosingService;
  let calculateEnzymeDosingSpy: jest.SpyInstance;

  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  } as unknown as Logger;

  const testData = {
    mashBill: "51-39-0-10",
    totalGrainWeight: 10000,
    mashingProtocol: [
      { action: "Add Liquid", liquidType01: "Water", qty: 5000 },
      { action: "Add Grain", grainType: "Corn", qty: 5100 },
      { action: "Hold", time: 2 },
      { action: "Add Grain", grainType: "Rye", qty: 3900 },
      { action: "Hold", time: 2 },
      { action: "Add Grain", grainType: "Malt", qty: 1000 },
      { action: "Add Additive", additiveType: "Viscoferm", qty: 0 },
    ],
  };

  beforeEach(async () => {
    // Create testing module
    module = await createTestingModule();

    service = module.get<RecipeGenerator>(RecipeGenerator);
    enzymeDosingService = module.get<EnzymeDosingService>(EnzymeDosingService);

    // Setup spy on the enzyme dosing service
    calculateEnzymeDosingSpy = jest.spyOn(
      enzymeDosingService,
      "calculateNormalizedEnzymeDosing"
    );
  });

  afterEach(async () => {
    await module.close();
    jest.clearAllMocks();
  });

  describe("setEnzymeDosing", () => {
    it("should correctly set enzyme dosing for Viscoferm", async () => {
      calculateEnzymeDosingSpy.mockReturnValue({
        ratio: 0.0005,
        instructions: "Add during saccharification",
      });

      const result = await service["setEnzymeDosing"](testData.mashingProtocol);

      const additiveStep = result.find(
        (step) =>
          step.action === "Add Additive" && step.additiveType === "Viscoferm"
      );
      expect(additiveStep).toBeDefined();
      expect(additiveStep.qty).toBe(0.0005);
    });

    it("should handle multiple enzyme types", async () => {
      const protocolWithMultipleEnzymes = [
        ...testData.mashingProtocol,
        { action: "Add Additive", additiveType: "Liquozyme", qty: 0 },
      ];

      calculateEnzymeDosingSpy.mockReturnValue({
        ratio: 0.0005,
        instructions: "Add enzyme",
      });

      const result = await service["setEnzymeDosing"](
        protocolWithMultipleEnzymes
      );

      const viscoStep = result.find(
        (step) =>
          step.action === "Add Additive" && step.additiveType === "Viscoferm"
      );
      const liquoStep = result.find(
        (step) =>
          step.action === "Add Additive" && step.additiveType === "Liquozyme"
      );

      expect(viscoStep?.qty).toBe(0.0005);
      expect(liquoStep?.qty).toBe(0.0005);
    });

    it("should handle null dosing result", async () => {
      calculateEnzymeDosingSpy.mockReturnValue(null);

      const result = await service["setEnzymeDosing"](testData.mashingProtocol);

      const additiveStep = result.find(
        (step) =>
          step.action === "Add Additive" && step.additiveType === "Viscoferm"
      );
      expect(additiveStep).toBeDefined();
      expect(additiveStep.qty).toBe(0);
    });

    it("should preserve non-additive steps", async () => {
      calculateEnzymeDosingSpy.mockReturnValue({
        ratio: 0.001,
        instructions: "Add enzyme",
      });

      const result = await service["setEnzymeDosing"](testData.mashingProtocol);

      const nonAdditiveSteps = result.filter(
        (step) => step.action !== "Add Additive"
      );
      const originalNonAdditiveSteps = testData.mashingProtocol.filter(
        (step) => step.action !== "Add Additive"
      );

      expect(nonAdditiveSteps.length).toBe(originalNonAdditiveSteps.length);
    });
  });

  describe("getEnzymeDosing", () => {
    it("should return correct dosing information", async () => {
      const enzymeName = "Viscoferm";
      const totalGrainLoadLbs = 1000;
      const mashBill = "70-21-00-09";

      calculateEnzymeDosingSpy.mockReturnValue({
        ratio: 0.0015,
        instructions: "Add at 152F",
      });

      const result = await service["getEnzymeDosing"](
        enzymeName,
        totalGrainLoadLbs,
        mashBill
      );

      expect(result).toEqual({
        dose: 0.0015,
        instructions: "Add at 152F",
      });
    });
  });
});

describe("EnzymeDosingService - Database-Driven Configuration", () => {
  let module: TestingModule;
  let enzymeDosingService: EnzymeDosingService;
  let enzymeConfigService: EnzymeConfigurationService;
  let systemConfigService: SystemConfigurationService;

  const mockEnzymeConfigurations = [
    {
      id: "1",
      itemId: "enzyme-1",
      name: "Viscoferm",
      category: "Viscosity",
      dosePerMetricTon: 0.5,
      instructions: "Add during saccharification",
      active: true,
      item: { itemName: "Viscoferm" },
    },
    {
      id: "2",
      itemId: "enzyme-2",
      name: "Liquozyme PRO HP DI",
      category: "Liquifaction",
      dosePerMetricTon: 0.3,
      instructions: "Add at high temperature",
      active: true,
      item: { itemName: "Liquozyme PRO HP DI" },
    },
  ];

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        EnzymeDosingService,
        {
          provide: EnzymeConfigurationService,
          useValue: {
            getActiveConfigurationsForDosing: jest
              .fn()
              .mockResolvedValue(mockEnzymeConfigurations),
          },
        },
        {
          provide: SystemConfigurationService,
          useValue: {
            getConfigOrDefault: jest
              .fn()
              .mockImplementation((key: string, defaultValue: any) => {
                if (key === "ENZYME_METRIC_TON_DIVISOR") {
                  return Promise.resolve(2205);
                }
                if (key === "ENZYME_CACHE_TTL_MINUTES") {
                  return Promise.resolve(60);
                }
                return Promise.resolve(defaultValue);
              }),
          },
        },
      ],
    }).compile();

    enzymeDosingService = module.get<EnzymeDosingService>(EnzymeDosingService);
    enzymeConfigService = module.get<EnzymeConfigurationService>(
      EnzymeConfigurationService
    );
    systemConfigService = module.get<SystemConfigurationService>(
      SystemConfigurationService
    );
  });

  afterEach(async () => {
    await module.close();
    jest.clearAllMocks();
  });

  describe("Database Configuration Loading", () => {
    it("should load enzyme configurations from database on initialization", async () => {
      await enzymeDosingService.onModuleInit();

      expect(
        enzymeConfigService.getActiveConfigurationsForDosing
      ).toHaveBeenCalled();
    });

    it("should calculate enzyme dosing using database configurations", async () => {
      await enzymeDosingService.onModuleInit();

      const result = await enzymeDosingService.calculateNormalizedEnzymeDosing(
        "70-21-00-09",
        "viscoferm"
      );

      expect(result).toBeDefined();
      // Viscosity enzyme: grainFraction = rye/100 = 0.21
      // viscosityBase = 1.5 * 1 + 9e-16 = 1.5
      // dose = round(0.21 * 1.5 * 100) / 100 = 0.32 (rounded)
      // ratio = dose / 2205
      expect(result).toBeDefined();
      expect(result?.ratio).toBeCloseTo(0.000143, 4);
      expect(result?.instructions).toBe("Add during saccharification");
    });

    it("should handle case-insensitive enzyme lookups", async () => {
      await enzymeDosingService.onModuleInit();

      const result1 = await enzymeDosingService.calculateNormalizedEnzymeDosing(
        "70-21-00-09",
        "VISCOFERM"
      );
      const result2 = await enzymeDosingService.calculateNormalizedEnzymeDosing(
        "70-21-00-09",
        "viscoferm"
      );

      expect(result1).toEqual(result2);
    });
  });

  describe("SystemConfigurationService Integration", () => {
    it("should use configurable metric ton divisor", async () => {
      const getConfigSpy = jest.spyOn(
        systemConfigService,
        "getConfigOrDefault"
      );

      await enzymeDosingService.onModuleInit();

      expect(getConfigSpy).toHaveBeenCalledWith(
        "ENZYME_METRIC_TON_DIVISOR",
        2205
      );
    });

    it("should use configurable cache TTL", async () => {
      const getConfigSpy = jest.spyOn(
        systemConfigService,
        "getConfigOrDefault"
      );

      await enzymeDosingService.onModuleInit();

      expect(getConfigSpy).toHaveBeenCalledWith("ENZYME_CACHE_TTL_MINUTES", 60);
    });

    it("should fallback to default values when SystemConfigurationService fails", async () => {
      jest
        .spyOn(systemConfigService, "getConfigOrDefault")
        .mockRejectedValue(new Error("Config service unavailable"));

      // Should not throw error and use fallback values
      await expect(enzymeDosingService.onModuleInit()).resolves.not.toThrow();
    });
  });

  describe("Error Handling and Fallbacks", () => {
    it("should use fallback configurations when database is unavailable", async () => {
      jest
        .spyOn(enzymeConfigService, "getActiveConfigurationsForDosing")
        .mockRejectedValue(new Error("Database unavailable"));

      await enzymeDosingService.onModuleInit();

      // Should still be able to calculate dosing using fallback configurations
      const result = await enzymeDosingService.calculateNormalizedEnzymeDosing(
        "70-21-00-09",
        "viscoferm"
      );
      expect(result).toBeDefined();
    });

    it("should handle unknown enzyme types gracefully", async () => {
      await enzymeDosingService.onModuleInit();

      const result = await enzymeDosingService.calculateNormalizedEnzymeDosing(
        "70-21-00-09",
        "UnknownEnzyme"
      );
      expect(result).toBeNull();
    });

    it("should handle invalid mash bill formats", async () => {
      await enzymeDosingService.onModuleInit();

      const result = await enzymeDosingService.calculateNormalizedEnzymeDosing(
        "invalid-format",
        "viscoferm"
      );
      expect(result).toBeNull();
    });
  });

  describe("Caching Mechanism", () => {
    it("should cache enzyme configurations for performance", async () => {
      await enzymeDosingService.onModuleInit();

      // Multiple calls should use cached data
      await enzymeDosingService.calculateNormalizedEnzymeDosing(
        "70-21-00-09",
        "viscoferm"
      );
      await enzymeDosingService.calculateNormalizedEnzymeDosing(
        "70-21-00-09",
        "liquozyme"
      );

      // Database should only be called once during initialization
      expect(
        enzymeConfigService.getActiveConfigurationsForDosing
      ).toHaveBeenCalledTimes(1);
    });

    it("should refresh cache when TTL expires", async () => {
      await enzymeDosingService.onModuleInit();

      // Mock time advancement beyond TTL
      const originalDate = Date.now;
      Date.now = jest.fn(() => originalDate() + 61 * 60 * 1000); // 61 minutes later

      await enzymeDosingService.calculateNormalizedEnzymeDosing(
        "70-21-00-09",
        "viscoferm"
      );

      // Should refresh cache
      expect(
        enzymeConfigService.getActiveConfigurationsForDosing
      ).toHaveBeenCalledTimes(2);

      // Restore original Date.now
      Date.now = originalDate;
    });
  });

  describe("Performance and Calculation Accuracy", () => {
    it("should calculate correct enzyme dosing ratios", async () => {
      await enzymeDosingService.onModuleInit();

      const result = await enzymeDosingService.calculateNormalizedEnzymeDosing(
        "70-21-00-09",
        "viscoferm"
      );

      expect(result).toBeDefined();
      // Viscosity enzyme: grainFraction = rye/100 = 0.21
      // viscosityBase = 1.5 * 1 + 9e-16 = 1.5
      // dose = round(0.21 * 1.5 * 100) / 100 = 0.32 (rounded)
      // ratio = dose / 2205
      expect(result).toBeDefined();
      expect(result?.ratio).toBeCloseTo(0.000143, 4);
      expect(result?.instructions).toBe("Add during saccharification");
    });

    it("should handle concurrent dosing calculations efficiently", async () => {
      await enzymeDosingService.onModuleInit();

      const promises = Array.from({ length: 100 }, () =>
        enzymeDosingService.calculateNormalizedEnzymeDosing(
          "70-21-00-09",
          "viscoferm"
        )
      );

      const results = await Promise.all(promises);

      // All calculations should succeed
      expect(results.every((result) => result !== null)).toBe(true);

      // Database should only be called once (cached)
      expect(
        enzymeConfigService.getActiveConfigurationsForDosing
      ).toHaveBeenCalledTimes(1);
    });
  });
});
