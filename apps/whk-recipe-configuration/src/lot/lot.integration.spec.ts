import { Test, TestingModule } from "@nestjs/testing";
import { LotService } from "./lot.service";
import { PrismaService } from "../prisma/prisma.service";
import { RabbitMQProducerService } from "../rabbitmq/rabbitmq.producer.service";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { EnumLotWhiskeyType, EnumLotStatus } from "@prisma/client";
import { EnumRecipeWhiskeyType } from "../recipe/base/EnumRecipeWhiskeyType";

describe("LotService Integration Tests", () => {
  let service: LotService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    recipe: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    customer: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    item: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    lot: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $disconnect: jest.fn(),
  };

  const mockRabbitMQProducer = {
    emitMessage: jest.fn(),
  };

  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LotService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: RabbitMQProducerService,
          useValue: mockRabbitMQProducer,
        },
        {
          provide: WINSTON_MODULE_NEST_PROVIDER,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<LotService>(LotService);
    prismaService = module.get<PrismaService>(PrismaService);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe("Recipe Name to ID Integration", () => {
    it("should create recipe when name does not exist and then create lot", async () => {
      const recipeName = "Test Single Malt Recipe";
      const mockCustomer = { id: "customer-1", name: "Test Customer" };
      const mockItem = { id: "item-1", itemNumber: "TEST-ITEM" };
      const mockNewRecipe = {
        id: "recipe-1",
        Recipe: recipeName,
        item: mockItem,
      };
      const mockLot = {
        id: "lot-1",
        lotNumber: "24A01A.01",
        recipe: mockNewRecipe,
        item: mockItem,
      };

      // Setup mocks for recipe creation flow
      mockPrismaService.recipe.findFirst.mockResolvedValue(null); // Recipe doesn't exist
      mockPrismaService.customer.findFirst.mockResolvedValue(mockCustomer);
      mockPrismaService.item.findFirst.mockResolvedValue(null);
      mockPrismaService.item.create.mockResolvedValue(mockItem);
      mockPrismaService.recipe.create.mockResolvedValue(mockNewRecipe);

      // Setup mocks for lot creation
      mockPrismaService.recipe.findUnique.mockResolvedValue(mockNewRecipe);
      mockPrismaService.lot.findMany.mockResolvedValue([]);

      // Mock the parent createLot method
      const superCreateLotSpy = jest
        .spyOn(Object.getPrototypeOf(LotService.prototype), "createLot")
        .mockResolvedValue(mockLot as any);

      // Mock calculateLotAnalytics
      jest.spyOn(service as any, "calculateLotAnalytics").mockResolvedValue({
        totalWeight: 1000,
        status: EnumLotStatus.PendingValidation,
      });

      // Mock lots method
      jest.spyOn(service, "lots").mockResolvedValue([]);

      const createLotArgs = {
        data: {
          recipeName: recipeName,
          whiskeyType: EnumLotWhiskeyType.AmericanSingleMalt,
          bblOem: "WVG",
          lotAlphaChar: "A",
          lotNumber: "",
          createdBy: "test-user",
          bblEntryProof: 125,
          totalWeight: 1000,
          densityFinal: 8.5,
          bblTotal: 10,
        },
      };

      const result = await service.createLot(createLotArgs as any);

      // Verify recipe was created with correct whiskey type detection
      expect(mockPrismaService.recipe.findFirst).toHaveBeenCalledWith({
        where: { Recipe: recipeName },
      });
      expect(mockPrismaService.recipe.create).toHaveBeenCalledWith({
        data: {
          Recipe: recipeName,
          createdBy: "test-user",
          customer: { connect: { id: "customer-1" } },
          item: { connect: { id: "item-1" } },
          revision: 1,
          // whiskeyType would be set here in real implementation
        },
      });

      // Verify lot was created with the new recipe
      expect(mockPrismaService.recipe.findUnique).toHaveBeenCalledWith({
        where: { id: "recipe-1" },
        include: { item: true },
      });

      // Verify the result
      expect(result).toEqual(mockLot);

      superCreateLotSpy.mockRestore();
    });

    it("should use existing recipe when name exists", async () => {
      const recipeName = "Existing Recipe";
      const mockExistingRecipe = {
        id: "existing-recipe-1",
        Recipe: recipeName,
        item: { id: "item-1", itemNumber: "EXISTING-ITEM" },
      };
      const mockLot = {
        id: "lot-2",
        lotNumber: "24A01B.01",
        recipe: mockExistingRecipe,
        item: mockExistingRecipe.item,
      };

      // Setup mocks - recipe already exists
      mockPrismaService.recipe.findFirst.mockResolvedValue(mockExistingRecipe);
      mockPrismaService.recipe.findUnique.mockResolvedValue(mockExistingRecipe);
      mockPrismaService.lot.findMany.mockResolvedValue([]);

      // Mock the parent createLot method
      const superCreateLotSpy = jest
        .spyOn(Object.getPrototypeOf(LotService.prototype), "createLot")
        .mockResolvedValue(mockLot as any);

      // Mock calculateLotAnalytics
      jest.spyOn(service as any, "calculateLotAnalytics").mockResolvedValue({
        totalWeight: 1000,
        status: EnumLotStatus.PendingValidation,
      });

      // Mock lots method
      jest.spyOn(service, "lots").mockResolvedValue([]);

      const createLotArgs = {
        data: {
          recipeName: recipeName,
          bblOem: "WVG",
          lotAlphaChar: "B",
          lotNumber: "",
          createdBy: "test-user",
          bblEntryProof: 115,
          totalWeight: 1200,
          densityFinal: 8.0,
          bblTotal: 12,
        },
      };

      const result = await service.createLot(createLotArgs as any);

      // Verify recipe lookup was called
      expect(mockPrismaService.recipe.findFirst).toHaveBeenCalledWith({
        where: { Recipe: recipeName },
      });

      // Verify recipe was NOT created (since it exists)
      expect(mockPrismaService.recipe.create).not.toHaveBeenCalled();

      // Verify lot was created with existing recipe
      expect(mockPrismaService.recipe.findUnique).toHaveBeenCalledWith({
        where: { id: "existing-recipe-1" },
        include: { item: true },
      });

      expect(result).toEqual(mockLot);

      superCreateLotSpy.mockRestore();
    });

    it("should handle lot updates with recipe names", async () => {
      const newRecipeName = "Updated Recipe Name";
      const mockNewRecipe = {
        id: "new-recipe-1",
        Recipe: newRecipeName,
        item: { id: "item-2", itemNumber: "NEW-ITEM" },
      };
      const mockUpdatedLot = {
        id: "lot-1",
        recipe: mockNewRecipe,
        notes: "Updated with new recipe",
      };

      // Setup mocks for recipe creation (new recipe)
      mockPrismaService.recipe.findFirst.mockResolvedValue(null);
      const mockCustomer = { id: "customer-1", name: "Test Customer" };
      const mockItem = { id: "item-2", itemNumber: "NEW-ITEM" };
      mockPrismaService.customer.findFirst.mockResolvedValue(mockCustomer);
      mockPrismaService.item.findFirst.mockResolvedValue(null);
      mockPrismaService.item.create.mockResolvedValue(mockItem);
      mockPrismaService.recipe.create.mockResolvedValue(mockNewRecipe);

      // Mock the parent updateLot method
      const superUpdateLotSpy = jest
        .spyOn(Object.getPrototypeOf(LotService.prototype), "updateLot")
        .mockResolvedValue(mockUpdatedLot as any);

      // Mock calculateLotAnalytics
      jest.spyOn(service as any, "calculateLotAnalytics").mockResolvedValue({
        totalWeight: 1100,
        status: EnumLotStatus.PendingValidation,
      });

      const updateLotArgs = {
        where: { id: "lot-1" },
        data: {
          recipeName: newRecipeName,
          whiskeyType: EnumLotWhiskeyType.WheatWhiskey,
          notes: "Updated with new recipe",
        },
      };

      const result = await service.updateLot(updateLotArgs as any);

      // Verify new recipe was created
      expect(mockPrismaService.recipe.findFirst).toHaveBeenCalledWith({
        where: { Recipe: newRecipeName },
      });
      expect(mockPrismaService.recipe.create).toHaveBeenCalled();

      expect(result).toEqual(mockUpdatedLot);

      superUpdateLotSpy.mockRestore();
    });
  });

  describe("Whiskey Type Detection Integration", () => {
    it("should detect correct whiskey types from recipe names during lot creation", async () => {
      const testCases = [
        {
          recipeName: "Premium Single Malt Recipe",
          expectedType: EnumRecipeWhiskeyType.MaltWhiskey,
        },
        {
          recipeName: "Wheat Bourbon Special",
          expectedType: EnumRecipeWhiskeyType.WheatedBourbon,
        },
        {
          recipeName: "Rye Whiskey Premium",
          expectedType: EnumRecipeWhiskeyType.RyeWhiskey,
        },
        {
          recipeName: "Traditional Bourbon",
          expectedType: EnumRecipeWhiskeyType.RyeBourbon,
        },
      ];

      for (const testCase of testCases) {
        // Clear mocks for each test case
        jest.clearAllMocks();

        const mockCustomer = { id: "customer-1", name: "Test Customer" };
        const mockItem = { id: "item-1", itemNumber: "TEST-ITEM" };
        const mockRecipe = {
          id: "recipe-1",
          Recipe: testCase.recipeName,
          item: mockItem,
        };

        // Setup mocks
        mockPrismaService.recipe.findFirst.mockResolvedValue(null); // New recipe
        mockPrismaService.customer.findFirst.mockResolvedValue(mockCustomer);
        mockPrismaService.item.findFirst.mockResolvedValue(null);
        mockPrismaService.item.create.mockResolvedValue(mockItem);
        mockPrismaService.recipe.create.mockResolvedValue(mockRecipe);

        // Test the whiskey type detection directly
        const detectedType = service["detectWhiskeyTypeFromRecipeName"](
          testCase.recipeName
        );
        expect(detectedType).toBe(testCase.expectedType);

        // Test integration with recipe creation
        const recipeId = await service["findOrCreateRecipeByName"](
          testCase.recipeName,
          "test-user"
        );

        expect(recipeId).toBe("recipe-1");
        expect(mockLogger.log).toHaveBeenCalledWith(
          expect.stringContaining(
            `Creating recipe with whiskey type: ${testCase.expectedType}`
          )
        );
      }
    });
  });

  describe("Error Handling Integration", () => {
    it("should throw error when neither recipe nor recipeName provided", async () => {
      const createLotArgs = {
        data: {
          bblOem: "WVG",
          lotAlphaChar: "E",
          lotNumber: "",
          createdBy: "test-user",
        },
      };

      await expect(service.createLot(createLotArgs as any)).rejects.toThrow(
        "Either recipe or recipeName is required"
      );
    });

    it("should throw error when recipe is not found after creation", async () => {
      mockPrismaService.recipe.findFirst.mockResolvedValue(null);
      mockPrismaService.recipe.findUnique.mockResolvedValue(null); // Recipe not found

      const createLotArgs = {
        data: {
          recipeName: "Test Recipe",
          bblOem: "WVG",
          lotAlphaChar: "A",
          lotNumber: "",
          createdBy: "test-user",
        },
      };

      await expect(service.createLot(createLotArgs as any)).rejects.toThrow(
        "Recipe not found"
      );
    });
  });
});
