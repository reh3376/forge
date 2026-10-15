import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { GrainCharacter, Prisma, Recipe } from "@prisma/client";

@Injectable()
export class GrainCharacterService {
  constructor(public readonly prisma: PrismaService) {}

  async findAll(args?: Prisma.GrainCharacterFindManyArgs) {
    return this.prisma.grainCharacter.findMany({
      where: args?.where,
      orderBy: args?.orderBy || [
        { abbreviation: "asc" },
        { varietyCode: "asc" },
      ],
      take: args?.take,
      skip: args?.skip,
      include: { itemGroups: true },
    });
  }

  async findAllActive() {
    return this.prisma.grainCharacter.findMany({
      where: { active: true },
      orderBy: [{ abbreviation: "asc" }, { varietyCode: "asc" }],
      include: { itemGroups: true },
    });
  }

  async findOne(id: string): Promise<GrainCharacter | null> {
    return this.prisma.grainCharacter.findUnique({
      where: { id },
    });
  }

  async findByAbbreviation(
    abbreviation: string,
    varietyCode?: string | null
  ): Promise<GrainCharacter | null> {
    return this.prisma.grainCharacter.findFirst({
      where: {
        abbreviation,
        varietyCode: varietyCode ?? null,
      },
    });
  }

  async create(
    data: Prisma.GrainCharacterCreateInput
  ): Promise<GrainCharacter> {
    // Only pass valid fields to avoid unknown argument errors
    const { abbreviation, name, varietyCode, description, active } =
      data as any;
    return this.prisma.grainCharacter.create({
      data: {
        abbreviation,
        name,
        varietyCode,
        description,
        active,
      },
    });
  }

  /**
   * Get recipes that are actively using this grain character
   * (i.e., recipes with production orders that are not completed or cancelled)
   */
  async getActiveRecipeUsage(id: string): Promise<Recipe[]> {
    return this.prisma.recipe.findMany({
      where: {
        recipeGrainCharacters: {
          some: { grainCharacterId: id },
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
  }

  /**
   * Check if a grain character is used in any active recipes
   */
  async isUsedInActiveRecipes(id: string): Promise<boolean> {
    const usage = await this.getActiveRecipeUsage(id);
    return usage.length > 0;
  }

  /**
   * Get count of recipes using this grain character (including inactive)
   */
  async getRecipeUsageCount(id: string): Promise<number> {
    return this.prisma.recipeGrainCharacter.count({
      where: { grainCharacterId: id },
    });
  }

  async update(
    id: string,
    data: Prisma.GrainCharacterUpdateInput
  ): Promise<GrainCharacter> {
    // Check if updating critical fields (abbreviation, varietyCode)
    const isCriticalUpdate =
      data.abbreviation !== undefined || data.varietyCode !== undefined;

    if (isCriticalUpdate) {
      const activeRecipes = await this.getActiveRecipeUsage(id);
      if (activeRecipes.length > 0) {
        const recipeNames = activeRecipes
          .slice(0, 3)
          .map((r) => r.Recipe)
          .join(", ");
        const suffix =
          activeRecipes.length > 3
            ? ` and ${activeRecipes.length - 3} more`
            : "";
        throw new BadRequestException(
          `Cannot modify abbreviation or varietyCode: grain character is used in ${activeRecipes.length} active recipe(s): ${recipeNames}${suffix}`
        );
      }
    }

    return this.prisma.grainCharacter.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<GrainCharacter> {
    // Check if used in any recipes (active or not)
    const recipeUsage = await this.getRecipeUsageCount(id);
    if (recipeUsage > 0) {
      throw new BadRequestException(
        `Cannot delete grain character: it is used in ${recipeUsage} recipe(s). Consider deactivating instead.`
      );
    }

    // Check if linked to any item groups
    const itemGroupUsage = await this.prisma.itemGroup.count({
      where: { grainCharacterId: id },
    });
    if (itemGroupUsage > 0) {
      throw new BadRequestException(
        `Cannot delete grain character: it is linked to ${itemGroupUsage} item group(s). Remove the associations first.`
      );
    }

    return this.prisma.grainCharacter.delete({
      where: { id },
    });
  }

  async setActive(id: string, active: boolean): Promise<GrainCharacter> {
    return this.prisma.grainCharacter.update({
      where: { id },
      data: { active },
    });
  }

  async count(where?: Prisma.GrainCharacterWhereInput): Promise<number> {
    return this.prisma.grainCharacter.count({ where });
  }

  /**
   * Get all abbreviations (for quick lookup)
   */
  async getAbbreviations(): Promise<string[]> {
    const result = await this.prisma.grainCharacter.findMany({
      select: { abbreviation: true },
      distinct: ["abbreviation"],
      where: { active: true },
      orderBy: { abbreviation: "asc" },
    });
    return result.map((r) => r.abbreviation);
  }

  /**
   * Link ItemGroups to this GrainCharacter
   */
  async linkItemGroups(
    grainCharacterId: string,
    itemGroupIds: string[]
  ): Promise<{ linked: number; unlinked: number }> {
    // Get currently linked item groups
    const currentlyLinked = await this.prisma.itemGroup.findMany({
      where: { grainCharacterId },
      select: { id: true },
    });
    const currentIds = new Set(currentlyLinked.map((ig) => ig.id));
    const newIds = new Set(itemGroupIds);

    // Unlink item groups that are no longer selected
    const toUnlink = [...currentIds].filter((id) => !newIds.has(id));
    if (toUnlink.length > 0) {
      await this.prisma.itemGroup.updateMany({
        where: { id: { in: toUnlink } },
        data: { grainCharacterId: null },
      });
    }

    // Link newly selected item groups
    const toLink = itemGroupIds.filter((id) => !currentIds.has(id));
    if (toLink.length > 0) {
      await this.prisma.itemGroup.updateMany({
        where: { id: { in: toLink } },
        data: { grainCharacterId },
      });
    }

    return { linked: toLink.length, unlinked: toUnlink.length };
  }
}
