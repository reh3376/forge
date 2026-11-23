import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EnumProductionOrderContainerType, Item, Prisma } from "@prisma/client";
import { ValidationRuleEngine } from "../order-validation/validation-rules";

export interface ContainerItemWithDetails extends Item {
  // itemGroup is a string field in the actual schema
}

export interface ContainerItemSearchFilters {
  search?: string;
  active?: boolean;
  limit?: number;
  offset?: number;
}

@Injectable()
export class ContainerItemService {
  private readonly logger = new Logger(ContainerItemService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get available container items for a specific container type
   */
  async getContainerItemsByType(
    containerType: EnumProductionOrderContainerType,
    filters: ContainerItemSearchFilters = {}
  ): Promise<ContainerItemWithDetails[]> {
    const { search, active = true, limit = 50, offset = 0 } = filters;

    // Check if this container type requires item selection
    if (!ValidationRuleEngine.requiresContainerItemSelection(containerType)) {
      return [];
    }

    // Get item group patterns for this container type
    const itemGroupPatterns =
      ValidationRuleEngine.getItemGroupPatternsForContainer(containerType);

    if (itemGroupPatterns.length === 0) {
      this.logger.warn(
        `No item group patterns found for container type: ${containerType}`
      );
      return [];
    }

    // Build where clause
    const whereClause: Prisma.ItemWhereInput = {
      active: active,
      OR: itemGroupPatterns.map((pattern) => ({
        itemGroup: {
          contains: pattern,
          mode: "insensitive",
        },
      })),
    };

    // Add search filter if provided
    if (search) {
      whereClause.OR = [
        ...(whereClause.OR || []),
        {
          itemNumber: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          itemDescription: {
            contains: search,
            mode: "insensitive",
          },
        },
      ];
    }

    try {
      const items = await this.prisma.item.findMany({
        where: whereClause,
        orderBy: [{ itemNumber: "asc" }, { itemDescription: "asc" }],
        take: limit,
        skip: offset,
      });

      this.logger.debug(
        `Found ${items.length} container items for type ${containerType}`
      );
      return items;
    } catch (error) {
      this.logger.error(
        `Error fetching container items for type ${containerType}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get container item by ID with validation
   */
  async getContainerItemById(
    itemId: string
  ): Promise<ContainerItemWithDetails | null> {
    try {
      const item = await this.prisma.item.findUnique({
        where: { id: itemId },
      });

      return item;
    } catch (error) {
      this.logger.error(`Error fetching container item ${itemId}:`, error);
      throw error;
    }
  }

  /**
   * Validate that an item is compatible with a container type
   */
  async validateContainerItemCompatibility(
    itemId: string,
    containerType: EnumProductionOrderContainerType
  ): Promise<{ isValid: boolean; message?: string }> {
    // Check if container type requires item selection first
    if (!ValidationRuleEngine.requiresContainerItemSelection(containerType)) {
      return {
        isValid: false,
        message: `Container type ${containerType} does not require item selection`,
      };
    }

    const item = await this.getContainerItemById(itemId);

    if (!item) {
      return {
        isValid: false,
        message: "Container item not found",
      };
    }

    // Get required item group patterns
    const requiredPatterns =
      ValidationRuleEngine.getItemGroupPatternsForContainer(containerType);
    const itemGroupName = item.itemGroup || "";

    // Check if item group matches any required pattern
    const isCompatible = requiredPatterns.some((pattern) =>
      itemGroupName.toLowerCase().includes(pattern.toLowerCase())
    );

    if (!isCompatible) {
      return {
        isValid: false,
        message: `Item ${
          item.itemNumber
        } is not compatible with container type ${containerType}. Expected item group to contain one of: ${requiredPatterns.join(
          ", "
        )}`,
      };
    }

    return { isValid: true };
  }

  /**
   * Get container item usage statistics
   */
  async getContainerItemUsageStats(itemId: string) {
    try {
      // Count how many production orders use this container item
      const usageCount = await this.prisma.productionOrder.count({
        where: {
          containerItem: {
            some: {
              id: itemId,
            },
          },
        },
      });

      // Get recent usage
      const recentUsage = await this.prisma.productionOrder.findMany({
        where: {
          containerItem: {
            some: {
              id: itemId,
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

      return {
        totalUsage: usageCount,
        recentUsage: recentUsage,
      };
    } catch (error) {
      this.logger.error(
        `Error fetching usage stats for item ${itemId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Search container items across all types
   */
  async searchContainerItems(
    query: string,
    filters: ContainerItemSearchFilters = {}
  ): Promise<ContainerItemWithDetails[]> {
    const { active = true, limit = 20, offset = 0 } = filters;

    try {
      const items = await this.prisma.item.findMany({
        where: {
          active: active,
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
                    contains: query,
                    mode: "insensitive",
                  },
                },
                {
                  itemDescription: {
                    contains: query,
                    mode: "insensitive",
                  },
                },
              ],
            },
          ],
        },
        orderBy: [{ itemNumber: "asc" }],
        take: limit,
        skip: offset,
      });

      return items;
    } catch (error) {
      this.logger.error(
        `Error searching container items with query "${query}":`,
        error
      );
      throw error;
    }
  }

  /**
   * Get container types that require item selection
   */
  getContainerTypesRequiringItemSelection(): EnumProductionOrderContainerType[] {
    return ["LargeBarrel", "SmallBarrel"];
  }

  /**
   * Get display information for container types
   */
  getContainerTypeDisplayInfo() {
    return {
      LargeBarrel: {
        displayName: "53-Gallon Barrel",
        requiresItem: true,
        description: "Standard 53-gallon whiskey barrel",
      },
      SmallBarrel: {
        displayName: "30-Gallon Barrel",
        requiresItem: true,
        description: "Smaller 30-gallon whiskey barrel",
      },
      BulkLoadout: {
        displayName: "Bulk Loadout",
        requiresItem: false,
        description: "Bulk transport container",
      },
      PlasticDrum: {
        displayName: "Plastic Drum",
        requiresItem: false,
        description: "Plastic drum container",
      },
      IbcTote275: {
        displayName: "275-Gallon IBC Tote",
        requiresItem: false,
        description: "275-gallon intermediate bulk container",
      },
      SsTote275: {
        displayName: "275-Gallon SS Tote",
        requiresItem: false,
        description: "275-gallon stainless steel tote",
      },
    };
  }
}
