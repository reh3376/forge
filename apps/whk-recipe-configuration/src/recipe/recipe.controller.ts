import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { RecipeService } from "./recipe.service";
import { RecipeControllerBase } from "./base/recipe.controller.base";
import { RecipeCreationService } from "./recipe.creation.service";
import { RecipeCookCreationService } from "./recipe.cookcreation.service";
import { RecipeGenerator } from "./recipe.generation";
import { RabbitMQProducerService } from "src/rabbitmq/rabbitmq.producer.service";

@swagger.ApiTags("recipes")
@common.Controller("recipes")
export class RecipeController extends RecipeControllerBase {
  constructor(
    protected readonly service: RecipeService,
    protected readonly recipeCreationService: RecipeCreationService,
    protected readonly cookCreationService: RecipeCookCreationService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder,
    protected readonly rabbitMQProducer: RabbitMQProducerService
  ) {
    super(service, rolesBuilder);
  }

  @common.Post("/create")
  @swagger.ApiOperation({ summary: "Create a new recipe" })
  @swagger.ApiResponse({ status: 201, description: "Recipe created successfully" })
  @swagger.ApiResponse({ status: 400, description: "Bad Request" })
  @nestAccessControl.UseRoles({
    resource: "Recipe",
    action: "create",
    possession: "any",
  })
  async createNewRecipe(
    @common.Body() createRecipeDto: {
        fgItemNumber: string;
        bomName: string;
        bomRevision: string;
        recipeName: string;
        startCook: number;
        numberOfCooks: number;
        customerName: string;
        mashingSequenceData: any;
        runQuantity: number;
        salesOrderNumber?: string;
        productionOrderNumber?: string;
        scheduleOrderNumber?: string;
        numberOfCooksPerFerm?: number;
        username: string;
    }
  ) {
    try {
      const result = await this.recipeCreationService.createRecipe(createRecipeDto);
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred while creating the recipe';
      throw new common.HttpException(
        errorMessage,
        common.HttpStatus.BAD_REQUEST
      );
    }
  }


  @common.Post("/create-cook")
  @swagger.ApiOperation({ summary: "Create a new cook" })
  @swagger.ApiResponse({ status: 201, description: "Cook created successfully" })
  @swagger.ApiResponse({ status: 400, description: "Bad Request" })
  @nestAccessControl.UseRoles({
    resource: "Recipe",
    action: "create",
    possession: "any",
  })
  
  async createNewCook(
    @common.Body() createCookDto: {
      scheduleOrderQueueId: string;
      username: string;
      mashingProtocolData: any;
    }
  ) {
    try {
      if (createCookDto.mashingProtocolData) {
        const result = await this.cookCreationService.createCook(createCookDto.scheduleOrderQueueId, createCookDto.username, 3, createCookDto.mashingProtocolData);
        return result;
      } else {
        const result = await this.cookCreationService.createCook(createCookDto.scheduleOrderQueueId, createCookDto.username, 3);
        return result;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred while creating the cook';
      throw new common.HttpException(
        errorMessage,
        common.HttpStatus.BAD_REQUEST
      );
    }
  }

  @common.Get("/active-recipes")
  @swagger.ApiOperation({ summary: "Get recipes for active production orders" })
  @swagger.ApiResponse({ status: 200, description: "Active recipes retrieved successfully" })
  @swagger.ApiResponse({ status: 500, description: "Internal Server Error" })
  @nestAccessControl.UseRoles({
    resource: "Recipe",
    action: "read",
    possession: "any",
  })
  async getActiveRecipes() {
    try {
      const activeRecipes = await this.service.getActiveRecipes();
      return activeRecipes;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred while retrieving active recipes';
      throw new common.HttpException(
        errorMessage,
        common.HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @common.Post("/generate-recipe")
  @swagger.ApiOperation({ summary: "Generate a new recipe" })
  @swagger.ApiResponse({ status: 201, description: "Recipe generated successfully" })
  @swagger.ApiResponse({ status: 400, description: "Bad Request" })
  @nestAccessControl.UseRoles({
    resource: "Recipe",
    action: "create", 
    possession: "any",
  })
  async generateRecipe(
    @common.Body() generateRecipeDto: {
      customerCode?: string;
      mashBill?: string;
      finalProof?: number;
      barrelInfo?: string;
      customerName?: string;
      orderQty?: number;
      totalGrainWeight?: number;
      bblsPerFerm?: number;
      username: string;
      waterQty?: number;
      backsetQty?: number;
      bblItemNumbers?: string[];
      yeastItemNumbersQtys?: { [key: string]: number };
      mashingProtocol?: any[];
      recipeParameters?: { name: string; setpointValue: number }[];
    }
  ) {
    try {
      const recipeGenerator = new RecipeGenerator(
        this.rabbitMQProducer,
        generateRecipeDto.customerCode,
        generateRecipeDto.mashBill,
        generateRecipeDto.finalProof,
        generateRecipeDto.barrelInfo,
        generateRecipeDto.customerName,
        generateRecipeDto.orderQty,
        generateRecipeDto.totalGrainWeight,
        generateRecipeDto.bblsPerFerm,
        generateRecipeDto.username,
        generateRecipeDto.waterQty,
        generateRecipeDto.backsetQty,
        generateRecipeDto.bblItemNumbers,
        generateRecipeDto.yeastItemNumbersQtys,
        generateRecipeDto.mashingProtocol,
        generateRecipeDto.recipeParameters
      );

      await recipeGenerator.createRecipeData();
      return { message: "Recipe generated successfully" };
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred while generating the recipe';
      throw new common.HttpException(
        errorMessage,
        common.HttpStatus.BAD_REQUEST
      );
    }
  }
}
