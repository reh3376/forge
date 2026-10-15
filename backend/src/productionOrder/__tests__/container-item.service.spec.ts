import { Test } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
  ContainerItemService,
  ContainerItemWithDetails,
  ContainerItemSearchFilters,
} from "../container-item.service";
import { EnumProductionOrderContainerType } from "@prisma/client";

describe("ContainerItemService", () => {
  let service: ContainerItemService;
  let prisma: any;

  beforeEach(async () => {
    const mockPrisma = {
      item: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      productionOrder: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        ContainerItemService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<ContainerItemService>(ContainerItemService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe("getContainerItemsByType", () => {
    const mockItems: ContainerItemWithDetails[] = [
      {
        id: "item-1",
        itemName: "53-Gallon Barrel #1",
        itemNumber: "BBL-53-001",
        itemGroup: "BARREL-53GAL",
        active: true,
      },
      {
        id: "item-2",
        itemName: "53-Gallon Barrel #2",
        itemNumber: "BBL-53-002",
        itemGroup: "BARREL-53GAL",
        active: true,
      },
    ] as ContainerItemWithDetails[];

    it("should return items for LargeBarrel container type", async () => {
      prisma.item.findMany.mockResolvedValue(mockItems);

      const result = await service.getContainerItemsByType("LargeBarrel", {});

      expect(prisma.item.findMany).toHaveBeenCalledWith({
        where: {
          active: true,
          OR: [
            {
              itemGroup: {
                contains: "BARREL-53GAL",
                mode: "insensitive",
              },
            },
            {
              itemGroup: {
                contains: "BARREL_53",
                mode: "insensitive",
              },
            },
            {
              itemGroup: {
                contains: "53GAL",
                mode: "insensitive",
              },
            },
          ],
        },
        orderBy: [{ itemNumber: "asc" }, { itemDescription: "asc" }],
        take: 50,
        skip: 0,
      });

      expect(result).toEqual(mockItems);
    });

    it("should return items for SmallBarrel container type", async () => {
      const smallBarrelItems = [
        {
          id: "item-3",
          itemName: "30-Gallon Barrel",
          itemNumber: "BBL-30-001",
          itemGroup: "BARREL-30GAL",
          active: true,
        },
      ] as ContainerItemWithDetails[];

      prisma.item.findMany.mockResolvedValue(smallBarrelItems);

      const result = await service.getContainerItemsByType("SmallBarrel", {});

      expect(prisma.item.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              {
                itemGroup: {
                  contains: "BARREL-30GAL",
                  mode: "insensitive",
                },
              },
            ]),
          }),
        })
      );

      expect(result).toEqual(smallBarrelItems);
    });

    it("should return empty array for non-barrel container types", async () => {
      const result = await service.getContainerItemsByType("BulkLoadout", {});

      expect(result).toEqual([]);
      expect(prisma.item.findMany).not.toHaveBeenCalled();
    });

    it("should apply search filters", async () => {
      const filters: ContainerItemSearchFilters = {
        search: "barrel",
        active: true,
        limit: 10,
        offset: 5,
      };

      prisma.item.findMany.mockResolvedValue(mockItems);

      await service.getContainerItemsByType("LargeBarrel", filters);

      expect(prisma.item.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            active: true,
            OR: expect.arrayContaining([
              {
                itemNumber: {
                  contains: "barrel",
                  mode: "insensitive",
                },
              },
              {
                itemDescription: {
                  contains: "barrel",
                  mode: "insensitive",
                },
              },
            ]),
          }),
          take: 10,
          skip: 5,
        })
      );
    });
  });

  describe("getContainerItemById", () => {
    it("should return item with details", async () => {
      const mockItem = {
        id: "item-1",
        itemName: "53-Gallon Barrel",
        itemNumber: "BBL-53-001",
        itemGroup: "BARREL-53GAL",
      } as ContainerItemWithDetails;

      prisma.item.findUnique.mockResolvedValue(mockItem);

      const result = await service.getContainerItemById("item-1");

      expect(prisma.item.findUnique).toHaveBeenCalledWith({
        where: { id: "item-1" },
      });

      expect(result).toEqual(mockItem);
    });

    it("should handle errors gracefully", async () => {
      prisma.item.findUnique.mockRejectedValue(new Error("Database error"));

      await expect(service.getContainerItemById("item-1")).rejects.toThrow(
        "Database error"
      );
    });
  });

  describe("validateContainerItemCompatibility", () => {
    it("should return valid for compatible LargeBarrel item", async () => {
      const mockItem = {
        id: "item-1",
        itemNumber: "BBL-53-001",
        itemGroup: "BARREL-53GAL",
      } as ContainerItemWithDetails;

      prisma.item.findUnique.mockResolvedValue(mockItem);

      const result = await service.validateContainerItemCompatibility(
        "item-1",
        "LargeBarrel"
      );

      expect(result.isValid).toBe(true);
      expect(result.message).toBeUndefined();
    });

    it("should return invalid for incompatible item", async () => {
      const mockItem = {
        id: "item-1",
        itemNumber: "BBL-30-001",
        itemGroup: "BARREL-30GAL",
      } as ContainerItemWithDetails;

      prisma.item.findUnique.mockResolvedValue(mockItem);

      const result = await service.validateContainerItemCompatibility(
        "item-1",
        "LargeBarrel"
      );

      expect(result.isValid).toBe(false);
      expect(result.message).toContain(
        "not compatible with container type LargeBarrel"
      );
    });

    it("should return invalid for non-existent item", async () => {
      prisma.item.findUnique.mockResolvedValue(null);

      const result = await service.validateContainerItemCompatibility(
        "item-1",
        "LargeBarrel"
      );

      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Container item not found");
    });

    it("should return invalid for container types that don't require items", async () => {
      const result = await service.validateContainerItemCompatibility(
        "item-1",
        "BulkLoadout"
      );

      expect(result.isValid).toBe(false);
      expect(result.message).toContain("does not require item selection");
    });
  });

  describe("getContainerItemUsageStats", () => {
    it("should return usage statistics", async () => {
      const mockUsageCount = 5;
      const mockRecentUsage = [
        {
          id: "po-1",
          name: "Production Order 1",
          createdAt: new Date(),
          customer: {
            name: "Customer A",
          },
        },
      ];

      prisma.productionOrder.count.mockResolvedValue(mockUsageCount);
      prisma.productionOrder.findMany.mockResolvedValue(mockRecentUsage);

      const result = await service.getContainerItemUsageStats("item-1");

      expect(result.totalUsage).toBe(mockUsageCount);
      expect(result.recentUsage).toEqual(mockRecentUsage);

      expect(prisma.productionOrder.count).toHaveBeenCalledWith({
        where: {
          containerItem: {
            some: {
              id: "item-1",
            },
          },
        },
      });

      expect(prisma.productionOrder.findMany).toHaveBeenCalledWith({
        where: {
          containerItem: {
            some: {
              id: "item-1",
            },
          },
        },
        select: {
          id: true,
          name: true,
          createdAt: true,
          customer: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
      });
    });
  });

  describe("searchContainerItems", () => {
    it("should search container items with query", async () => {
      const mockItems = [
        {
          id: "item-1",
          itemName: "Oak Barrel",
          itemNumber: "BBL-001",
          itemGroup: "BARREL-53GAL",
        },
      ];

      prisma.item.findMany.mockResolvedValue(mockItems);

      const result = await service.searchContainerItems("oak", {});

      expect(prisma.item.findMany).toHaveBeenCalledWith({
        where: {
          active: true,
          AND: [
            {
              itemGroup: {
                contains: "BARREL",
                mode: "insensitive",
              },
            },
            {
              OR: [
                {
                  itemNumber: {
                    contains: "oak",
                    mode: "insensitive",
                  },
                },
                {
                  itemDescription: {
                    contains: "oak",
                    mode: "insensitive",
                  },
                },
              ],
            },
          ],
        },
        orderBy: [{ itemNumber: "asc" }],
        take: 20,
        skip: 0,
      });

      expect(result).toEqual(mockItems);
    });
  });

  describe("getContainerTypesRequiringItemSelection", () => {
    it("should return correct container types", () => {
      const result = service.getContainerTypesRequiringItemSelection();

      expect(result).toEqual(["LargeBarrel", "SmallBarrel"]);
    });
  });

  describe("getContainerTypeDisplayInfo", () => {
    it("should return display information for all container types", () => {
      const result = service.getContainerTypeDisplayInfo();

      expect(result).toHaveProperty("LargeBarrel");
      expect(result).toHaveProperty("SmallBarrel");
      expect(result).toHaveProperty("BulkLoadout");
      expect(result).toHaveProperty("PlasticDrum");
      expect(result).toHaveProperty("IbcTote275");
      expect(result).toHaveProperty("SsTote275");

      expect(result.LargeBarrel.requiresItem).toBe(true);
      expect(result.SmallBarrel.requiresItem).toBe(true);
      expect(result.BulkLoadout.requiresItem).toBe(false);
    });
  });
});
