import { Test, TestingModule } from "@nestjs/testing";
import { LotService } from "./lot.service";
import { PrismaService } from "../prisma/prisma.service";
import { RabbitMQProducerService } from "../rabbitmq/rabbitmq.producer.service";
import { WhiskeyTypeService } from "../whiskeyType/whiskeyType.service";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { EnumLotWhiskeyType, EnumLotStatus } from "@prisma/client";
import { EnumRecipeWhiskeyType } from "../recipe/base/EnumRecipeWhiskeyType";
import { LotCreateInput } from "./LotCreateWithoutNumberInput";
import { LotUpdateInput } from "./base/LotUpdateInput";

describe("LotService", () => {
  let service: LotService;
  let prismaService: PrismaService;
  let rabbitMQProducer: RabbitMQProducerService;
  let logger: any;

  const mockPrismaService = {
    recipe: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
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
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    productionOrder: {
      findUnique: jest.fn(),
    },
  };

  const mockRabbitMQProducer = {
    emitMessage: jest.fn(),
  };

  const mockWhiskeyTypeService = {
    findByCode: jest.fn(),
    findMany: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    getActiveWhiskeyTypes: jest.fn(),
    getTTBDefinitions: jest.fn(),
    getDerivedTypes: jest.fn(),
    getWhiskeyTypeWithRelations: jest.fn(),
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
          provide: WhiskeyTypeService,
          useValue: mockWhiskeyTypeService,
        },
        {
          provide: WINSTON_MODULE_NEST_PROVIDER,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<LotService>(LotService);
    prismaService = module.get<PrismaService>(PrismaService);
    rabbitMQProducer = module.get<RabbitMQProducerService>(
      RabbitMQProducerService
    );
    logger = module.get(WINSTON_MODULE_NEST_PROVIDER);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("mapLotWhiskeyTypeToRecipeWhiskeyType", () => {
    it("should map AmericanSingleMalt to MaltWhiskey", () => {
      const result = service["mapLotWhiskeyTypeToRecipeWhiskeyType"](
        EnumLotWhiskeyType.AmericanSingleMalt
      );
      expect(result).toBe(EnumRecipeWhiskeyType.MaltWhiskey);
    });

    it("should map RyeBourbon to RyeBourbon", () => {
      const result = service["mapLotWhiskeyTypeToRecipeWhiskeyType"](
        EnumLotWhiskeyType.RyeBourbon
      );
      expect(result).toBe(EnumRecipeWhiskeyType.RyeBourbon);
    });

    it("should map WheatedBourbon to WheatedBourbon", () => {
      const result = service["mapLotWhiskeyTypeToRecipeWhiskeyType"](
        EnumLotWhiskeyType.WheatedBourbon
      );
      expect(result).toBe(EnumRecipeWhiskeyType.WheatedBourbon);
    });

    it("should default to RyeBourbon when no type provided", () => {
      const result = service["mapLotWhiskeyTypeToRecipeWhiskeyType"](undefined);
      expect(result).toBe(EnumRecipeWhiskeyType.RyeBourbon);
    });

    it("should map all lot whiskey types correctly", () => {
      const mappings = [
        [
          EnumLotWhiskeyType.AmericanSingleMalt,
          EnumRecipeWhiskeyType.MaltWhiskey,
        ],
        [EnumLotWhiskeyType.CornBourbon, EnumRecipeWhiskeyType.RyeBourbon],
        [EnumLotWhiskeyType.CornWhiskey, EnumRecipeWhiskeyType.RyeBourbon],
        [EnumLotWhiskeyType.RyeBourbon, EnumRecipeWhiskeyType.RyeBourbon],
        [EnumLotWhiskeyType.RyeWhiskey, EnumRecipeWhiskeyType.RyeWhiskey],
        [
          EnumLotWhiskeyType.WheatedBourbon,
          EnumRecipeWhiskeyType.WheatedBourbon,
        ],
        [EnumLotWhiskeyType.WheatWhiskey, EnumRecipeWhiskeyType.WheatWhiskey],
      ];

      mappings.forEach(([lotType, expectedRecipeType]) => {
        const result = service["mapLotWhiskeyTypeToRecipeWhiskeyType"](
          lotType as EnumLotWhiskeyType
        );
        expect(result).toBe(expectedRecipeType);
      });
    });
  });

  describe("detectWhiskeyTypeFromRecipeName", () => {
    it('should detect MaltWhiskey from recipe names containing "MALT"', () => {
      const testCases = [
        "Single Malt Whiskey",
        "AMERICAN SINGLE MALT",
        "malt whiskey recipe",
        "Premium Malt",
      ];

      testCases.forEach((recipeName) => {
        const result = service["detectWhiskeyTypeFromRecipeName"](recipeName);
        expect(result).toBe(EnumRecipeWhiskeyType.MaltWhiskey);
      });
    });

    it('should detect WheatedBourbon from recipe names containing "WHEAT" and "BOURBON"', () => {
      const testCases = [
        "Wheated Bourbon Recipe",
        "WHEAT BOURBON PREMIUM",
        "Premium Wheat Bourbon",
        "wheat and corn bourbon",
      ];

      testCases.forEach((recipeName) => {
        const result = service["detectWhiskeyTypeFromRecipeName"](recipeName);
        expect(result).toBe(EnumRecipeWhiskeyType.WheatedBourbon);
      });
    });

    it('should detect WheatWhiskey from recipe names containing "WHEAT" and "WHISKEY"', () => {
      const testCases = [
        "Wheat Whiskey Recipe",
        "PREMIUM WHEAT WHISKEY",
        "wheat whiskey special",
        "organic wheat whiskey",
      ];

      testCases.forEach((recipeName) => {
        const result = service["detectWhiskeyTypeFromRecipeName"](recipeName);
        expect(result).toBe(EnumRecipeWhiskeyType.WheatWhiskey);
      });
    });

    it('should detect RyeWhiskey from recipe names containing "RYE" and "WHISKEY"', () => {
      const testCases = [
        "Rye Whiskey Recipe",
        "PREMIUM RYE WHISKEY",
        "rye whiskey special",
        "organic rye whiskey",
      ];

      testCases.forEach((recipeName) => {
        const result = service["detectWhiskeyTypeFromRecipeName"](recipeName);
        expect(result).toBe(EnumRecipeWhiskeyType.RyeWhiskey);
      });
    });

    it('should detect FourGrainBourbon from recipe names containing "FOUR GRAIN" and "BOURBON"', () => {
      const testCases = [
        "Four Grain Bourbon Recipe",
        "FOUR GRAIN BOURBON PREMIUM",
        "4 grain bourbon special",
        "Four-Grain Bourbon",
      ];

      testCases.forEach((recipeName) => {
        const result = service["detectWhiskeyTypeFromRecipeName"](recipeName);
        expect(result).toBe(EnumRecipeWhiskeyType.FourGrainBourbon);
      });
    });

    it('should detect FourGrainWhiskey from recipe names containing "FOUR GRAIN" without "BOURBON"', () => {
      const testCases = [
        "Four Grain Whiskey Recipe",
        "FOUR GRAIN WHISKEY PREMIUM",
        "4 grain whiskey special",
        "Four-Grain Whiskey",
      ];

      testCases.forEach((recipeName) => {
        const result = service["detectWhiskeyTypeFromRecipeName"](recipeName);
        expect(result).toBe(EnumRecipeWhiskeyType.FourGrainWhiskey);
      });
    });

    it("should default to RyeBourbon for unknown or bourbon types", () => {
      const testCases = [
        "Standard Bourbon Recipe",
        "Premium Recipe",
        "Unknown Type",
        "Corn Bourbon",
        "Traditional Bourbon",
      ];

      testCases.forEach((recipeName) => {
        const result = service["detectWhiskeyTypeFromRecipeName"](recipeName);
        expect(result).toBe(EnumRecipeWhiskeyType.RyeBourbon);
      });
    });
  });

  describe("findOrCreateRecipeByName", () => {
    const mockCustomer = {
      id: "customer-id-123",
      name: "Test Customer",
      address: "Test Address",
      createdBy: "system",
    };

    const mockItem = {
      id: "item-id-123",
      itemNumber: "TEST-RECIPE-ITEM",
      itemName: "Test Recipe",
      itemDescription: "Item for Test Recipe",
      itemType: "FG",
      erpId: "TEST-RECIPE-ITEM",
      createdBy: "system",
    };

    const mockRecipe = {
      id: "recipe-id-123",
      Recipe: "Test Recipe",
      createdBy: "system",
      revision: 1,
    };

    beforeEach(() => {
      mockPrismaService.customer.findFirst.mockResolvedValue(mockCustomer);
      mockPrismaService.item.findFirst.mockResolvedValue(null);
      mockPrismaService.item.create.mockResolvedValue(mockItem);
      mockPrismaService.recipe.create.mockResolvedValue(mockRecipe);
    });

    it("should return existing recipe ID if recipe already exists", async () => {
      const existingRecipe = {
        id: "existing-recipe-id",
        Recipe: "Test Recipe",
      };
      mockPrismaService.recipe.findFirst.mockResolvedValue(existingRecipe);

      const result = await service["findOrCreateRecipeByName"](
        "Test Recipe",
        "system"
      );

      expect(result).toBe("existing-recipe-id");
      expect(mockPrismaService.recipe.findFirst).toHaveBeenCalledWith({
        where: { Recipe: "Test Recipe" },
      });
      expect(mockPrismaService.recipe.create).not.toHaveBeenCalled();
    });

    it("should create new recipe when recipe does not exist", async () => {
      mockPrismaService.recipe.findFirst.mockResolvedValue(null);

      const result = await service["findOrCreateRecipeByName"](
        "Test Recipe",
        "system"
      );

      expect(result).toBe("recipe-id-123");
      expect(mockPrismaService.recipe.create).toHaveBeenCalledWith({
        data: {
          Recipe: "Test Recipe",
          createdBy: "system",
          customer: { connect: { id: "customer-id-123" } },
          revision: 1,
        },
        include: {
          customer: true,
          recipeGroup: true,
          recipeBoms: true,
          unitProcedures: true,
          productionOrders: true,
        },
      });
    });

    it("should create default customer if none exists", async () => {
      mockPrismaService.customer.findFirst.mockResolvedValue(null);
      const newCustomer = { id: "new-customer-id", name: "Default Customer" };
      mockPrismaService.customer.create.mockResolvedValue(newCustomer);

      await service["findOrCreateRecipeByName"]("Test Recipe", "system");

      expect(mockPrismaService.customer.create).toHaveBeenCalledWith({
        data: {
          name: "Default Customer",
          address: "Default Address",
          createdBy: "system",
        },
      });
    });

    it("should create item for recipe if it does not exist", async () => {
      mockPrismaService.item.findFirst.mockResolvedValue(null);

      await service["findOrCreateRecipeByName"]("Test Recipe", "system");

      expect(mockPrismaService.item.create).toHaveBeenCalledWith({
        data: {
          itemNumber: "TEST-RECIPE-ITEM",
          itemName: "Test Recipe",
          itemDescription: "Item for Test Recipe",
          itemType: "FG",
          erpId: "TEST-RECIPE-ITEM",
          createdBy: "system",
        },
      });
    });

    it("should use provided whiskey type when creating recipe", async () => {
      mockPrismaService.recipe.findFirst.mockResolvedValue(null);

      await service["findOrCreateRecipeByName"](
        "Test Wheat Bourbon",
        "system",
        EnumLotWhiskeyType.WheatedBourbon
      );

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining(
          "Creating recipe with whiskey type: WheatedBourbon"
        )
      );
    });

    it("should detect whiskey type from recipe name when lot type not provided", async () => {
      mockPrismaService.recipe.findFirst.mockResolvedValue(null);

      await service["findOrCreateRecipeByName"]("Single Malt Recipe", "system");

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining(
          "Creating recipe with whiskey type: MaltWhiskey"
        )
      );
    });
  });

  describe("processRecipeInput", () => {
    it("should handle string input as recipe name", async () => {
      const spy = jest
        .spyOn(service as any, "findOrCreateRecipeByName")
        .mockResolvedValue("recipe-id-123");

      const result = await service["processRecipeInput"](
        "Test Recipe",
        "system"
      );

      expect(result).toBe("recipe-id-123");
      expect(spy).toHaveBeenCalledWith("Test Recipe", "system", undefined);
    });

    it("should handle object with connect.id", async () => {
      const recipeInput = { connect: { id: "existing-recipe-id" } };

      const result = await service["processRecipeInput"](recipeInput, "system");

      expect(result).toBe("existing-recipe-id");
    });

    it("should handle object with direct id", async () => {
      const recipeInput = { id: "existing-recipe-id" };

      const result = await service["processRecipeInput"](recipeInput, "system");

      expect(result).toBe("existing-recipe-id");
    });

    it("should throw error for invalid input format", async () => {
      const recipeInput = { invalid: "format" };

      await expect(
        service["processRecipeInput"](recipeInput, "system")
      ).rejects.toThrow("Invalid recipe input format");
    });

    it("should pass whiskey type to findOrCreateRecipeByName for string input", async () => {
      const spy = jest
        .spyOn(service as any, "findOrCreateRecipeByName")
        .mockResolvedValue("recipe-id-123");

      await service["processRecipeInput"](
        "Test Recipe",
        "system",
        EnumLotWhiskeyType.RyeWhiskey
      );

      expect(spy).toHaveBeenCalledWith(
        "Test Recipe",
        "system",
        EnumLotWhiskeyType.RyeWhiskey
      );
    });
  });

  describe("createLot with recipe name", () => {
    const mockRecipe = {
      id: "recipe-id-123",
      Recipe: "Test Recipe",
      item: {
        id: "item-id-123",
        itemNumber: "TEST-RECIPE-ITEM",
      },
      productionOrders: [
        {
          id: "po-id-123",
          createdAt: new Date("2024-01-01"),
        },
      ],
    };

    const mockCreateLotArgs = {
      data: {
        recipeName: "Test Recipe",
        bblOem: "WVG",
        lotAlphaChar: "A",
        lotNumber: "",
        createdBy: "test-user",
        whiskeyType: EnumLotWhiskeyType.RyeBourbon,
        bblEntryProof: 125,
        totalWeight: 1000,
        densityFinal: 8.5,
        bblTotal: 10,
      },
    };

    let processRecipeInputSpy: jest.SpyInstance;
    let calculateLotAnalyticsSpy: jest.SpyInstance;
    let lotsSpy: jest.SpyInstance;
    let superCreateLotSpy: jest.SpyInstance;

    beforeEach(() => {
      mockPrismaService.recipe.findUnique.mockResolvedValue(mockRecipe);
      mockPrismaService.lot.findMany.mockResolvedValue([]);
      mockPrismaService.productionOrder.findUnique.mockResolvedValue({
        id: "po-id-123",
        item: { id: "item-id-123", itemNumber: "TEST-RECIPE-ITEM" },
      });

      processRecipeInputSpy = jest
        .spyOn(service as any, "processRecipeInput")
        .mockResolvedValue("recipe-id-123");
      calculateLotAnalyticsSpy = jest
        .spyOn(service as any, "calculateLotAnalytics")
        .mockResolvedValue({
          totalWeight: 1000,
          totalVolumeWg: 117.65,
          totalPGs: 147.06,
          status: EnumLotStatus.PendingValidation,
        });
      lotsSpy = jest.spyOn(service, "lots").mockResolvedValue([]);

      // Mock the super class createLot method
      superCreateLotSpy = jest
        .spyOn(Object.getPrototypeOf(LotService.prototype), "createLot")
        .mockResolvedValue({
          id: "lot-id-123",
          lotNumber: "24A01A.01",
          recipe: mockRecipe,
          item: mockRecipe.item,
        } as any);
    });

    afterEach(() => {
      processRecipeInputSpy?.mockRestore();
      calculateLotAnalyticsSpy?.mockRestore();
      lotsSpy?.mockRestore();
      superCreateLotSpy?.mockRestore();
    });

    it("should process recipe name when provided", async () => {
      await service.createLot(mockCreateLotArgs as any);

      expect(processRecipeInputSpy).toHaveBeenCalledWith(
        "Test Recipe",
        "test-user",
        EnumLotWhiskeyType.RyeBourbon
      );
      expect(mockPrismaService.recipe.findUnique).toHaveBeenCalledWith({
        where: { id: "recipe-id-123" },
        include: { productionOrders: true },
      });
    });

    it("should process recipe ID when recipeName not provided", async () => {
      const argsWithRecipeId = {
        data: {
          recipe: { connect: { id: "existing-recipe-id" } },
          bblOem: "WVG",
          lotAlphaChar: "A",
          lotNumber: "",
          createdBy: "test-user",
        },
      };

      await service.createLot(argsWithRecipeId as any);

      expect(processRecipeInputSpy).toHaveBeenCalledWith(
        { connect: { id: "existing-recipe-id" } },
        "test-user",
        undefined
      );
    });

    it("should throw error when neither recipe nor recipeName provided", async () => {
      const argsWithoutRecipe = {
        data: {
          bblOem: "WVG",
          lotAlphaChar: "A",
          lotNumber: "",
          createdBy: "test-user",
        },
      };

      await expect(service.createLot(argsWithoutRecipe as any)).rejects.toThrow(
        "Either recipe or recipeName is required"
      );
    });

    it("should work with typed LotCreateInput including recipeName", async () => {
      // Test with proper TypeScript types
      const typedCreateInput: LotCreateInput & { recipeName: string } = {
        recipeName: "Typed Test Recipe",
        bblOem: "WVG",
        lotAlphaChar: "A",
        lotNumber: "",
        createdBy: "test-user",
        whiskeyType: EnumLotWhiskeyType.AmericanSingleMalt,
        bblEntryProof: 120,
        totalWeight: 1200,
        densityFinal: 8.3,
        bblTotal: 12,
      };

      const argsWithTypedData = {
        data: typedCreateInput,
      };

      await service.createLot(argsWithTypedData as any);

      expect(processRecipeInputSpy).toHaveBeenCalledWith(
        "Typed Test Recipe",
        "test-user",
        EnumLotWhiskeyType.AmericanSingleMalt
      );
    });
  });

  describe("updateLot with recipe name", () => {
    const mockUpdateLotArgs = {
      where: { id: "lot-id-123" },
      data: {
        recipeName: "Updated Recipe",
        whiskeyType: EnumLotWhiskeyType.WheatWhiskey,
      },
    };

    let processRecipeInputSpy: jest.SpyInstance;
    let calculateLotAnalyticsSpy: jest.SpyInstance;
    let superUpdateLotSpy: jest.SpyInstance;

    beforeEach(() => {
      processRecipeInputSpy = jest
        .spyOn(service as any, "processRecipeInput")
        .mockResolvedValue("recipe-id-456");
      calculateLotAnalyticsSpy = jest
        .spyOn(service as any, "calculateLotAnalytics")
        .mockResolvedValue({
          totalWeight: 1200,
          status: EnumLotStatus.PendingValidation,
        });
      superUpdateLotSpy = jest
        .spyOn(Object.getPrototypeOf(LotService.prototype), "updateLot")
        .mockResolvedValue({} as any);
    });

    afterEach(() => {
      processRecipeInputSpy?.mockRestore();
      calculateLotAnalyticsSpy?.mockRestore();
      superUpdateLotSpy?.mockRestore();
    });

    it("should process recipe name when provided", async () => {
      await service.updateLot(mockUpdateLotArgs as any);

      expect(processRecipeInputSpy).toHaveBeenCalledWith(
        "Updated Recipe",
        "system",
        EnumLotWhiskeyType.WheatWhiskey
      );
    });

    it("should process recipe ID when provided", async () => {
      const argsWithRecipeId = {
        where: { id: "lot-id-123" },
        data: {
          recipe: { connect: { id: "recipe-id-789" } },
        },
      };

      await service.updateLot(argsWithRecipeId as any);

      expect(processRecipeInputSpy).toHaveBeenCalledWith(
        { connect: { id: "recipe-id-789" } },
        "system",
        undefined
      );
    });

    it("should skip recipe processing when neither provided", async () => {
      const argsWithoutRecipe = {
        where: { id: "lot-id-123" },
        data: {
          notes: "Updated notes",
        },
      };

      await service.updateLot(argsWithoutRecipe as any);

      expect(processRecipeInputSpy).not.toHaveBeenCalled();
    });

    it("should work with typed LotUpdateInput including recipeName", async () => {
      // Test with proper TypeScript types
      const typedUpdateInput: LotUpdateInput & { recipeName: string } = {
        recipeName: "Updated Typed Recipe",
        whiskeyType: EnumLotWhiskeyType.WheatedBourbon,
        notes: "Updated with TypeScript types",
      };

      const argsWithTypedData = {
        where: { id: "lot-id-123" },
        data: typedUpdateInput,
      };

      await service.updateLot(argsWithTypedData as any);

      expect(processRecipeInputSpy).toHaveBeenCalledWith(
        "Updated Typed Recipe",
        "system",
        EnumLotWhiskeyType.WheatedBourbon
      );
    });
  });

  describe("Type Safety Tests", () => {
    it("should enforce recipeName as string type in LotCreateInput", () => {
      // This test verifies TypeScript type checking at compile time
      const validInput: LotCreateInput & { recipeName: string } = {
        recipeName: "Valid String Recipe Name",
        bblOem: "WVG",
        lotAlphaChar: "A",
        lotNumber: "",
        createdBy: "test-user",
      };

      expect(typeof validInput.recipeName).toBe("string");
      expect(validInput.recipeName).toBe("Valid String Recipe Name");
    });

    it("should enforce recipeName as string type in LotUpdateInput", () => {
      // This test verifies TypeScript type checking at compile time
      const validInput: LotUpdateInput & { recipeName: string } = {
        recipeName: "Valid Update Recipe Name",
        notes: "Some notes",
      };

      expect(typeof validInput.recipeName).toBe("string");
      expect(validInput.recipeName).toBe("Valid Update Recipe Name");
    });

    it("should allow recipeName to be optional in both input types", () => {
      // Test that recipeName is optional
      const createInputWithoutRecipeName: LotCreateInput = {
        bblOem: "WVG",
        lotAlphaChar: "A",
        lotNumber: "",
        createdBy: "test-user",
      };

      const updateInputWithoutRecipeName: LotUpdateInput = {
        notes: "Some notes",
      };

      expect(createInputWithoutRecipeName.recipeName).toBeUndefined();
      expect(updateInputWithoutRecipeName.recipeName).toBeUndefined();
    });
  });
});
