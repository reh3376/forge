import { Test, TestingModule } from "@nestjs/testing";
import { BomService } from "./bom.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotFoundException } from "@nestjs/common";
import { CalculateBomDto } from "./dto/calculate-bom.dto";

describe("BomService - Derived Units", () => {
  let service: BomService;
  let prisma: PrismaService;

  // Mock data
  const mockRecipe = {
    id: "recipe-1",
    name: "Test Bourbon Recipe",
  };

  const mockPercentUnit = {
    id: "unit-percent",
    name: "Percent",
    abbreviation: "%",
    perOperation: null,
  };

  const mockKgPerFermenterUnit = {
    id: "unit-kg-fermenter",
    name: "Kilograms per Fermenter",
    abbreviation: "Kg/Fermenter",
    perOperation: "PerFermenter",
  };

  const mockLbsPerCookUnit = {
    id: "unit-lbs-cook",
    name: "Pounds per Cook",
    abbreviation: "Lbs/Cook",
    perOperation: "PerCook",
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BomService,
        {
          provide: PrismaService,
          useValue: {
            recipe: {
              findUnique: jest.fn(),
            },
            recipeBom: {
              findUnique: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<BomService>(BomService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe("Grain Percentage Calculations", () => {
    it("should calculate absolute grain weights from percentages", async () => {
      // Given: Recipe with 70% corn, 15% rye, 15% malt
      const mockRecipeBom = {
        id: "bom-1",
        recipeBomITem: [
          {
            id: "item-1",
            itemId: "corn-id",
            quantity: 70,
            displayUnits: mockPercentUnit,
            item: { itemNumber: "CORN-001", itemName: "Corn" },
          },
          {
            id: "item-2",
            itemId: "rye-id",
            quantity: 15,
            displayUnits: mockPercentUnit,
            item: { itemNumber: "RYE-001", itemName: "Rye" },
          },
          {
            id: "item-3",
            itemId: "malt-id",
            quantity: 15,
            displayUnits: mockPercentUnit,
            item: { itemNumber: "MALT-001", itemName: "Malt" },
          },
        ],
      };

      jest
        .spyOn(prisma.recipe, "findUnique")
        .mockResolvedValue(mockRecipe as any);
      jest
        .spyOn(prisma.recipeBom, "findUnique")
        .mockResolvedValue(mockRecipeBom as any);

      // And: Production order with 1000kg totalGrainWeight, 5 cooks, 500 units
      const calculateDto: CalculateBomDto = {
        recipeId: "recipe-1",
        recipeBomId: "bom-1",
        containerType: "barrel",
        orderQuantity: 500,
        totalGrainWeight: 1000,
        totalCooks: 5,
        totalFermenters: 0,
      };

      // When: Calculate BOM
      const result = await service.calculateBom(calculateDto);

      // Then: Corn = (70% × 1000kg × 5 cooks) / 500 units = 7kg per unit
      expect(result.items[0].calculatedQuantity).toBe(7);
      expect(result.items[0].itemType).toBe("Grain");

      // Rye = (15% × 1000kg × 5 cooks) / 500 units = 1.5kg per unit
      expect(result.items[1].calculatedQuantity).toBe(1.5);
      expect(result.items[1].itemType).toBe("Grain");

      // Malt = (15% × 1000kg × 5 cooks) / 500 units = 1.5kg per unit
      expect(result.items[2].calculatedQuantity).toBe(1.5);
      expect(result.items[2].itemType).toBe("Grain");
    });

    it("should handle 4-grain mash bill correctly", async () => {
      const mockRecipeBom = {
        id: "bom-1",
        recipeBomITem: [
          {
            id: "item-1",
            itemId: "corn-id",
            quantity: 51,
            displayUnits: mockPercentUnit,
            item: { itemNumber: "CORN-001", itemName: "Corn" },
          },
          {
            id: "item-2",
            itemId: "rye-id",
            quantity: 39,
            displayUnits: mockPercentUnit,
            item: { itemNumber: "RYE-001", itemName: "Rye" },
          },
          {
            id: "item-3",
            itemId: "malt-id",
            quantity: 8,
            displayUnits: mockPercentUnit,
            item: { itemNumber: "MALT-001", itemName: "Malt" },
          },
          {
            id: "item-4",
            itemId: "wheat-id",
            quantity: 2,
            displayUnits: mockPercentUnit,
            item: { itemNumber: "WHEAT-001", itemName: "Wheat" },
          },
        ],
      };

      jest
        .spyOn(prisma.recipe, "findUnique")
        .mockResolvedValue(mockRecipe as any);
      jest
        .spyOn(prisma.recipeBom, "findUnique")
        .mockResolvedValue(mockRecipeBom as any);

      const calculateDto: CalculateBomDto = {
        recipeId: "recipe-1",
        recipeBomId: "bom-1",
        containerType: "barrel",
        orderQuantity: 1000,
        totalGrainWeight: 2000,
        totalCooks: 10,
        totalFermenters: 0,
      };

      const result = await service.calculateBom(calculateDto);

      // Verify all four grains calculated correctly
      expect(result.items).toHaveLength(4);
      expect(result.items[0].calculatedQuantity).toBe(10.2); // 51% × 2000 × 10 / 1000
      expect(result.items[1].calculatedQuantity).toBe(7.8); // 39% × 2000 × 10 / 1000
      expect(result.items[2].calculatedQuantity).toBe(1.6); // 8% × 2000 × 10 / 1000
      expect(result.items[3].calculatedQuantity).toBe(0.4); // 2% × 2000 × 10 / 1000
    });
  });

  describe("Yeast Per Fermenter Calculations", () => {
    it("should calculate total yeast from per-fermenter rate", async () => {
      // Given: Recipe with 2 Kg/Fermenter yeast
      const mockRecipeBom = {
        id: "bom-1",
        recipeBomITem: [
          {
            id: "item-1",
            itemId: "yeast-id",
            quantity: 2.5,
            displayUnits: mockKgPerFermenterUnit,
            item: { itemNumber: "YEAST-001", itemName: "Distillers Yeast" },
          },
        ],
      };

      jest
        .spyOn(prisma.recipe, "findUnique")
        .mockResolvedValue(mockRecipe as any);
      jest
        .spyOn(prisma.recipeBom, "findUnique")
        .mockResolvedValue(mockRecipeBom as any);

      // And: Production order with 8 fermenters, 1000 units
      const calculateDto: CalculateBomDto = {
        recipeId: "recipe-1",
        recipeBomId: "bom-1",
        containerType: "barrel",
        orderQuantity: 1000,
        totalGrainWeight: 0,
        totalCooks: 0,
        totalFermenters: 8,
      };

      // When: Calculate BOM
      const result = await service.calculateBom(calculateDto);

      // Then: Yeast = (2.5 kg × 8 fermenters) / 1000 units = 0.02kg per unit
      expect(result.items[0].calculatedQuantity).toBe(0.02);
      expect(result.items[0].itemType).toBe("Yeast");
    });

    it("should handle different fermenter counts", async () => {
      const mockRecipeBom = {
        id: "bom-1",
        recipeBomITem: [
          {
            id: "item-1",
            itemId: "yeast-id",
            quantity: 3,
            displayUnits: mockKgPerFermenterUnit,
            item: { itemNumber: "YEAST-001", itemName: "Yeast" },
          },
        ],
      };

      jest
        .spyOn(prisma.recipe, "findUnique")
        .mockResolvedValue(mockRecipe as any);
      jest
        .spyOn(prisma.recipeBom, "findUnique")
        .mockResolvedValue(mockRecipeBom as any);

      // Test with 4 fermenters
      const calculateDto: CalculateBomDto = {
        recipeId: "recipe-1",
        recipeBomId: "bom-1",
        containerType: "barrel",
        orderQuantity: 500,
        totalGrainWeight: 0,
        totalCooks: 0,
        totalFermenters: 4,
      };

      const result = await service.calculateBom(calculateDto);

      // Yeast = (3 kg × 4 fermenters) / 500 units = 0.024kg per unit
      expect(result.items[0].calculatedQuantity).toBe(0.024);
    });
  });

  describe("Enzyme Per Cook Calculations", () => {
    it("should calculate total enzyme from per-cook rate", async () => {
      // Given: Recipe with 0.0001 Lbs/Cook enzyme
      const mockRecipeBom = {
        id: "bom-1",
        recipeBomITem: [
          {
            id: "item-1",
            itemId: "enzyme-id",
            quantity: 0.0001,
            displayUnits: mockLbsPerCookUnit,
            item: { itemNumber: "ENZYME-ALPHA", itemName: "Alpha Amylase" },
          },
        ],
      };

      jest
        .spyOn(prisma.recipe, "findUnique")
        .mockResolvedValue(mockRecipe as any);
      jest
        .spyOn(prisma.recipeBom, "findUnique")
        .mockResolvedValue(mockRecipeBom as any);

      // And: Production order with 10 cooks, 500 units
      const calculateDto: CalculateBomDto = {
        recipeId: "recipe-1",
        recipeBomId: "bom-1",
        containerType: "barrel",
        orderQuantity: 500,
        totalGrainWeight: 0,
        totalCooks: 10,
        totalFermenters: 0,
      };

      // When: Calculate BOM
      const result = await service.calculateBom(calculateDto);

      // Then: Enzyme = (0.0001 lbs × 10 cooks) / 500 units = 0.000002 lbs per unit
      expect(result.items[0].calculatedQuantity).toBe(0.000002);
      expect(result.items[0].itemType).toBe("Additive");
    });

    it("should handle multiple enzymes correctly", async () => {
      const mockRecipeBom = {
        id: "bom-1",
        recipeBomITem: [
          {
            id: "item-1",
            itemId: "enzyme-alpha-id",
            quantity: 0.0001,
            displayUnits: mockLbsPerCookUnit,
            item: { itemNumber: "ENZYME-ALPHA", itemName: "Alpha Amylase" },
          },
          {
            id: "item-2",
            itemId: "enzyme-gluco-id",
            quantity: 0.00005,
            displayUnits: mockLbsPerCookUnit,
            item: { itemNumber: "ENZYME-GLUCO", itemName: "Glucoamylase" },
          },
        ],
      };

      jest
        .spyOn(prisma.recipe, "findUnique")
        .mockResolvedValue(mockRecipe as any);
      jest
        .spyOn(prisma.recipeBom, "findUnique")
        .mockResolvedValue(mockRecipeBom as any);

      const calculateDto: CalculateBomDto = {
        recipeId: "recipe-1",
        recipeBomId: "bom-1",
        containerType: "barrel",
        orderQuantity: 1000,
        totalGrainWeight: 0,
        totalCooks: 20,
        totalFermenters: 0,
      };

      const result = await service.calculateBom(calculateDto);

      expect(result.items).toHaveLength(2);
      expect(result.items[0].calculatedQuantity).toBe(0.000002); // 0.0001 × 20 / 1000
      expect(result.items[1].calculatedQuantity).toBe(0.000001); // 0.00005 × 20 / 1000
    });
  });

  describe("Mixed Unit BOM", () => {
    it("should handle recipe with all three derived unit types", async () => {
      const mockRecipeBom = {
        id: "bom-1",
        recipeBomITem: [
          // Grains (%)
          {
            id: "item-1",
            itemId: "corn-id",
            quantity: 70,
            displayUnits: mockPercentUnit,
            item: { itemNumber: "CORN-001", itemName: "Corn" },
          },
          {
            id: "item-2",
            itemId: "rye-id",
            quantity: 15,
            displayUnits: mockPercentUnit,
            item: { itemNumber: "RYE-001", itemName: "Rye" },
          },
          {
            id: "item-3",
            itemId: "malt-id",
            quantity: 15,
            displayUnits: mockPercentUnit,
            item: { itemNumber: "MALT-001", itemName: "Malt" },
          },
          // Yeast (Kg/Fermenter)
          {
            id: "item-4",
            itemId: "yeast-id",
            quantity: 2.5,
            displayUnits: mockKgPerFermenterUnit,
            item: { itemNumber: "YEAST-001", itemName: "Yeast" },
          },
          // Enzymes (Lbs/Cook)
          {
            id: "item-5",
            itemId: "enzyme-id",
            quantity: 0.0001,
            displayUnits: mockLbsPerCookUnit,
            item: { itemNumber: "ENZYME-ALPHA", itemName: "Alpha Amylase" },
          },
        ],
      };

      jest
        .spyOn(prisma.recipe, "findUnique")
        .mockResolvedValue(mockRecipe as any);
      jest
        .spyOn(prisma.recipeBom, "findUnique")
        .mockResolvedValue(mockRecipeBom as any);

      const calculateDto: CalculateBomDto = {
        recipeId: "recipe-1",
        recipeBomId: "bom-1",
        containerType: "barrel",
        orderQuantity: 1000,
        totalGrainWeight: 2000,
        totalCooks: 10,
        totalFermenters: 8,
      };

      const result = await service.calculateBom(calculateDto);

      // Verify all items calculated with correct formulas
      expect(result.items).toHaveLength(5);

      // Grains
      expect(result.items[0].itemType).toBe("Grain");
      expect(result.items[0].calculatedQuantity).toBe(14); // 70% × 2000 × 10 / 1000

      expect(result.items[1].itemType).toBe("Grain");
      expect(result.items[1].calculatedQuantity).toBe(3); // 15% × 2000 × 10 / 1000

      expect(result.items[2].itemType).toBe("Grain");
      expect(result.items[2].calculatedQuantity).toBe(3); // 15% × 2000 × 10 / 1000

      // Yeast
      expect(result.items[3].itemType).toBe("Yeast");
      expect(result.items[3].calculatedQuantity).toBe(0.02); // 2.5 × 8 / 1000

      // Enzyme
      expect(result.items[4].itemType).toBe("Additive");
      expect(result.items[4].calculatedQuantity).toBe(0.000001); // 0.0001 × 10 / 1000
    });

    it("should fall back to absolute quantities for items without derived units", async () => {
      const mockRecipeBom = {
        id: "bom-1",
        recipeBomITem: [
          {
            id: "item-1",
            itemId: "water-id",
            quantity: 500,
            displayUnits: null, // No unit specified
            item: { itemNumber: "WATER-001", itemName: "Water" },
          },
          {
            id: "item-2",
            itemId: "corn-id",
            quantity: 70,
            displayUnits: mockPercentUnit,
            item: { itemNumber: "CORN-001", itemName: "Corn" },
          },
        ],
      };

      jest
        .spyOn(prisma.recipe, "findUnique")
        .mockResolvedValue(mockRecipe as any);
      jest
        .spyOn(prisma.recipeBom, "findUnique")
        .mockResolvedValue(mockRecipeBom as any);

      const calculateDto: CalculateBomDto = {
        recipeId: "recipe-1",
        recipeBomId: "bom-1",
        containerType: "barrel",
        orderQuantity: 100,
        totalGrainWeight: 1000,
        totalCooks: 5,
        totalFermenters: 0,
      };

      const result = await service.calculateBom(calculateDto);

      // Water should use absolute quantity (no unit conversion)
      // But water is a special case - it uses cook count
      expect(result.items[0].calculatedQuantity).toBe(2500); // 500 × 5 cooks

      // Corn should use percentage calculation
      expect(result.items[1].calculatedQuantity).toBe(35); // 70% × 1000 × 5 / 100
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero quantities gracefully", async () => {
      const mockRecipeBom = {
        id: "bom-1",
        recipeBomITem: [
          {
            id: "item-1",
            itemId: "corn-id",
            quantity: 0,
            displayUnits: mockPercentUnit,
            item: { itemNumber: "CORN-001", itemName: "Corn" },
          },
        ],
      };

      jest
        .spyOn(prisma.recipe, "findUnique")
        .mockResolvedValue(mockRecipe as any);
      jest
        .spyOn(prisma.recipeBom, "findUnique")
        .mockResolvedValue(mockRecipeBom as any);

      const calculateDto: CalculateBomDto = {
        recipeId: "recipe-1",
        recipeBomId: "bom-1",
        containerType: "barrel",
        orderQuantity: 100,
        totalGrainWeight: 1000,
        totalCooks: 5,
        totalFermenters: 0,
      };

      const result = await service.calculateBom(calculateDto);

      expect(result.items[0].calculatedQuantity).toBe(0);
      expect(result.items[0].originalQuantity).toBe(0);
    });

    it("should handle null quantities", async () => {
      const mockRecipeBom = {
        id: "bom-1",
        recipeBomITem: [
          {
            id: "item-1",
            itemId: "corn-id",
            quantity: null,
            displayUnits: mockPercentUnit,
            item: { itemNumber: "CORN-001", itemName: "Corn" },
          },
        ],
      };

      jest
        .spyOn(prisma.recipe, "findUnique")
        .mockResolvedValue(mockRecipe as any);
      jest
        .spyOn(prisma.recipeBom, "findUnique")
        .mockResolvedValue(mockRecipeBom as any);

      const calculateDto: CalculateBomDto = {
        recipeId: "recipe-1",
        recipeBomId: "bom-1",
        containerType: "barrel",
        orderQuantity: 100,
        totalGrainWeight: 1000,
        totalCooks: 5,
        totalFermenters: 0,
      };

      const result = await service.calculateBom(calculateDto);

      // Should default to 0
      expect(result.items[0].calculatedQuantity).toBe(0);
    });

    it("should throw NotFoundException for invalid recipe", async () => {
      jest.spyOn(prisma.recipe, "findUnique").mockResolvedValue(null);

      const calculateDto: CalculateBomDto = {
        recipeId: "invalid-id",
        recipeBomId: "bom-1",
        containerType: "barrel",
        orderQuantity: 100,
        totalGrainWeight: 1000,
        totalCooks: 5,
        totalFermenters: 0,
      };

      await expect(service.calculateBom(calculateDto)).rejects.toThrow(
        NotFoundException
      );
    });

    it("should throw NotFoundException for invalid recipe BOM", async () => {
      jest
        .spyOn(prisma.recipe, "findUnique")
        .mockResolvedValue(mockRecipe as any);
      jest.spyOn(prisma.recipeBom, "findUnique").mockResolvedValue(null);

      const calculateDto: CalculateBomDto = {
        recipeId: "recipe-1",
        recipeBomId: "invalid-bom-id",
        containerType: "barrel",
        orderQuantity: 100,
        totalGrainWeight: 1000,
        totalCooks: 5,
        totalFermenters: 0,
      };

      await expect(service.calculateBom(calculateDto)).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe("Precision and Rounding", () => {
    it("should round results to 4 decimal places", async () => {
      const mockRecipeBom = {
        id: "bom-1",
        recipeBomITem: [
          {
            id: "item-1",
            itemId: "enzyme-id",
            quantity: 0.000033333,
            displayUnits: mockLbsPerCookUnit,
            item: { itemNumber: "ENZYME-001", itemName: "Enzyme" },
          },
        ],
      };

      jest
        .spyOn(prisma.recipe, "findUnique")
        .mockResolvedValue(mockRecipe as any);
      jest
        .spyOn(prisma.recipeBom, "findUnique")
        .mockResolvedValue(mockRecipeBom as any);

      const calculateDto: CalculateBomDto = {
        recipeId: "recipe-1",
        recipeBomId: "bom-1",
        containerType: "barrel",
        orderQuantity: 1000,
        totalGrainWeight: 0,
        totalCooks: 7,
        totalFermenters: 0,
      };

      const result = await service.calculateBom(calculateDto);

      // Result should be rounded to 4 decimal places
      const expected = Math.round(((0.000033333 * 7) / 1000) * 10000) / 10000;
      expect(result.items[0].calculatedQuantity).toBe(expected);
    });
  });
});
