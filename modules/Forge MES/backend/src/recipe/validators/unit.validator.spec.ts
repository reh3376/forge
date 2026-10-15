import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { UnitValidator } from "./unit.validator";
import { PrismaService } from "../../prisma/prisma.service";
import { RecipeBomItem } from "@prisma/client";

describe("UnitValidator", () => {
  let validator: UnitValidator;
  let prisma: PrismaService;

  const mockPrismaService = {
    recipeBomItem: {
      findMany: jest.fn(),
    },
    item: {
      findUnique: jest.fn(),
    },
    units: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnitValidator,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    validator = module.get<UnitValidator>(UnitValidator);
    prisma = module.get<PrismaService>(PrismaService);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe("validateGrainPercentages", () => {
    it("should pass when grain percentages sum to 100%", async () => {
      const bomItems = [
        { id: "item1", quantity: 70 },
        { id: "item2", quantity: 20 },
        { id: "item3", quantity: 10 },
      ] as RecipeBomItem[];

      mockPrismaService.recipeBomItem.findMany.mockResolvedValue([
        { id: "item1", quantity: 70, displayUnits: { name: "Percent" } },
        { id: "item2", quantity: 20, displayUnits: { name: "Percent" } },
        { id: "item3", quantity: 10, displayUnits: { name: "Percent" } },
      ]);

      await expect(
        validator.validateGrainPercentages(bomItems)
      ).resolves.not.toThrow();
    });

    it("should pass when grain percentages sum to 99.995% (within tolerance)", async () => {
      const bomItems = [
        { id: "item1", quantity: 70 },
        { id: "item2", quantity: 19.995 },
        { id: "item3", quantity: 10 },
      ] as RecipeBomItem[];

      mockPrismaService.recipeBomItem.findMany.mockResolvedValue([
        { id: "item1", quantity: 70, displayUnits: { name: "Percent" } },
        { id: "item2", quantity: 19.995, displayUnits: { name: "Percent" } },
        { id: "item3", quantity: 10, displayUnits: { name: "Percent" } },
      ]);

      await expect(
        validator.validateGrainPercentages(bomItems)
      ).resolves.not.toThrow();
    });

    it("should throw BadRequestException when grain percentages sum to 95%", async () => {
      const bomItems = [
        { id: "item1", quantity: 70 },
        { id: "item2", quantity: 15 },
        { id: "item3", quantity: 10 },
      ] as RecipeBomItem[];

      mockPrismaService.recipeBomItem.findMany.mockResolvedValue([
        { id: "item1", quantity: 70, displayUnits: { name: "Percent" } },
        { id: "item2", quantity: 15, displayUnits: { name: "Percent" } },
        { id: "item3", quantity: 10, displayUnits: { name: "Percent" } },
      ]);

      await expect(
        validator.validateGrainPercentages(bomItems)
      ).rejects.toThrow(
        new BadRequestException(
          "Grain percentages must sum to 100% (current: 95.00%)"
        )
      );
    });

    it("should throw BadRequestException when grain percentages sum to 105%", async () => {
      const bomItems = [
        { id: "item1", quantity: 70 },
        { id: "item2", quantity: 20 },
        { id: "item3", quantity: 15 },
      ] as RecipeBomItem[];

      mockPrismaService.recipeBomItem.findMany.mockResolvedValue([
        { id: "item1", quantity: 70, displayUnits: { name: "Percent" } },
        { id: "item2", quantity: 20, displayUnits: { name: "Percent" } },
        { id: "item3", quantity: 15, displayUnits: { name: "Percent" } },
      ]);

      await expect(
        validator.validateGrainPercentages(bomItems)
      ).rejects.toThrow(
        new BadRequestException(
          "Grain percentages must sum to 100% (current: 105.00%)"
        )
      );
    });

    it("should pass when there are no grain items (no Percent units)", async () => {
      const bomItems = [
        { id: "item1", quantity: 2.5 },
        { id: "item2", quantity: 0.0001 },
      ] as RecipeBomItem[];

      mockPrismaService.recipeBomItem.findMany.mockResolvedValue([
        {
          id: "item1",
          quantity: 2.5,
          displayUnits: { name: "Kilograms per Fermenter" },
        },
        {
          id: "item2",
          quantity: 0.0001,
          displayUnits: { name: "Pounds per Cook" },
        },
      ]);

      await expect(
        validator.validateGrainPercentages(bomItems)
      ).resolves.not.toThrow();
    });

    it("should handle null quantities gracefully", async () => {
      const bomItems = [
        { id: "item1", quantity: null },
        { id: "item2", quantity: 100 },
      ] as RecipeBomItem[];

      mockPrismaService.recipeBomItem.findMany.mockResolvedValue([
        { id: "item1", quantity: null, displayUnits: { name: "Percent" } },
        { id: "item2", quantity: 100, displayUnits: { name: "Percent" } },
      ]);

      await expect(
        validator.validateGrainPercentages(bomItems)
      ).resolves.not.toThrow();
    });
  });

  describe("validateUnitForItem", () => {
    it("should pass when grain item uses Percent units", async () => {
      mockPrismaService.item.findUnique.mockResolvedValue({
        id: "item1",
        itemGroup: "Grain",
      });

      mockPrismaService.units.findUnique.mockResolvedValue({
        id: "unit1",
        name: "Percent",
        perOperation: null,
      });

      await expect(
        validator.validateUnitForItem("item1", "unit1")
      ).resolves.not.toThrow();
    });

    it("should throw when grain item uses non-Percent units", async () => {
      mockPrismaService.item.findUnique.mockResolvedValue({
        id: "item1",
        itemGroup: "Grain",
      });

      mockPrismaService.units.findUnique.mockResolvedValue({
        id: "unit1",
        name: "Kilograms",
        perOperation: null,
      });

      await expect(
        validator.validateUnitForItem("item1", "unit1")
      ).rejects.toThrow(
        new BadRequestException("Grain items should use Percent (%) units")
      );
    });

    it("should pass when yeast item uses PerFermenter units", async () => {
      mockPrismaService.item.findUnique.mockResolvedValue({
        id: "item1",
        itemGroup: "Yeast",
      });

      mockPrismaService.units.findUnique.mockResolvedValue({
        id: "unit1",
        name: "Kilograms per Fermenter",
        perOperation: "PerFermenter",
      });

      await expect(
        validator.validateUnitForItem("item1", "unit1")
      ).resolves.not.toThrow();
    });

    it("should throw when yeast item uses non-PerFermenter units", async () => {
      mockPrismaService.item.findUnique.mockResolvedValue({
        id: "item1",
        itemGroup: "Yeast",
      });

      mockPrismaService.units.findUnique.mockResolvedValue({
        id: "unit1",
        name: "Kilograms",
        perOperation: null,
      });

      await expect(
        validator.validateUnitForItem("item1", "unit1")
      ).rejects.toThrow(
        new BadRequestException("Yeast items should use Kg/Fermenter units")
      );
    });

    it("should pass when enzyme item uses PerCook units", async () => {
      mockPrismaService.item.findUnique.mockResolvedValue({
        id: "item1",
        itemGroup: "Enzyme",
      });

      mockPrismaService.units.findUnique.mockResolvedValue({
        id: "unit1",
        name: "Pounds per Cook",
        perOperation: "PerCook",
      });

      await expect(
        validator.validateUnitForItem("item1", "unit1")
      ).resolves.not.toThrow();
    });

    it("should throw when enzyme item uses non-PerCook units", async () => {
      mockPrismaService.item.findUnique.mockResolvedValue({
        id: "item1",
        itemGroup: "Enzyme",
      });

      mockPrismaService.units.findUnique.mockResolvedValue({
        id: "unit1",
        name: "Pounds",
        perOperation: null,
      });

      await expect(
        validator.validateUnitForItem("item1", "unit1")
      ).rejects.toThrow(
        new BadRequestException("Enzyme items should use Lbs/Cook units")
      );
    });

    it("should pass when item or unit does not exist", async () => {
      mockPrismaService.item.findUnique.mockResolvedValue(null);
      mockPrismaService.units.findUnique.mockResolvedValue(null);

      await expect(
        validator.validateUnitForItem("item1", "unit1")
      ).resolves.not.toThrow();
    });

    it("should pass when item has no itemGroup", async () => {
      mockPrismaService.item.findUnique.mockResolvedValue({
        id: "item1",
        itemGroup: null,
      });

      mockPrismaService.units.findUnique.mockResolvedValue({
        id: "unit1",
        name: "Kilograms",
        perOperation: null,
      });

      await expect(
        validator.validateUnitForItem("item1", "unit1")
      ).resolves.not.toThrow();
    });
  });

  describe("validateQuantityRange", () => {
    it("should pass for valid percentage (50%)", () => {
      expect(() =>
        validator.validateQuantityRange(50, "Percent")
      ).not.toThrow();
    });

    it("should pass for valid percentage (0%)", () => {
      expect(() => validator.validateQuantityRange(0, "Percent")).not.toThrow();
    });

    it("should pass for valid percentage (100%)", () => {
      expect(() =>
        validator.validateQuantityRange(100, "Percent")
      ).not.toThrow();
    });

    it("should throw for negative percentage", () => {
      expect(() => validator.validateQuantityRange(-5, "Percent")).toThrow(
        new BadRequestException("Percentage must be between 0 and 100 (got -5)")
      );
    });

    it("should throw for percentage > 100", () => {
      expect(() => validator.validateQuantityRange(105, "Percent")).toThrow(
        new BadRequestException(
          "Percentage must be between 0 and 100 (got 105)"
        )
      );
    });

    it("should pass for positive quantity with non-Percent units", () => {
      expect(() =>
        validator.validateQuantityRange(2.5, "Kilograms per Fermenter")
      ).not.toThrow();
    });

    it("should pass for zero quantity with non-Percent units", () => {
      expect(() =>
        validator.validateQuantityRange(0, "Pounds per Cook")
      ).not.toThrow();
    });

    it("should throw for negative quantity with non-Percent units", () => {
      expect(() => validator.validateQuantityRange(-1, "Kilograms")).toThrow(
        new BadRequestException("Quantity cannot be negative (got -1)")
      );
    });

    it("should pass for very small positive quantities", () => {
      expect(() =>
        validator.validateQuantityRange(0.0001, "Pounds per Cook")
      ).not.toThrow();
    });
  });
});
