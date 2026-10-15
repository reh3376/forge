import { Test, TestingModule } from "@nestjs/testing";
import { GrainCharacterService } from "../grainCharacter.service";
import { PrismaService } from "../../prisma/prisma.service";
import { BadRequestException } from "@nestjs/common";

describe("GrainCharacterService", () => {
  let service: GrainCharacterService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    grainCharacter: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    recipe: {
      findMany: jest.fn(),
    },
    recipeGrainCharacter: {
      count: jest.fn(),
    },
    itemGroup: {
      count: jest.fn(),
    },
  };

  const mockGrainCharacters = [
    {
      id: "1",
      abbreviation: "C",
      name: "Corn",
      varietyCode: null,
      description: "Standard yellow corn",
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "2",
      abbreviation: "R",
      name: "Rye",
      varietyCode: null,
      description: "Standard rye",
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "3",
      abbreviation: "R",
      name: "Rye Variety 1",
      varietyCode: "1",
      description: "High protein rye",
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GrainCharacterService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<GrainCharacterService>(GrainCharacterService);
    prismaService = module.get<PrismaService>(PrismaService);

    // Reset all mocks
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("findAll", () => {
    it("should return all grain characters with default ordering", async () => {
      mockPrismaService.grainCharacter.findMany.mockResolvedValue(
        mockGrainCharacters
      );

      const result = await service.findAll();

      expect(result).toEqual(mockGrainCharacters);
      expect(mockPrismaService.grainCharacter.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: [
          { abbreviation: "asc" },
          { varietyCode: "asc" },
        ],
        take: undefined,
        skip: undefined,
        include: { itemGroups: true },
      });
    });

    it("should apply custom filters", async () => {
      mockPrismaService.grainCharacter.findMany.mockResolvedValue([
        mockGrainCharacters[0],
      ]);

      const result = await service.findAll({
        where: { abbreviation: "C" },
      });

      expect(result).toHaveLength(1);
      expect(mockPrismaService.grainCharacter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { abbreviation: "C" },
        })
      );
    });
  });

  describe("findAllActive", () => {
    it("should return only active grain characters", async () => {
      const activeChars = mockGrainCharacters.filter((c) => c.active);
      mockPrismaService.grainCharacter.findMany.mockResolvedValue(activeChars);

      const result = await service.findAllActive();

      expect(result).toEqual(activeChars);
      expect(mockPrismaService.grainCharacter.findMany).toHaveBeenCalledWith({
        where: { active: true },
        orderBy: [
          { abbreviation: "asc" },
          { varietyCode: "asc" },
        ],
        include: { itemGroups: true },
      });
    });
  });

  describe("findOne", () => {
    it("should return a single grain character by id", async () => {
      mockPrismaService.grainCharacter.findUnique.mockResolvedValue(
        mockGrainCharacters[0]
      );

      const result = await service.findOne("1");

      expect(result).toEqual(mockGrainCharacters[0]);
      expect(mockPrismaService.grainCharacter.findUnique).toHaveBeenCalledWith({
        where: { id: "1" },
      });
    });

    it("should return null for non-existent id", async () => {
      mockPrismaService.grainCharacter.findUnique.mockResolvedValue(null);

      const result = await service.findOne("999");

      expect(result).toBeNull();
    });
  });

  describe("findByAbbreviation", () => {
    it("should find grain character by abbreviation without variety", async () => {
      mockPrismaService.grainCharacter.findFirst.mockResolvedValue(
        mockGrainCharacters[0]
      );

      const result = await service.findByAbbreviation("C");

      expect(result).toEqual(mockGrainCharacters[0]);
      expect(mockPrismaService.grainCharacter.findFirst).toHaveBeenCalledWith({
        where: {
          abbreviation: "C",
          varietyCode: null,
        },
      });
    });

    it("should find grain character by abbreviation with variety", async () => {
      mockPrismaService.grainCharacter.findFirst.mockResolvedValue(
        mockGrainCharacters[2]
      );

      const result = await service.findByAbbreviation("R", "1");

      expect(result).toEqual(mockGrainCharacters[2]);
      expect(mockPrismaService.grainCharacter.findFirst).toHaveBeenCalledWith({
        where: {
          abbreviation: "R",
          varietyCode: "1",
        },
      });
    });
  });

  describe("create", () => {
    it("should create a new grain character", async () => {
      const newChar = {
        abbreviation: "W",
        name: "Wheat",
        description: "Standard wheat",
        active: true,
      };

      const createdChar = {
        id: "4",
        ...newChar,
        varietyCode: undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.grainCharacter.create.mockResolvedValue(createdChar);

      const result = await service.create(newChar as any);

      expect(result).toEqual(createdChar);
      expect(mockPrismaService.grainCharacter.create).toHaveBeenCalledWith({
        data: {
          abbreviation: "W",
          name: "Wheat",
          varietyCode: undefined,
          description: "Standard wheat",
          active: true,
        },
      });
    });
  });

  describe("update", () => {
    it("should update an existing grain character (non-critical fields)", async () => {
      const updatedChar = {
        ...mockGrainCharacters[0],
        name: "Updated Corn",
      };

      mockPrismaService.grainCharacter.update.mockResolvedValue(updatedChar);

      const result = await service.update("1", { name: "Updated Corn" });

      expect(result.name).toBe("Updated Corn");
      expect(mockPrismaService.grainCharacter.update).toHaveBeenCalledWith({
        where: { id: "1" },
        data: { name: "Updated Corn" },
      });
    });

    it("should allow critical field update when not used in active recipes", async () => {
      mockPrismaService.recipe.findMany.mockResolvedValue([]);
      mockPrismaService.grainCharacter.update.mockResolvedValue({
        ...mockGrainCharacters[0],
        abbreviation: "CX",
      });

      const result = await service.update("1", { abbreviation: "CX" });

      expect(result.abbreviation).toBe("CX");
    });

    it("should throw when updating critical fields if used in active recipes", async () => {
      mockPrismaService.recipe.findMany.mockResolvedValue([
        { id: "r1", Recipe: "WHK-75C-21R-4M" },
      ]);

      await expect(service.update("1", { abbreviation: "CX" })).rejects.toThrow(
        BadRequestException
      );
      expect(mockPrismaService.grainCharacter.update).not.toHaveBeenCalled();
    });
  });

  describe("delete", () => {
    it("should delete a grain character when not in use", async () => {
      mockPrismaService.recipeGrainCharacter.count.mockResolvedValue(0);
      mockPrismaService.itemGroup.count.mockResolvedValue(0);
      mockPrismaService.grainCharacter.delete.mockResolvedValue(
        mockGrainCharacters[0]
      );

      const result = await service.delete("1");

      expect(result).toEqual(mockGrainCharacters[0]);
      expect(mockPrismaService.grainCharacter.delete).toHaveBeenCalledWith({
        where: { id: "1" },
      });
    });

    it("should throw when deleting grain character used in recipes", async () => {
      mockPrismaService.recipeGrainCharacter.count.mockResolvedValue(3);

      await expect(service.delete("1")).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.grainCharacter.delete).not.toHaveBeenCalled();
    });

    it("should throw when deleting grain character linked to item groups", async () => {
      mockPrismaService.recipeGrainCharacter.count.mockResolvedValue(0);
      mockPrismaService.itemGroup.count.mockResolvedValue(2);

      await expect(service.delete("1")).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.grainCharacter.delete).not.toHaveBeenCalled();
    });
  });

  describe("getActiveRecipeUsage", () => {
    it("should return recipes with active production orders", async () => {
      const mockRecipes = [{ id: "r1", Recipe: "WHK-75C-21R-4M" }];
      mockPrismaService.recipe.findMany.mockResolvedValue(mockRecipes);

      const result = await service.getActiveRecipeUsage("1");

      expect(result).toEqual(mockRecipes);
      expect(mockPrismaService.recipe.findMany).toHaveBeenCalledWith({
        where: {
          recipeGrainCharacters: {
            some: { grainCharacterId: "1" },
          },
          productionOrders: {
            some: {
              status: {
                notIn: ["Complete"],
              },
            },
          },
        },
      });
    });
  });

  describe("getRecipeUsageCount", () => {
    it("should return count of recipes using this grain character", async () => {
      mockPrismaService.recipeGrainCharacter.count.mockResolvedValue(5);

      const result = await service.getRecipeUsageCount("1");

      expect(result).toBe(5);
    });
  });

  describe("setActive", () => {
    it("should set grain character active status", async () => {
      const deactivatedChar = {
        ...mockGrainCharacters[0],
        active: false,
      };

      mockPrismaService.grainCharacter.update.mockResolvedValue(
        deactivatedChar
      );

      const result = await service.setActive("1", false);

      expect(result.active).toBe(false);
      expect(mockPrismaService.grainCharacter.update).toHaveBeenCalledWith({
        where: { id: "1" },
        data: { active: false },
      });
    });
  });

  describe("count", () => {
    it("should return count of grain characters", async () => {
      mockPrismaService.grainCharacter.count.mockResolvedValue(3);

      const result = await service.count();

      expect(result).toBe(3);
    });

    it("should return count with filter", async () => {
      mockPrismaService.grainCharacter.count.mockResolvedValue(2);

      const result = await service.count({ active: true });

      expect(result).toBe(2);
      expect(mockPrismaService.grainCharacter.count).toHaveBeenCalledWith({
        where: { active: true },
      });
    });
  });

  describe("getAbbreviations", () => {
    it("should return distinct abbreviations", async () => {
      mockPrismaService.grainCharacter.findMany.mockResolvedValue([
        { abbreviation: "C" },
        { abbreviation: "R" },
      ]);

      const result = await service.getAbbreviations();

      expect(result).toEqual(["C", "R"]);
      expect(mockPrismaService.grainCharacter.findMany).toHaveBeenCalledWith({
        select: { abbreviation: true },
        distinct: ["abbreviation"],
        where: { active: true },
        orderBy: { abbreviation: "asc" },
      });
    });
  });
});
