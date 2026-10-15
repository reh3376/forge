import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { UnitValidator } from "../validators/unit.validator";

describe("Derived Units Integration Tests", () => {
  let module: TestingModule;
  let prismaService: PrismaService;
  let unitValidator: UnitValidator;

  // Mock units that will be returned from database
  const mockPercentUnit = {
    id: "unit-percent",
    name: "Percent",
    abbreviation: "%",
    perOperation: null,
    active: true,
  };

  const mockKgPerFermenterUnit = {
    id: "unit-kg-fermenter",
    name: "Kilograms per Fermenter",
    abbreviation: "Kg",
    perOperation: "PerFermenter",
    active: true,
    baseUnit: {
      id: "unit-kg",
      name: "Kilograms",
      abbreviation: "Kg",
    },
  };

  const mockLbsPerCookUnit = {
    id: "unit-lbs-cook",
    name: "Pounds per Cook",
    abbreviation: "Lbs",
    perOperation: "PerCook",
    active: true,
    baseUnit: {
      id: "unit-lbs",
      name: "Pounds",
      abbreviation: "Lbs",
    },
  };

  // Mock items
  const mockCornItem = {
    id: "item-corn",
    itemNumber: "CORN-001",
    name: "Yellow Dent Corn",
    itemGroup: "Grain",
    active: true,
  };

  const mockRyeItem = {
    id: "item-rye",
    itemNumber: "RYE-001",
    name: "Rye Grain",
    itemGroup: "Grain",
    active: true,
  };

  const mockMaltItem = {
    id: "item-malt",
    itemNumber: "MALT-001",
    name: "Malted Barley",
    itemGroup: "Grain",
    active: true,
  };

  const mockYeastItem = {
    id: "item-yeast",
    itemNumber: "YEAST-001",
    name: "Distillers Yeast",
    itemGroup: "Yeast",
    active: true,
  };

  const mockEnzymeItem = {
    id: "item-enzyme",
    itemNumber: "ENZYME-001",
    name: "Alpha Amylase",
    itemGroup: "Enzyme",
    active: true,
  };

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        UnitValidator,
        {
          provide: PrismaService,
          useValue: {
            recipeBomItem: {
              findMany: jest.fn(),
              create: jest.fn(),
              createMany: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            item: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
            units: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
            recipeBom: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    prismaService = module.get<PrismaService>(PrismaService);
    unitValidator = module.get<UnitValidator>(UnitValidator);
  });

  afterAll(async () => {
    await module.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Recipe with Grains (% units)", () => {
    it("should validate recipe with grains summing to 100%", async () => {
      const bomItems = [
        {
          id: "bom1",
          itemId: mockCornItem.id,
          displayUnitsId: mockPercentUnit.id,
          quantity: 70,
        },
        {
          id: "bom2",
          itemId: mockRyeItem.id,
          displayUnitsId: mockPercentUnit.id,
          quantity: 20,
        },
        {
          id: "bom3",
          itemId: mockMaltItem.id,
          displayUnitsId: mockPercentUnit.id,
          quantity: 10,
        },
      ];

      // Mock database responses
      (prismaService.recipeBomItem.findMany as jest.Mock).mockResolvedValue([
        { ...bomItems[0], displayUnits: mockPercentUnit },
        { ...bomItems[1], displayUnits: mockPercentUnit },
        { ...bomItems[2], displayUnits: mockPercentUnit },
      ]);

      await expect(
        unitValidator.validateGrainPercentages(bomItems as any)
      ).resolves.not.toThrow();
    });

    it("should reject recipe with grains summing to 95%", async () => {
      const bomItems = [
        {
          id: "bom1",
          itemId: mockCornItem.id,
          displayUnitsId: mockPercentUnit.id,
          quantity: 70,
        },
        {
          id: "bom2",
          itemId: mockRyeItem.id,
          displayUnitsId: mockPercentUnit.id,
          quantity: 15,
        },
        {
          id: "bom3",
          itemId: mockMaltItem.id,
          displayUnitsId: mockPercentUnit.id,
          quantity: 10,
        },
      ];

      (prismaService.recipeBomItem.findMany as jest.Mock).mockResolvedValue([
        { ...bomItems[0], displayUnits: mockPercentUnit },
        { ...bomItems[1], displayUnits: mockPercentUnit },
        { ...bomItems[2], displayUnits: mockPercentUnit },
      ]);

      await expect(
        unitValidator.validateGrainPercentages(bomItems as any)
      ).rejects.toThrow(
        new BadRequestException(
          "Grain percentages must sum to 100% (current: 95.00%)"
        )
      );
    });

    it("should reject recipe with grains summing to 105%", async () => {
      const bomItems = [
        {
          id: "bom1",
          itemId: mockCornItem.id,
          displayUnitsId: mockPercentUnit.id,
          quantity: 70,
        },
        {
          id: "bom2",
          itemId: mockRyeItem.id,
          displayUnitsId: mockPercentUnit.id,
          quantity: 25,
        },
        {
          id: "bom3",
          itemId: mockMaltItem.id,
          displayUnitsId: mockPercentUnit.id,
          quantity: 10,
        },
      ];

      (prismaService.recipeBomItem.findMany as jest.Mock).mockResolvedValue([
        { ...bomItems[0], displayUnits: mockPercentUnit },
        { ...bomItems[1], displayUnits: mockPercentUnit },
        { ...bomItems[2], displayUnits: mockPercentUnit },
      ]);

      await expect(
        unitValidator.validateGrainPercentages(bomItems as any)
      ).rejects.toThrow(
        new BadRequestException(
          "Grain percentages must sum to 100% (current: 105.00%)"
        )
      );
    });

    it("should accept grains within tolerance (99.995%)", async () => {
      const bomItems = [
        {
          id: "bom1",
          itemId: mockCornItem.id,
          displayUnitsId: mockPercentUnit.id,
          quantity: 70,
        },
        {
          id: "bom2",
          itemId: mockRyeItem.id,
          displayUnitsId: mockPercentUnit.id,
          quantity: 19.995,
        },
        {
          id: "bom3",
          itemId: mockMaltItem.id,
          displayUnitsId: mockPercentUnit.id,
          quantity: 10,
        },
      ];

      (prismaService.recipeBomItem.findMany as jest.Mock).mockResolvedValue([
        { ...bomItems[0], displayUnits: mockPercentUnit },
        { ...bomItems[1], displayUnits: mockPercentUnit },
        { ...bomItems[2], displayUnits: mockPercentUnit },
      ]);

      await expect(
        unitValidator.validateGrainPercentages(bomItems as any)
      ).resolves.not.toThrow();
    });

    it("should validate that grain items use Percent units", async () => {
      (prismaService.item.findUnique as jest.Mock).mockResolvedValue(
        mockCornItem
      );
      (prismaService.units.findUnique as jest.Mock).mockResolvedValue(
        mockPercentUnit
      );

      await expect(
        unitValidator.validateUnitForItem(mockCornItem.id, mockPercentUnit.id)
      ).resolves.not.toThrow();
    });

    it("should reject grain items with non-Percent units", async () => {
      (prismaService.item.findUnique as jest.Mock).mockResolvedValue(
        mockCornItem
      );
      (prismaService.units.findUnique as jest.Mock).mockResolvedValue(
        mockKgPerFermenterUnit
      );

      await expect(
        unitValidator.validateUnitForItem(
          mockCornItem.id,
          mockKgPerFermenterUnit.id
        )
      ).rejects.toThrow(
        new BadRequestException("Grain items should use Percent (%) units")
      );
    });
  });

  describe("Recipe with Yeast (Kg/Fermenter units)", () => {
    it("should validate yeast item with Kg/Fermenter units", async () => {
      (prismaService.item.findUnique as jest.Mock).mockResolvedValue(
        mockYeastItem
      );
      (prismaService.units.findUnique as jest.Mock).mockResolvedValue(
        mockKgPerFermenterUnit
      );

      await expect(
        unitValidator.validateUnitForItem(
          mockYeastItem.id,
          mockKgPerFermenterUnit.id
        )
      ).resolves.not.toThrow();
    });

    it("should reject yeast item with non-PerFermenter units", async () => {
      (prismaService.item.findUnique as jest.Mock).mockResolvedValue(
        mockYeastItem
      );
      (prismaService.units.findUnique as jest.Mock).mockResolvedValue(
        mockPercentUnit
      );

      await expect(
        unitValidator.validateUnitForItem(mockYeastItem.id, mockPercentUnit.id)
      ).rejects.toThrow(
        new BadRequestException("Yeast items should use Kg/Fermenter units")
      );
    });

    it("should accept positive yeast quantities", () => {
      expect(() =>
        unitValidator.validateQuantityRange(2.5, mockKgPerFermenterUnit.name)
      ).not.toThrow();
    });

    it("should accept zero yeast quantities", () => {
      expect(() =>
        unitValidator.validateQuantityRange(0, mockKgPerFermenterUnit.name)
      ).not.toThrow();
    });

    it("should reject negative yeast quantities", () => {
      expect(() =>
        unitValidator.validateQuantityRange(-1, mockKgPerFermenterUnit.name)
      ).toThrow(
        new BadRequestException("Quantity cannot be negative (got -1)")
      );
    });
  });

  describe("Recipe with Enzymes (Lbs/Cook units)", () => {
    it("should validate enzyme item with Lbs/Cook units", async () => {
      (prismaService.item.findUnique as jest.Mock).mockResolvedValue(
        mockEnzymeItem
      );
      (prismaService.units.findUnique as jest.Mock).mockResolvedValue(
        mockLbsPerCookUnit
      );

      await expect(
        unitValidator.validateUnitForItem(
          mockEnzymeItem.id,
          mockLbsPerCookUnit.id
        )
      ).resolves.not.toThrow();
    });

    it("should reject enzyme item with non-PerCook units", async () => {
      (prismaService.item.findUnique as jest.Mock).mockResolvedValue(
        mockEnzymeItem
      );
      (prismaService.units.findUnique as jest.Mock).mockResolvedValue(
        mockPercentUnit
      );

      await expect(
        unitValidator.validateUnitForItem(mockEnzymeItem.id, mockPercentUnit.id)
      ).rejects.toThrow(
        new BadRequestException("Enzyme items should use Lbs/Cook units")
      );
    });

    it("should accept positive enzyme quantities", () => {
      expect(() =>
        unitValidator.validateQuantityRange(0.5, mockLbsPerCookUnit.name)
      ).not.toThrow();
    });

    it("should accept very small enzyme quantities", () => {
      expect(() =>
        unitValidator.validateQuantityRange(0.0001, mockLbsPerCookUnit.name)
      ).not.toThrow();
    });

    it("should accept zero enzyme quantities", () => {
      expect(() =>
        unitValidator.validateQuantityRange(0, mockLbsPerCookUnit.name)
      ).not.toThrow();
    });

    it("should reject negative enzyme quantities", () => {
      expect(() =>
        unitValidator.validateQuantityRange(-0.1, mockLbsPerCookUnit.name)
      ).toThrow(
        new BadRequestException("Quantity cannot be negative (got -0.1)")
      );
    });
  });

  describe("Complete Recipe with Mixed Units", () => {
    it("should validate complete recipe with grains, yeast, and enzymes", async () => {
      const completeBomItems = [
        // Grains (must sum to 100%)
        {
          id: "bom1",
          itemId: mockCornItem.id,
          displayUnitsId: mockPercentUnit.id,
          quantity: 70,
        },
        {
          id: "bom2",
          itemId: mockRyeItem.id,
          displayUnitsId: mockPercentUnit.id,
          quantity: 20,
        },
        {
          id: "bom3",
          itemId: mockMaltItem.id,
          displayUnitsId: mockPercentUnit.id,
          quantity: 10,
        },
        // Yeast
        {
          id: "bom4",
          itemId: mockYeastItem.id,
          displayUnitsId: mockKgPerFermenterUnit.id,
          quantity: 2.5,
        },
        // Enzyme
        {
          id: "bom5",
          itemId: mockEnzymeItem.id,
          displayUnitsId: mockLbsPerCookUnit.id,
          quantity: 0.5,
        },
      ];

      // Mock grain percentage validation
      (prismaService.recipeBomItem.findMany as jest.Mock).mockResolvedValue([
        { ...completeBomItems[0], displayUnits: mockPercentUnit },
        { ...completeBomItems[1], displayUnits: mockPercentUnit },
        { ...completeBomItems[2], displayUnits: mockPercentUnit },
      ]);

      // Validate grain percentages
      await expect(
        unitValidator.validateGrainPercentages(
          completeBomItems.slice(0, 3) as any
        )
      ).resolves.not.toThrow();

      // Validate each item's unit
      (prismaService.item.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockCornItem)
        .mockResolvedValueOnce(mockRyeItem)
        .mockResolvedValueOnce(mockMaltItem)
        .mockResolvedValueOnce(mockYeastItem)
        .mockResolvedValueOnce(mockEnzymeItem);

      (prismaService.units.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockPercentUnit)
        .mockResolvedValueOnce(mockPercentUnit)
        .mockResolvedValueOnce(mockPercentUnit)
        .mockResolvedValueOnce(mockKgPerFermenterUnit)
        .mockResolvedValueOnce(mockLbsPerCookUnit);

      // Validate each BOM item
      for (const bomItem of completeBomItems) {
        await expect(
          unitValidator.validateUnitForItem(
            bomItem.itemId,
            bomItem.displayUnitsId
          )
        ).resolves.not.toThrow();
      }

      // Validate quantities
      expect(() =>
        unitValidator.validateQuantityRange(70, mockPercentUnit.name)
      ).not.toThrow();
      expect(() =>
        unitValidator.validateQuantityRange(20, mockPercentUnit.name)
      ).not.toThrow();
      expect(() =>
        unitValidator.validateQuantityRange(10, mockPercentUnit.name)
      ).not.toThrow();
      expect(() =>
        unitValidator.validateQuantityRange(2.5, mockKgPerFermenterUnit.name)
      ).not.toThrow();
      expect(() =>
        unitValidator.validateQuantityRange(0.5, mockLbsPerCookUnit.name)
      ).not.toThrow();
    });

    it("should reject complete recipe with invalid grain percentages", async () => {
      const invalidBomItems = [
        // Grains (sum to 90% - invalid!)
        {
          id: "bom1",
          itemId: mockCornItem.id,
          displayUnitsId: mockPercentUnit.id,
          quantity: 60,
        },
        {
          id: "bom2",
          itemId: mockRyeItem.id,
          displayUnitsId: mockPercentUnit.id,
          quantity: 20,
        },
        {
          id: "bom3",
          itemId: mockMaltItem.id,
          displayUnitsId: mockPercentUnit.id,
          quantity: 10,
        },
        // Yeast
        {
          id: "bom4",
          itemId: mockYeastItem.id,
          displayUnitsId: mockKgPerFermenterUnit.id,
          quantity: 2.5,
        },
        // Enzyme
        {
          id: "bom5",
          itemId: mockEnzymeItem.id,
          displayUnitsId: mockLbsPerCookUnit.id,
          quantity: 0.5,
        },
      ];

      (prismaService.recipeBomItem.findMany as jest.Mock).mockResolvedValue([
        { ...invalidBomItems[0], displayUnits: mockPercentUnit },
        { ...invalidBomItems[1], displayUnits: mockPercentUnit },
        { ...invalidBomItems[2], displayUnits: mockPercentUnit },
      ]);

      await expect(
        unitValidator.validateGrainPercentages(
          invalidBomItems.slice(0, 3) as any
        )
      ).rejects.toThrow(
        new BadRequestException(
          "Grain percentages must sum to 100% (current: 90.00%)"
        )
      );
    });
  });

  describe("Edge Cases", () => {
    it("should handle recipe with no grain items", async () => {
      const bomItems = [
        {
          id: "bom1",
          itemId: mockYeastItem.id,
          displayUnitsId: mockKgPerFermenterUnit.id,
          quantity: 2.5,
        },
        {
          id: "bom2",
          itemId: mockEnzymeItem.id,
          displayUnitsId: mockLbsPerCookUnit.id,
          quantity: 0.5,
        },
      ];

      (prismaService.recipeBomItem.findMany as jest.Mock).mockResolvedValue([
        { ...bomItems[0], displayUnits: mockKgPerFermenterUnit },
        { ...bomItems[1], displayUnits: mockLbsPerCookUnit },
      ]);

      await expect(
        unitValidator.validateGrainPercentages(bomItems as any)
      ).resolves.not.toThrow();
    });

    it("should handle null quantities gracefully", async () => {
      const bomItems = [
        {
          id: "bom1",
          itemId: mockCornItem.id,
          displayUnitsId: mockPercentUnit.id,
          quantity: null,
        },
        {
          id: "bom2",
          itemId: mockRyeItem.id,
          displayUnitsId: mockPercentUnit.id,
          quantity: 100,
        },
      ];

      (prismaService.recipeBomItem.findMany as jest.Mock).mockResolvedValue([
        { ...bomItems[0], displayUnits: mockPercentUnit, quantity: null },
        { ...bomItems[1], displayUnits: mockPercentUnit, quantity: 100 },
      ]);

      await expect(
        unitValidator.validateGrainPercentages(bomItems as any)
      ).resolves.not.toThrow();
    });

    it("should handle items with no itemGroup", async () => {
      const itemWithoutGroup = {
        id: "item-no-group",
        itemNumber: "NO-GROUP-001",
        name: "Item Without Group",
        itemGroup: null,
        active: true,
      };

      (prismaService.item.findUnique as jest.Mock).mockResolvedValue(
        itemWithoutGroup
      );
      (prismaService.units.findUnique as jest.Mock).mockResolvedValue(
        mockPercentUnit
      );

      await expect(
        unitValidator.validateUnitForItem(
          itemWithoutGroup.id,
          mockPercentUnit.id
        )
      ).resolves.not.toThrow();
    });

    it("should handle non-existent items gracefully", async () => {
      (prismaService.item.findUnique as jest.Mock).mockResolvedValue(null);
      (prismaService.units.findUnique as jest.Mock).mockResolvedValue(
        mockPercentUnit
      );

      await expect(
        unitValidator.validateUnitForItem("non-existent", mockPercentUnit.id)
      ).resolves.not.toThrow();
    });

    it("should handle non-existent units gracefully", async () => {
      (prismaService.item.findUnique as jest.Mock).mockResolvedValue(
        mockCornItem
      );
      (prismaService.units.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        unitValidator.validateUnitForItem(mockCornItem.id, "non-existent")
      ).resolves.not.toThrow();
    });
  });

  describe("Quantity Range Validation", () => {
    it("should validate percentage ranges correctly", () => {
      expect(() =>
        unitValidator.validateQuantityRange(0, "Percent")
      ).not.toThrow();
      expect(() =>
        unitValidator.validateQuantityRange(50, "Percent")
      ).not.toThrow();
      expect(() =>
        unitValidator.validateQuantityRange(100, "Percent")
      ).not.toThrow();
      expect(() =>
        unitValidator.validateQuantityRange(100.01, "Percent")
      ).toThrow();
      expect(() =>
        unitValidator.validateQuantityRange(-0.01, "Percent")
      ).toThrow();
    });

    it("should validate non-percentage ranges correctly", () => {
      expect(() =>
        unitValidator.validateQuantityRange(0, "Kilograms per Fermenter")
      ).not.toThrow();
      expect(() =>
        unitValidator.validateQuantityRange(1000, "Kilograms per Fermenter")
      ).not.toThrow();
      expect(() =>
        unitValidator.validateQuantityRange(0.0001, "Pounds per Cook")
      ).not.toThrow();
      expect(() =>
        unitValidator.validateQuantityRange(-1, "Kilograms per Fermenter")
      ).toThrow();
      expect(() =>
        unitValidator.validateQuantityRange(-0.0001, "Pounds per Cook")
      ).toThrow();
    });
  });
});
