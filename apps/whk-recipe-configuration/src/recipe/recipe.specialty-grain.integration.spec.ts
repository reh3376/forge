import { Test, TestingModule } from "@nestjs/testing";
import { RecipeGenerator } from "./recipe.generation";
import { RabbitMQProducerService } from "../rabbitmq/rabbitmq.producer.service";
import { EnzymeDosingService } from "./enzyme.dosing";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { PrismaClient } from "@prisma/client";

// Mock PrismaClient at the module level
jest.mock("@prisma/client", () => {
  const mockPrismaClient = {
    item: {
      findFirst: jest.fn(),
    },
    customer: {
      findFirst: jest.fn(),
    },
    bom: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    bomItem: {
      createMany: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
    recipe: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    unitProcedure: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    operation: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    equipmentPhase: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    phaseParameter: {
      create: jest.fn(),
    },
    recipeParameter: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    recipeGroup: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    salesOrder: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    productionOrder: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    scheduleOrder: {
      create: jest.fn(),
    },
    scheduleOrderQueue: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    procedure: {
      findFirst: jest.fn(),
    },
    $disconnect: jest.fn(),
  };

  return {
    PrismaClient: jest.fn(() => mockPrismaClient),
  };
});

/**
 * Integration tests for Specialty Grain Recipe Generation
 *
 * These tests verify the end-to-end functionality of generating recipes
 * with a 5th grain type (Specialty), including:
 * - Mash bill parsing for 5-grain recipes
 * - Specialty item lookup by item number
 * - BOM creation with specialty grain
 * - Validation of specialty grain in bin assignments and mashing protocol
 */
describe("RecipeGenerator - Specialty Grain Integration Tests", () => {
  let recipeGenerator: RecipeGenerator;
  let mockPrismaClient: any;

  const mockRabbitMQProducer = {
    emitMessage: jest.fn(),
  };

  const mockEnzymeDosingService = {
    calculateEnzymeDosing: jest.fn().mockReturnValue({ dose: 1.5 }),
  };

  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Get the mocked PrismaClient instance
    const PrismaClientMock = PrismaClient as jest.MockedClass<
      typeof PrismaClient
    >;
    mockPrismaClient = new PrismaClientMock() as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecipeGenerator,
        {
          provide: RabbitMQProducerService,
          useValue: mockRabbitMQProducer,
        },
        {
          provide: EnzymeDosingService,
          useValue: mockEnzymeDosingService,
        },
        {
          provide: WINSTON_MODULE_NEST_PROVIDER,
          useValue: mockLogger,
        },
      ],
    }).compile();

    recipeGenerator = module.get<RecipeGenerator>(RecipeGenerator);
  });

  describe("5-Grain Mash Bill with Specialty Grain", () => {
    const CUSTOMER_CODE = "WHK";
    const MASH_BILL_5_GRAIN = "40-20-15-15-10"; // Corn-Rye-Wheat-Malt-Specialty
    const SPECIALTY_ITEM_NUMBER = "SPE-OAT01-Oat Specialty Grain";
    const SPECIALTY_ITEM_ID = "specialty-item-123";
    const FINAL_PROOF = 120;
    const BARREL_INFO = "53-06-4-0-0";
    const CUSTOMER_NAME = "Test Customer LLC";
    const ORDER_QTY = 100;
    const TOTAL_GRAIN_WEIGHT = 24080;
    const BBLS_PER_FERM = 100;
    const USER = "test@whiskeyhouse.com";
    const WATER_QTY = 3900;
    const BACKSET_QTY = 3600;

    const MASHING_PROTOCOL_WITH_SPECIALTY = [
      {
        action: "Add Liquid",
        liquidType01: "Water",
        liquidType02: "Backset",
      },
      { action: "Hold", holdType: "Heat", temperature: 130 },
      { action: "Add Grain", grainType: "Corn", qty: 9632 }, // 40% of 24080
      { action: "Hold", holdType: "Heat", temperature: 180, time: 20 },
      { action: "Add Grain", grainType: "Rye", qty: 4816 }, // 20% of 24080
      { action: "Hold", holdType: "Cool", temperature: 170 },
      { action: "Add Grain", grainType: "Wheat", qty: 3612 }, // 15% of 24080
      { action: "Hold", holdType: "Cool", temperature: 152 },
      { action: "Add Grain", grainType: "Specialty", qty: 2408 }, // 10% of 24080
      { action: "Hold", holdType: "Hold", time: 10 },
      { action: "Add Grain", grainType: "Malt", qty: 3612 }, // 15% of 24080
      { action: "Hold", holdType: "Hold", time: 10 },
      { action: "Add Additive", additiveType: "Viscoferm" },
    ];

    const BIN_ASSIGNMENTS = {
      bin1: "Corn",
      bin2: ["Rye", "Wheat", "Specialty"],
      bin3: "Malt",
    };

    const RECIPE_PARAMETERS = [
      { name: "FinalProof", setpointValue: 120 },
      { name: "TotalGrainWeight", setpointValue: TOTAL_GRAIN_WEIGHT },
    ];

    it("should successfully calculate grain quantities for 5-grain recipes", async () => {
      // This test verifies that the specialty grain quantity calculations work correctly

      // Test the grain quantity calculation with specialty
      const quantities = (recipeGenerator as any).calculateGrainQuantities(
        MASH_BILL_5_GRAIN,
        TOTAL_GRAIN_WEIGHT
      );

      expect(quantities).toMatchObject({
        Corn: expect.any(Number),
        Rye: expect.any(Number),
        Wheat: expect.any(Number),
        Malt: expect.any(Number),
        Specialty: expect.any(Number),
      });

      // Verify specialty grain quantity is calculated (10% of 24080 = 2408)
      expect(quantities.Specialty).toBe(2408);
      expect(quantities.Corn).toBe(9632); // 40%
      expect(quantities.Rye).toBe(4816); // 20%
      expect(quantities.Wheat).toBe(3612); // 15%
      expect(quantities.Malt).toBe(3612); // 15%
    });

    it("should throw error when specialty item number is provided but item is not found", async () => {
      // Mock specialty item not found (first call for specialty, second call for FG item)
      mockPrismaClient.item.findFirst
        .mockResolvedValueOnce(null) // Specialty item not found
        .mockResolvedValueOnce({ id: "fg-item-123", itemNumber: "test" }); // FG item found

      await expect(
        recipeGenerator.createRecipeData(
          CUSTOMER_CODE,
          MASH_BILL_5_GRAIN,
          FINAL_PROOF,
          BARREL_INFO,
          CUSTOMER_NAME,
          ORDER_QTY,
          TOTAL_GRAIN_WEIGHT,
          BBLS_PER_FERM,
          USER,
          WATER_QTY,
          BACKSET_QTY,
          [],
          {},
          MASHING_PROTOCOL_WITH_SPECIALTY,
          RECIPE_PARAMETERS,
          BIN_ASSIGNMENTS,
          "NONEXISTENT-SPECIALTY-ITEM"
        )
      ).rejects.toThrow(
        "Specialty item with item number NONEXISTENT-SPECIALTY-ITEM not found"
      );

      // Verify disconnect was called even on error
      expect(mockPrismaClient.$disconnect).toHaveBeenCalled();
    });

    it("should validate that specialty grain is in bin assignments when present in mash bill", async () => {
      const INVALID_BIN_ASSIGNMENTS = {
        bin1: "Corn",
        bin2: ["Rye", "Wheat"], // Missing Specialty
        bin3: "Malt",
      };

      const mockSpecialtyItem = {
        id: SPECIALTY_ITEM_ID,
        itemNumber: SPECIALTY_ITEM_NUMBER,
      };

      mockPrismaClient.item.findFirst.mockResolvedValue(mockSpecialtyItem);

      await expect(
        recipeGenerator.createRecipeData(
          CUSTOMER_CODE,
          MASH_BILL_5_GRAIN,
          FINAL_PROOF,
          BARREL_INFO,
          CUSTOMER_NAME,
          ORDER_QTY,
          TOTAL_GRAIN_WEIGHT,
          BBLS_PER_FERM,
          USER,
          WATER_QTY,
          BACKSET_QTY,
          [],
          {},
          MASHING_PROTOCOL_WITH_SPECIALTY,
          RECIPE_PARAMETERS,
          INVALID_BIN_ASSIGNMENTS,
          SPECIALTY_ITEM_NUMBER
        )
      ).rejects.toThrow("Invalid bin assignments");

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Grain Specialty from mash bill is not assigned to any bin"
      );

      expect(mockPrismaClient.$disconnect).toHaveBeenCalled();
    });

    it("should validate that specialty grain in mashing protocol matches mash bill", async () => {
      const MASH_BILL_WITHOUT_SPECIALTY = "40-20-20-20-0"; // No specialty
      const INVALID_PROTOCOL = [
        { action: "Add Liquid", liquidType01: "Water" },
        { action: "Add Grain", grainType: "Corn", qty: 9632 },
        { action: "Add Grain", grainType: "Rye", qty: 4816 },
        { action: "Add Grain", grainType: "Wheat", qty: 4816 },
        { action: "Add Grain", grainType: "Malt", qty: 4816 },
        { action: "Add Grain", grainType: "Specialty", qty: 2408 }, // Specialty in protocol but not in mash bill
      ];

      const mockSpecialtyItem = {
        id: SPECIALTY_ITEM_ID,
        itemNumber: SPECIALTY_ITEM_NUMBER,
      };

      mockPrismaClient.item.findFirst.mockResolvedValue(mockSpecialtyItem);

      await expect(
        recipeGenerator.createRecipeData(
          CUSTOMER_CODE,
          MASH_BILL_WITHOUT_SPECIALTY,
          FINAL_PROOF,
          BARREL_INFO,
          CUSTOMER_NAME,
          ORDER_QTY,
          TOTAL_GRAIN_WEIGHT,
          BBLS_PER_FERM,
          USER,
          WATER_QTY,
          BACKSET_QTY,
          [],
          {},
          INVALID_PROTOCOL,
          RECIPE_PARAMETERS,
          { bin1: "Corn", bin2: "Rye", bin3: ["Wheat", "Malt"] },
          SPECIALTY_ITEM_NUMBER
        )
      ).rejects.toThrow("Invalid mashing protocol for given mash bill");

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Grain Specialty is in mashing protocol but not present in mash bill"
      );
    });

    it("should work without specialty grain for traditional 4-grain recipes", async () => {
      const MASH_BILL_4_GRAIN = "51-13-21-15-00"; // Traditional 4-grain bourbon with 0% specialty

      // Test that grain quantities work correctly for 4-grain recipes (with 0% specialty)
      const quantities = (recipeGenerator as any).calculateGrainQuantities(
        MASH_BILL_4_GRAIN,
        TOTAL_GRAIN_WEIGHT
      );

      expect(quantities).toMatchObject({
        Corn: expect.any(Number),
        Rye: expect.any(Number),
        Wheat: expect.any(Number),
        Malt: expect.any(Number),
        Specialty: 0, // Should be 0 for 4-grain recipes
      });

      expect(quantities.Corn).toBe(12281); // 51%
      expect(quantities.Rye).toBe(3130); // 13%
      expect(quantities.Wheat).toBe(5057); // 21%
      expect(quantities.Malt).toBe(3612); // 15%
      expect(quantities.Specialty).toBe(0); // 0%

      // Verify specialty grain percentage calculation returns 0 for 4-grain mash bills
      const specialtyPercentage = (
        recipeGenerator as any
      ).calculateGrainPercentage("SPECIALTY", MASH_BILL_4_GRAIN);

      expect(specialtyPercentage).toBe(0);
    });
  });

  describe("Grain Quantity Calculations with Specialty", () => {
    it("should correctly calculate quantities for all 5 grains", () => {
      const mashBill = "40-20-15-15-10";
      const totalWeight = 10000;

      const quantities = (recipeGenerator as any).calculateGrainQuantities(
        mashBill,
        totalWeight
      );

      expect(quantities).toEqual({
        Corn: 4000,
        Rye: 2000,
        Wheat: 1500,
        Malt: 1500,
        Specialty: 1000,
      });
    });

    it("should handle decimal percentages in 5-grain mash bills", () => {
      const mashBill = "40.5-19.5-15.25-14.75-10";
      const totalWeight = 10000;

      const quantities = (recipeGenerator as any).calculateGrainQuantities(
        mashBill,
        totalWeight
      );

      expect(quantities.Corn).toBe(4050);
      expect(quantities.Rye).toBe(1950);
      expect(quantities.Wheat).toBe(1525);
      expect(quantities.Malt).toBe(1475);
      expect(quantities.Specialty).toBe(1000);
    });

    it("should calculate specialty grain percentage correctly", () => {
      const mashBill = "40-20-15-15-10";

      const percentage = (recipeGenerator as any).calculateGrainPercentage(
        "SPECIALTY",
        mashBill
      );

      expect(percentage).toBeCloseTo(10, 5);
    });
  });
});
