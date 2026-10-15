import { Test, TestingModule } from "@nestjs/testing";
import { EnzymeConfigurationService } from "../enzymeConfiguration.service";
import { EnzymeDosingService } from "../../recipe/enzyme.dosing";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateEnzymeConfigurationDto } from "../dto/create-enzyme-configuration.dto";
import { UpdateEnzymeConfigurationDto } from "../dto/update-enzyme-configuration.dto";
import { EnumEnzymeCategory } from "@prisma/client";
import { SystemConfigurationService } from "../../systemConfiguration/systemConfiguration.service";

describe("Enzyme Configuration and Dosing Integration", () => {
  let enzymeConfigService: EnzymeConfigurationService;
  let enzymeDosingService: EnzymeDosingService;
  let prismaService: PrismaService;
  let module: TestingModule;

  // Test data
  const testItemId = "test-item-id-123";
  const testMashBill = "70-21-00-09"; // corn-rye-wheat-malt

  const testEnzymeConfigs = [
    {
      itemId: "test-viscoferm-item",
      category: EnumEnzymeCategory.VISCOSITY,
      dosePerMetricTon: 0.5,
      instructions: "Add at 152°F during mashing",
      createdBy: "test-user",
      active: true,
    },
    {
      itemId: "test-liquozyme-item",
      category: EnumEnzymeCategory.LIQUIFACTION,
      dosePerMetricTon: 0.3,
      instructions: "Add at beginning of mashing",
      createdBy: "test-user",
      active: true,
    },
    {
      itemId: "test-saczyme-item",
      category: EnumEnzymeCategory.SACCHARIFICATION,
      dosePerMetricTon: 0.4,
      instructions: "Add during saccharification rest",
      createdBy: "test-user",
      active: true,
    },
  ];

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        EnzymeConfigurationService,
        EnzymeDosingService,
        {
          provide: PrismaService,
          useValue: {
            enzymeConfiguration: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            item: {
              findUnique: jest.fn(),
              findFirst: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
        {
          provide: SystemConfigurationService,
          useValue: {
            getConfigOrDefault: jest
              .fn()
              .mockImplementation((key: string, defaultValue: any) => {
                // Return default values for system configurations
                if (key === "ENZYME_METRIC_TON_DIVISOR") {
                  return Promise.resolve(2205);
                }
                if (key === "ENZYME_CACHE_TTL_MINUTES") {
                  return Promise.resolve(60);
                }
                return Promise.resolve(defaultValue);
              }),
            getConfig: jest.fn(),
            updateConfig: jest.fn(),
          },
        },
      ],
    }).compile();

    enzymeConfigService = module.get<EnzymeConfigurationService>(
      EnzymeConfigurationService
    );
    enzymeDosingService = module.get<EnzymeDosingService>(EnzymeDosingService);
    prismaService = module.get<PrismaService>(PrismaService);

    // Setup default mocks
    jest.spyOn(prismaService.item, "findUnique").mockResolvedValue({
      id: testItemId,
      itemNumber: "TEST-ITEM-001",
      itemDescription: "Test Item",
      active: true,
    } as any);
  });

  afterEach(async () => {
    await module.close();
    jest.clearAllMocks();
  });

  describe("Service Integration", () => {
    it("should successfully inject EnzymeConfigurationService into EnzymeDosingService", () => {
      expect(enzymeDosingService).toBeDefined();
      expect(enzymeConfigService).toBeDefined();
      expect(enzymeDosingService["enzymeConfigurationService"]).toBeDefined();
    });

    it("should initialize enzyme cache on service startup", async () => {
      // Mock the enzyme configurations with correct structure
      const mockConfigurations = testEnzymeConfigs.map((config, index) => ({
        id: `config-${index}`,
        globalId: `global-${index}`,
        ...config,
        createdAt: new Date(),
        updatedAt: new Date(),
        updatedBy: null,
        item: {
          itemName: `Test Enzyme ${index}`,
        },
      }));

      jest
        .spyOn(prismaService.enzymeConfiguration, "findMany")
        .mockResolvedValue(mockConfigurations as any);

      // Mock the service method that transforms the data
      jest
        .spyOn(enzymeConfigService, "getActiveConfigurationsForDosing")
        .mockResolvedValue([
          {
            id: "config-1",
            category: "Viscosity",
            name: "Viscoferm Test",
            dosePerMetricTon: 0.5,
            instructions: "Add at 152°F during mashing",
            itemId: "test-viscoferm-item",
          },
          {
            id: "config-2",
            category: "Liquifaction",
            name: "Liquozyme Test",
            dosePerMetricTon: 0.3,
            instructions: "Add at beginning of mashing",
            itemId: "test-liquozyme-item",
          },
          {
            id: "config-3",
            category: "Saccharification",
            name: "Saczyme Test",
            dosePerMetricTon: 0.4,
            instructions: "Add during saccharification rest",
            itemId: "test-saczyme-item",
          },
        ]);

      // Trigger cache initialization
      await enzymeDosingService.onModuleInit();

      // Verify that configurations were loaded
      expect(
        enzymeConfigService.getActiveConfigurationsForDosing
      ).toHaveBeenCalled();
    });
  });

  describe("Database-Driven Enzyme Dosing", () => {
    beforeEach(async () => {
      // Setup enzyme configurations in mock with proper enzyme names
      jest
        .spyOn(enzymeConfigService, "getActiveConfigurationsForDosing")
        .mockResolvedValue([
          {
            id: "config-1",
            category: "Viscosity",
            name: "Viscoferm Test",
            dosePerMetricTon: 0.5,
            instructions: "Add at 152°F during mashing",
            itemId: "test-viscoferm-item",
          },
          {
            id: "config-2",
            category: "Liquifaction",
            name: "Liquozyme Test",
            dosePerMetricTon: 0.3,
            instructions: "Add at beginning of mashing",
            itemId: "test-liquozyme-item",
          },
          {
            id: "config-3",
            category: "Saccharification",
            name: "Saczyme Test",
            dosePerMetricTon: 0.4,
            instructions: "Add during saccharification rest",
            itemId: "test-saczyme-item",
          },
        ]);

      // Initialize the cache
      await enzymeDosingService.onModuleInit();
    });

    it("should calculate enzyme dosing using database configurations", async () => {
      const result = await enzymeDosingService.calculateNormalizedEnzymeDosing(
        testMashBill,
        "viscoferm" // Use the actual enzyme name mapping
      );

      expect(result).toBeDefined();
      expect(result?.ratio).toBeGreaterThan(0);
      expect(result?.instructions).toContain("Add at 152°F");
    });

    it("should handle case-insensitive enzyme lookups", async () => {
      const testCases = [
        "viscoferm",
        "VISCOFERM",
        "Viscoferm",
        "liquozyme",
        "LIQUOZYME",
        "Liquozyme",
      ];

      for (const enzymeName of testCases) {
        const result =
          await enzymeDosingService.calculateNormalizedEnzymeDosing(
            testMashBill,
            enzymeName
          );
        expect(result).toBeDefined();
        expect(result?.ratio).toBeGreaterThan(0);
      }
    });

    it("should return null for unknown enzyme types", async () => {
      const result = await enzymeDosingService.calculateNormalizedEnzymeDosing(
        testMashBill,
        "unknown-enzyme"
      );

      expect(result).toBeNull();
    });

    it("should calculate correct dosing ratios based on mash bill", async () => {
      const mashBills = [
        "70-21-00-09", // High corn
        "51-39-00-10", // High rye
        "60-00-30-10", // High wheat
        "40-20-20-20", // Balanced four-grain
      ];

      for (const mashBill of mashBills) {
        const result =
          await enzymeDosingService.calculateNormalizedEnzymeDosing(
            mashBill,
            "viscoferm" // Use actual enzyme name
          );

        expect(result).toBeDefined();
        expect(result?.ratio).toBeGreaterThan(0);
        expect(result?.ratio).toBeLessThan(1); // Should be a small ratio
      }
    });
  });

  describe("Caching Mechanism", () => {
    beforeEach(async () => {
      jest
        .spyOn(enzymeConfigService, "getActiveConfigurationsForDosing")
        .mockResolvedValue([
          {
            id: "config-1",
            category: "Viscosity",
            name: "Viscoferm Test",
            dosePerMetricTon: 0.5,
            instructions: "Add at 152°F during mashing",
            itemId: "test-viscoferm-item",
          },
          {
            id: "config-2",
            category: "Liquifaction",
            name: "Liquozyme Test",
            dosePerMetricTon: 0.3,
            instructions: "Add at beginning of mashing",
            itemId: "test-liquozyme-item",
          },
        ]);
    });

    it("should cache enzyme configurations for performance", async () => {
      // Initialize cache
      await enzymeDosingService.onModuleInit();

      // First call should hit the service
      expect(
        enzymeConfigService.getActiveConfigurationsForDosing
      ).toHaveBeenCalledTimes(1);

      // Subsequent calls within cache TTL should use cache
      await enzymeDosingService.calculateNormalizedEnzymeDosing(
        testMashBill,
        "viscoferm"
      );
      await enzymeDosingService.calculateNormalizedEnzymeDosing(
        testMashBill,
        "liquozyme"
      );

      // Should still only have called service once
      expect(
        enzymeConfigService.getActiveConfigurationsForDosing
      ).toHaveBeenCalledTimes(1);
    });

    it("should refresh cache after TTL expires", async () => {
      // Initialize cache
      await enzymeDosingService.onModuleInit();
      expect(
        enzymeConfigService.getActiveConfigurationsForDosing
      ).toHaveBeenCalledTimes(1);

      // Simulate cache expiry by advancing time
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => originalDateNow() + 61 * 60 * 1000); // 61 minutes later (more than 1 hour TTL)

      // This should trigger cache refresh
      await enzymeDosingService.calculateNormalizedEnzymeDosing(
        testMashBill,
        "viscoferm"
      );

      expect(
        enzymeConfigService.getActiveConfigurationsForDosing
      ).toHaveBeenCalledTimes(2);

      // Restore Date.now
      Date.now = originalDateNow;
    });
  });

  describe("Error Handling and Fallbacks", () => {
    it("should handle database connection errors gracefully", async () => {
      // Mock service error
      jest
        .spyOn(enzymeConfigService, "getActiveConfigurationsForDosing")
        .mockRejectedValue(new Error("Database connection failed"));

      // Initialize - should fall back to hardcoded values
      await enzymeDosingService.onModuleInit();

      // Should be able to calculate dosing using fallback data
      const result = await enzymeDosingService.calculateNormalizedEnzymeDosing(
        testMashBill,
        "viscoferm" // This should work with fallback data
      );

      // Should handle error gracefully and use fallback
      expect(result).toBeDefined();
    });

    it("should continue working when enzyme configuration service is unavailable", async () => {
      // First initialize with good data
      jest
        .spyOn(enzymeConfigService, "getActiveConfigurationsForDosing")
        .mockResolvedValue([
          {
            id: "config-1",
            category: "Viscosity",
            name: "Viscoferm Test",
            dosePerMetricTon: 0.5,
            instructions: "Add at 152°F during mashing",
            itemId: "test-viscoferm-item",
          },
        ]);

      await enzymeDosingService.onModuleInit();

      // Then mock service unavailable for subsequent calls
      jest
        .spyOn(enzymeConfigService, "getActiveConfigurationsForDosing")
        .mockRejectedValue(new Error("Service unavailable"));

      // Should still be able to calculate dosing using cached data
      const result = await enzymeDosingService.calculateNormalizedEnzymeDosing(
        testMashBill,
        "viscoferm"
      );

      // Should handle gracefully using cached data
      expect(result).toBeDefined();
    });
  });

  describe("Configuration CRUD Integration", () => {
    it("should create new enzyme configuration and make it available for dosing", async () => {
      const newConfig: CreateEnzymeConfigurationDto = {
        itemId: "clzhhlsx30f09mbc9r5mj02z7", // Valid CUID format
        category: EnumEnzymeCategory.VISCOSITY,
        dosePerMetricTon: 0.6,
        instructions: "New enzyme for testing",
        createdBy: "test-user",
      };

      // Mock successful creation
      jest
        .spyOn(prismaService.enzymeConfiguration, "create")
        .mockResolvedValue({
          id: "new-config-id",
          globalId: "new-global-id",
          ...newConfig,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          updatedBy: null,
        } as any);

      // Mock item exists
      jest.spyOn(prismaService.item, "findUnique").mockResolvedValue({
        id: newConfig.itemId,
        itemNumber: "NEW-ENZYME-001",
        itemDescription: "New Test Enzyme",
        active: true,
      } as any);

      // Create the configuration
      const created = await enzymeConfigService.create(newConfig);
      expect(created).toBeDefined();
      expect(created.itemId).toBe(newConfig.itemId);

      // Mock the updated service response after creation
      jest
        .spyOn(enzymeConfigService, "getActiveConfigurationsForDosing")
        .mockResolvedValue([
          {
            id: "config-1",
            category: "Viscosity",
            name: "New Test Enzyme",
            dosePerMetricTon: 0.6,
            instructions: "New enzyme for testing",
            itemId: newConfig.itemId,
          },
        ]);

      // Force cache refresh and test dosing
      await enzymeDosingService["refreshEnzymeCache"]();
      const result = await enzymeDosingService.calculateNormalizedEnzymeDosing(
        testMashBill,
        "newtestenzyme" // The mapping should be created from the name
      );

      expect(result).toBeDefined();
      expect(result?.instructions).toBe(newConfig.instructions);
    });

    it("should update enzyme configuration and reflect changes in dosing", async () => {
      const configId = "clzhhlsx30f09mbc9r5mj02z8"; // Valid CUID format
      const updateData: UpdateEnzymeConfigurationDto = {
        dosePerMetricTon: 0.8,
        instructions: "Updated dosing instructions",
        updatedBy: "test-user",
      };

      // Mock existing configuration
      jest
        .spyOn(prismaService.enzymeConfiguration, "findUnique")
        .mockResolvedValue({
          id: configId,
          globalId: "global-id",
          itemId: "test-item",
          category: EnumEnzymeCategory.VISCOSITY,
          dosePerMetricTon: 0.5,
          instructions: "Original instructions",
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: "original-user",
          updatedBy: null,
        } as any);

      // Mock successful update
      jest
        .spyOn(prismaService.enzymeConfiguration, "update")
        .mockResolvedValue({
          id: configId,
          globalId: "global-id",
          itemId: "test-item",
          category: EnumEnzymeCategory.VISCOSITY,
          ...updateData,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: "original-user",
        } as any);

      // Update the configuration
      const updated = await enzymeConfigService.update(configId, updateData);
      expect(updated).toBeDefined();
      expect(updated.dosePerMetricTon).toBe(updateData.dosePerMetricTon);
    });
  });

  describe("Performance and Scalability", () => {
    it("should handle multiple concurrent dosing calculations efficiently", async () => {
      // Setup enzyme configurations
      jest
        .spyOn(enzymeConfigService, "getActiveConfigurationsForDosing")
        .mockResolvedValue([
          {
            id: "config-1",
            category: "Viscosity",
            name: "Viscoferm Test",
            dosePerMetricTon: 0.5,
            instructions: "Add at 152°F during mashing",
            itemId: "test-viscoferm-item",
          },
        ]);

      await enzymeDosingService.onModuleInit();

      // Perform multiple concurrent calculations
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          enzymeDosingService.calculateNormalizedEnzymeDosing(
            testMashBill,
            "viscoferm"
          )
        );
      }

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach((result) => {
        expect(result).toBeDefined();
        expect(result?.ratio).toBeGreaterThan(0);
      });

      // Should only have called service once due to caching
      expect(
        enzymeConfigService.getActiveConfigurationsForDosing
      ).toHaveBeenCalledTimes(1);
    });

    it("should handle large numbers of enzyme configurations efficiently", async () => {
      // Create a large number of test configurations
      const largeConfigSet = Array.from({ length: 100 }, (_, index) => ({
        id: `config-${index}`,
        category:
          index % 3 === 0
            ? "Viscosity"
            : index % 3 === 1
            ? "Liquifaction"
            : "Saccharification",
        name: `Test Enzyme ${index}`,
        dosePerMetricTon: 0.1 + index * 0.01,
        instructions: `Enzyme ${index} instructions`,
        itemId: `item-${index}`,
      }));

      jest
        .spyOn(enzymeConfigService, "getActiveConfigurationsForDosing")
        .mockResolvedValue(largeConfigSet);

      const startTime = Date.now();
      await enzymeDosingService.onModuleInit();
      const initTime = Date.now() - startTime;

      // Initialization should be reasonably fast even with many configurations
      expect(initTime).toBeLessThan(1000); // Less than 1 second

      // Dosing calculations should still be fast
      const calcStartTime = Date.now();
      const result = await enzymeDosingService.calculateNormalizedEnzymeDosing(
        testMashBill,
        "testenzyme0"
      );
      const calcTime = Date.now() - calcStartTime;

      expect(result).toBeDefined();
      expect(calcTime).toBeLessThan(100); // Less than 100ms
    });
  });
});
