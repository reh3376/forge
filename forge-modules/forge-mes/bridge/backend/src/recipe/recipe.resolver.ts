import * as graphql from "@nestjs/graphql";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { RecipeResolverBase } from "./base/recipe.resolver.base";
import { Recipe } from "./base/Recipe";
import { RecipeService } from "./recipe.service";
import { RecipeCookCreationService } from "./recipe.cookcreation.service";
import { RecipeGenerator } from "./recipe.generation";
import { RecipeBomGenerationDto } from "./dto/recipe-bom-generation.dto";
import { RecipeBomResponseDto } from "./dto/recipe-bom-response.dto";
import { GraphQLJSONObject } from "graphql-type-json";
import {
  CreateMasterRecipeInput,
  UpdateMasterRecipeInput,
  MasterRecipeResponse,
} from "./dto/master-recipe-input.dto";
import {
  WizardDataInput,
  WizardDataMapper,
} from "./dto/wizard-data-mapper.dto";
import { ItemService } from "../item/item.service";
import { PrismaService } from "../prisma/prisma.service";
import { EnzymeDosingService } from "./enzyme.dosing";

// Define missing types
@graphql.InputType()
export class CreateCookInput {
  @graphql.Field()
  scheduleOrderQueueId!: string;

  @graphql.Field()
  username!: string;

  @graphql.Field(() => GraphQLJSONObject, { nullable: true })
  mashingProtocolData?: any;
}

@graphql.ObjectType()
export class CreateCookResponse {
  @graphql.Field()
  success!: boolean;

  @graphql.Field()
  message!: string;

  @graphql.Field(() => GraphQLJSONObject, { nullable: true })
  data?: any;
}

@graphql.InputType()
export class GenerateRecipeInput {
  @graphql.Field()
  customerCode!: string;

  @graphql.Field()
  mashBill!: string;

  @graphql.Field()
  finalProof!: number;

  @graphql.Field()
  barrelInfo!: string;

  @graphql.Field()
  customerName!: string;

  @graphql.Field()
  orderQty!: number;

  @graphql.Field()
  totalGrainWeight!: number;

  @graphql.Field()
  bblsPerFerm!: number;

  @graphql.Field()
  username!: string;

  @graphql.Field()
  waterQty!: number;

  @graphql.Field()
  backsetQty!: number;

  @graphql.Field(() => [String])
  bblItemNumbers!: string[];

  @graphql.Field(() => GraphQLJSONObject)
  yeastItemNumbersQtys!: Record<string, number>;

  @graphql.Field(() => [GraphQLJSONObject])
  mashingProtocol!: any[];

  @graphql.Field(() => [GraphQLJSONObject])
  recipeParameters!: Array<{ name: string; setpointValue: number }>;

  @graphql.Field(() => GraphQLJSONObject)
  binAssignments!: Record<string, string>;
}

@graphql.ObjectType()
export class GenerateRecipeResponse {
  @graphql.Field()
  success!: boolean;

  @graphql.Field()
  message!: string;
}

@graphql.InputType()
export class GenerateRecipeBomInput {
  @graphql.Field()
  recipeString!: string;

  @graphql.Field()
  saccharificationEnzymeId!: string;

  @graphql.Field()
  liquifactionEnzymeId!: string;

  @graphql.Field()
  viscosityEnzymeId!: string;

  @graphql.Field()
  yeastItemId!: string;

  @graphql.Field()
  yeastPoundsPerFermenter!: number;

  @graphql.Field()
  username!: string;

  @graphql.Field({ nullable: true })
  totalGrainWeight?: number;
}

@graphql.ObjectType()
export class RecipeBomItemResponse {
  @graphql.Field()
  itemId!: string;

  @graphql.Field()
  itemNumber!: string;

  @graphql.Field()
  itemName!: string;

  @graphql.Field()
  quantity!: number;

  @graphql.Field()
  operation!: string;
}

@graphql.ObjectType()
export class GenerateRecipeBomResponse {
  @graphql.Field()
  id!: string;

  @graphql.Field()
  revision!: string;

  @graphql.Field(() => [RecipeBomItemResponse])
  items!: RecipeBomItemResponse[];
}

@graphql.InputType()
class CalculateNormalizedEnzymeDosingInput {
  @graphql.Field(() => String, { nullable: true })
  recipeId?: string;

  @graphql.Field(() => String, { nullable: true })
  mashBill?: string;

  @graphql.Field(() => String)
  enzymeItemId!: string;
}

@graphql.ObjectType()
class NormalizedEnzymeDosingResult {
  @graphql.Field(() => String, { nullable: true })
  recipeId?: string;

  @graphql.Field(() => String, { nullable: true })
  recipeName?: string;

  @graphql.Field(() => String)
  enzymeItemId!: string;

  @graphql.Field(() => String)
  enzymeName!: string;

  @graphql.Field(() => String)
  enzymeCategory!: string;

  @graphql.Field(() => graphql.Float)
  normalizedDoseRatio!: number;

  @graphql.Field(() => String)
  instructions!: string;

  @graphql.Field(() => String)
  mashBill!: string;

  @graphql.Field(() => String)
  calculatedAt!: string;
}

@graphql.InputType()
class RecipeEnzymeDosingInput {
  @graphql.Field(() => String, { nullable: true })
  recipeId?: string;

  @graphql.Field(() => String, { nullable: true })
  mashBill?: string;

  @graphql.Field(() => [String])
  enzymeItemIds!: string[];
}

@graphql.ObjectType()
class EnzymeDosingResultItem {
  @graphql.Field(() => String)
  enzymeItemId!: string;

  @graphql.Field(() => String)
  enzymeName!: string;

  @graphql.Field(() => String)
  enzymeCategory!: string;

  @graphql.Field(() => graphql.Float)
  normalizedDoseRatio!: number;

  @graphql.Field(() => String)
  instructions!: string;
}

@graphql.ObjectType()
class RecipeEnzymeDosingResult {
  @graphql.Field(() => String, { nullable: true })
  recipeId?: string;

  @graphql.Field(() => String, { nullable: true })
  recipeName?: string;

  @graphql.Field(() => String)
  mashBill!: string;

  @graphql.Field(() => [EnzymeDosingResultItem])
  enzymeResults!: EnzymeDosingResultItem[];

  @graphql.Field(() => String)
  calculatedAt!: string;
}

/**
 * Recipe resolver with GraphQL endpoints.
 *
 * The base resolver has been extended with additional mutations for managing RecipeParameter relationships:
 * - connectRecipeParameters: Connect RecipeParameter entities to a Recipe (matches POST /:id/parameters endpoint)
 * - updateRecipeParameters: Set RecipeParameter entities for a Recipe (matches PATCH /:id/parameters endpoint)
 * - disconnectRecipeParameters: Disconnect RecipeParameter entities from a Recipe (matches DELETE /:id/parameters endpoint)
 *
 * Additional mutations for frontend wizard integration:
 * - createMasterRecipeFromWizard: Create a master recipe from frontend wizard data
 * - updateMasterRecipeFromWizard: Update a master recipe from frontend wizard data
 */
@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => Recipe)
export class RecipeResolver extends RecipeResolverBase {
  constructor(
    protected readonly service: RecipeService,
    protected readonly cookCreationService: RecipeCookCreationService,
    protected readonly recipeGenerator: RecipeGenerator,
    protected readonly itemService: ItemService,
    protected readonly prisma: PrismaService,
    protected readonly enzymeDosingService: EnzymeDosingService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }

  /**
   * Field resolver to get the count of all recipes in the same family.
   * A family is determined by the baseRecipeName (recipe name without -R## suffix).
   * This allows the frontend to display the total revision count even when
   * only one revision is loaded in the current page.
   */
  @graphql.ResolveField(() => graphql.Int, {
    name: "familyRevisionCount",
    description: "Total number of revisions in this recipe family",
    nullable: true,
  })
  async resolveFamilyRevisionCount(
    @graphql.Parent() recipe: Recipe
  ): Promise<number> {
    try {
      // Extract baseRecipeName from the recipe name (remove -R## suffix)
      const recipeName = recipe.Recipe;
      if (!recipeName) return 1;

      // Use regex to extract base name (remove -v## or legacy -R## suffix)
      const baseRecipeName = recipeName.replace(/-[Rv]\d+$/, "");

      // Count all recipes with matching baseRecipeName pattern
      // Matches both new format (e.g., "BHK-95R-5M-v01") and legacy (e.g., "BHK-95R-5M-R01")
      const count = await this.prisma.recipe.count({
        where: {
          OR: [
            // Match exact baseRecipeName
            { baseRecipeName: baseRecipeName },
            // Also match by recipe name pattern for recipes without baseRecipeName set
            {
              Recipe: {
                startsWith: baseRecipeName + "-v",
              },
            },
            // Also match legacy R-prefix revisions
            {
              Recipe: {
                startsWith: baseRecipeName + "-R",
              },
            },
          ],
        },
      });

      return count || 1;
    } catch (error) {
      console.error("Error resolving familyRevisionCount:", error);
      return 1;
    }
  }

  @graphql.Mutation(() => NormalizedEnzymeDosingResult)
  @UseRoles({
    resource: "Recipe",
    action: "read",
    possession: "any",
  })
  async calculateNormalizedEnzymeDosing(
    @graphql.Args("data") data: CalculateNormalizedEnzymeDosingInput
  ): Promise<NormalizedEnzymeDosingResult> {
    return this.service.calculateNormalizedEnzymeDosing(
      data.recipeId,
      data.mashBill,
      data.enzymeItemId
    );
  }

  @graphql.Mutation(() => RecipeEnzymeDosingResult)
  @UseRoles({
    resource: "Recipe",
    action: "read",
    possession: "any",
  })
  async calculateRecipeEnzymeDosing(
    @graphql.Args("data") data: RecipeEnzymeDosingInput
  ): Promise<RecipeEnzymeDosingResult> {
    return this.service.calculateRecipeEnzymeDosing(
      data.recipeId,
      data.mashBill,
      data.enzymeItemIds
    );
  }

  @graphql.Query(() => [Recipe])
  @UseRoles({
    resource: "Recipe",
    action: "read",
    possession: "any",
  })
  async getActiveRecipes(): Promise<Recipe[]> {
    try {
      const activeRecipes = await this.service.getActiveRecipes();
      return activeRecipes;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "An error occurred while retrieving active recipes";

      throw new common.HttpException(
        errorMessage,
        common.HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @graphql.Mutation(() => MasterRecipeResponse)
  @UseRoles({
    resource: "Recipe",
    action: "create",
    possession: "any",
  })
  async createMasterRecipe(
    @graphql.Args("input") input: CreateMasterRecipeInput
  ): Promise<MasterRecipeResponse> {
    try {
      const result = await this.service.createMasterRecipe(input);
      return result;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "An error occurred while creating the master recipe";

      throw new common.HttpException(
        errorMessage,
        common.HttpStatus.BAD_REQUEST
      );
    }
  }

  @graphql.Mutation(() => MasterRecipeResponse)
  @UseRoles({
    resource: "Recipe",
    action: "update",
    possession: "any",
  })
  async updateMasterRecipe(
    @graphql.Args("id") id: string,
    @graphql.Args("input") input: UpdateMasterRecipeInput
  ): Promise<MasterRecipeResponse> {
    try {
      const result = await this.service.updateMasterRecipe(id, input);
      return result;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "An error occurred while updating the master recipe";

      throw new common.HttpException(
        errorMessage,
        common.HttpStatus.BAD_REQUEST
      );
    }
  }

  @graphql.Mutation(() => MasterRecipeResponse)
  @UseRoles({
    resource: "Recipe",
    action: "create",
    possession: "any",
  })
  async createMasterRecipeFromWizard(
    @graphql.Args("wizardData") wizardData: WizardDataInput
  ): Promise<MasterRecipeResponse> {
    try {
      // Validate mash bill percentages
      if (!WizardDataMapper.validateMashBill(wizardData.details.mashBill)) {
        throw new Error("Mash bill percentages must add up to 100%");
      }

      // Generate recipe name if not provided or invalid
      if (
        !wizardData.details.Recipe ||
        wizardData.details.Recipe.trim() === ""
      ) {
        wizardData.details.Recipe = WizardDataMapper.generateRecipeName(
          wizardData.details.customerCode,
          wizardData.details.mashBill,
          wizardData.revision
        );
      }

      // Create item lookup map for ingredient mapping
      const itemCodes = wizardData.bom.ingredients.map((ing) => ing.itemCode);
      const items = await this.itemService.items({
        where: {
          itemNumber: { in: itemCodes },
        },
        select: {
          id: true,
          itemNumber: true,
          itemName: true,
        },
      });

      const itemLookupMap = new Map(
        items.map(
          (item: {
            id: string;
            itemNumber: string;
            itemName: string | null;
          }) => [
            item.itemNumber,
            { id: item.id, name: item.itemName || item.itemNumber },
          ]
        )
      );

      // Convert wizard data to backend DTO
      const createInput = WizardDataMapper.toCreateMasterRecipeInput(
        wizardData,
        itemLookupMap
      );

      // Create the master recipe
      const result = await this.service.createMasterRecipe(createInput);

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to create master recipe from wizard data: ${errorMessage}`
      );
    }
  }

  @graphql.Mutation(() => MasterRecipeResponse)
  @UseRoles({
    resource: "Recipe",
    action: "update",
    possession: "any",
  })
  async updateMasterRecipeFromWizard(
    @graphql.Args("id") id: string,
    @graphql.Args("wizardData") wizardData: WizardDataInput
  ): Promise<MasterRecipeResponse> {
    try {
      // Validate mash bill percentages if provided
      if (
        wizardData.details?.mashBill &&
        !WizardDataMapper.validateMashBill(wizardData.details.mashBill)
      ) {
        throw new Error("Mash bill percentages must add up to 100%");
      }

      // Create item lookup map for ingredient mapping if ingredients are provided
      let itemLookupMap: Map<string, { id: string; name: string }> | undefined;
      if (wizardData.bom?.ingredients?.length > 0) {
        const itemCodes = wizardData.bom.ingredients.map((ing) => ing.itemCode);
        const items = await this.itemService.items({
          where: {
            itemNumber: { in: itemCodes },
          },
          select: {
            id: true,
            itemNumber: true,
            itemName: true,
          },
        });

        itemLookupMap = new Map(
          items.map(
            (item: {
              id: string;
              itemNumber: string;
              itemName: string | null;
            }) => [
              item.itemNumber,
              { id: item.id, name: item.itemName || item.itemNumber },
            ]
          )
        );
      }

      // Convert wizard data to backend DTO
      const createInput = WizardDataMapper.toCreateMasterRecipeInput(
        wizardData,
        itemLookupMap
      );

      // Convert to update input (all fields optional except updatedBy)
      const updateInput: UpdateMasterRecipeInput = {
        Recipe: createInput.Recipe,
        active: createInput.active,
        whiskeyType: createInput.whiskeyType,
        customerCode: createInput.customerCode,
        cooksPerFerm: createInput.cooksPerFerm,
        updatedBy: createInput.createdBy, // Use createdBy as updatedBy for wizard updates
        mashBill: createInput.mashBill,
        ingredients: createInput.ingredients,
        parameters: createInput.parameters,
        mashingSteps: createInput.mashingSteps,
      };

      // Update the master recipe
      const result = await this.service.updateMasterRecipe(id, updateInput);

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to update master recipe from wizard data: ${errorMessage}`
      );
    }
  }

  @graphql.Query(() => GraphQLJSONObject)
  @UseRoles({
    resource: "Recipe",
    action: "read",
    possession: "any",
  })
  async getMasterRecipeAsWizardData(
    @graphql.Args("id") id: string
  ): Promise<any> {
    try {
      // Get the recipe with all related data
      const recipe = await this.service.recipe({
        where: { id },
        include: {
          recipeBoms: {
            include: {
              recipeBomITem: {
                include: {
                  item: true,
                  displayUnits: true,
                },
              },
            },
          },
          customer: true,
        },
      });

      if (!recipe) {
        throw new Error(`Recipe with ID ${id} not found`);
      }

      // Get parameters separately
      const parameters = await this.service.findParameters(id, {});

      // Get mashing protocol separately if it exists
      let mashingSteps: any[] = [];
      if (recipe.mashingProtocolId) {
        const mashingProtocol = await this.service.getMashingProtocol(id);
        if (mashingProtocol) {
          // Get the steps for this mashing protocol
          const protocolWithSteps =
            await this.prisma.mashingProtocol.findUnique({
              where: { id: mashingProtocol.id },
              include: { steps: true },
            });
          mashingSteps = protocolWithSteps?.steps || [];
        }
      }

      // Transform the recipe data to include the structure expected by the mapper
      const transformedRecipe = {
        id: recipe.id,
        Recipe: recipe.Recipe,
        whiskeyType: recipe.whiskeyType,
        customerCode: recipe.customerCode,
        cooksPerFerm: recipe.cooksPerFerm,
        createdBy: recipe.createdBy,
        revision: recipe.revision,
        active: recipe.active,
        mashBill: (recipe as any).mashBill || {
          corn: 0,
          rye: 0,
          wheat: 0,
          maltedBarley: 0,
        },
        ingredients:
          (recipe as any).recipeBoms?.[0]?.recipeBomITem?.map(
            (bomItem: any) => ({
              id: bomItem.item.id,
              itemCode: bomItem.item.itemNumber,
              name: bomItem.item.itemName || bomItem.item.itemNumber,
              quantity: bomItem.quantity,
              unit: bomItem.displayUnits?.name || "lb",
              category: bomItem.operation || "grains",
              notes: bomItem.notes,
            })
          ) || [],
        parameters: parameters || [],
        mashingSteps: mashingSteps,
      };

      // Convert to wizard data format
      const wizardData = WizardDataMapper.fromMasterRecipeResponse(
        transformedRecipe,
        true
      );

      return wizardData;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get recipe as wizard data: ${errorMessage}`);
    }
  }

  @graphql.Query(() => [String])
  @UseRoles({
    resource: "Recipe",
    action: "read",
    possession: "any",
  })
  async getAvailableWhiskeyTypes(): Promise<string[]> {
    return [
      "FourGrainBourbon",
      "RyeWhiskey",
      "WheatWhiskey",
      "CornWhiskey",
      "MaltWhiskey",
    ];
  }

  @graphql.Query(() => [GraphQLJSONObject])
  @UseRoles({
    resource: "Recipe",
    action: "read",
    possession: "any",
  })
  async getRecipeRevisionHistory(
    @graphql.Args("recipeId") recipeId: string
  ): Promise<any[]> {
    try {
      const revisions = await this.service.getRecipeRevisionHistory(recipeId);
      return revisions;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "An error occurred while retrieving recipe revision history";

      throw new common.HttpException(
        errorMessage,
        common.HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @graphql.Query(() => GraphQLJSONObject, { nullable: true })
  @UseRoles({
    resource: "Recipe",
    action: "read",
    possession: "any",
  })
  async getLatestRecipeRevision(
    @graphql.Args("baseRecipeName") baseRecipeName: string
  ): Promise<any> {
    try {
      const latestRevision = await this.service.getLatestRecipeRevision(
        baseRecipeName
      );
      return latestRevision;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "An error occurred while retrieving latest recipe revision";

      throw new common.HttpException(
        errorMessage,
        common.HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @graphql.Query(() => [GraphQLJSONObject])
  @UseRoles({
    resource: "Recipe",
    action: "read",
    possession: "any",
  })
  async getAvailableIngredients(
    @graphql.Args("category", { nullable: true }) category?: string
  ): Promise<any[]> {
    try {
      const whereClause: any = {
        active: true,
      };

      // Filter by category if provided
      if (category) {
        // This is a simplified approach - you might want to add a proper category field to items
        whereClause.itemName = {
          contains: category,
          mode: "insensitive",
        };
      }

      const items = await this.itemService.items({
        where: whereClause,
        select: {
          id: true,
          itemNumber: true,
          itemName: true,
          units: {
            select: {
              name: true,
            },
          },
        },
        take: 100, // Limit results
      });

      return items.map((item: any) => ({
        id: item.id,
        itemCode: item.itemNumber,
        name: item.itemName || item.itemNumber,
        unit: item.units?.name || "lb",
        category: this.inferCategoryFromItemName(
          item.itemName || item.itemNumber
        ),
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get available ingredients: ${errorMessage}`);
    }
  }

  private inferCategoryFromItemName(itemName: string): string {
    const name = itemName.toLowerCase();

    if (
      name.includes("corn") ||
      name.includes("rye") ||
      name.includes("wheat") ||
      name.includes("barley") ||
      name.includes("malt")
    ) {
      return "grains";
    } else if (name.includes("water")) {
      return "water";
    } else if (name.includes("yeast")) {
      return "yeast";
    } else if (name.includes("enzyme")) {
      return "enzymes";
    } else {
      return "other";
    }
  }
}
