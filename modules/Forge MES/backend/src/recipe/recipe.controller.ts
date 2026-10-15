import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import { RecipeService } from "./recipe.service";
import { RecipeControllerBase } from "./base/recipe.controller.base";
import { RecipeCookCreationService } from "./recipe.cookcreation.service";
import { RecipeGenerator } from "./recipe.generation";
import { RabbitMQProducerService } from "../rabbitmq/rabbitmq.producer.service";
import { RecipeBomGenerationDto } from "./dto/recipe-bom-generation.dto";
import { RecipeBomResponseDto } from "./dto/recipe-bom-response.dto";
import { isRecordNotFoundError } from "../prisma.util";
import * as errors from "../errors";
import { EnzymeDosingService } from "./enzyme.dosing";
import { PrismaService } from "../prisma/prisma.service";
import { Recipe } from "./base/Recipe";

// DTOs for enzyme dosing endpoints
export class CalculateNormalizedEnzymeDosingDto {
  @swagger.ApiProperty({ required: false })
  recipeId?: string;

  @swagger.ApiProperty({ required: false, example: "70-21-00-09" })
  mashBill?: string;

  @swagger.ApiProperty()
  enzymeItemId!: string;
}

export class NormalizedEnzymeDosingResponseDto {
  @swagger.ApiProperty()
  recipeId!: string;

  @swagger.ApiProperty()
  recipeName!: string;

  @swagger.ApiProperty()
  enzymeItemId!: string;

  @swagger.ApiProperty()
  enzymeName!: string;

  @swagger.ApiProperty()
  enzymeCategory!: string;

  @swagger.ApiProperty()
  normalizedDoseRatio!: number;

  @swagger.ApiProperty()
  instructions!: string;

  @swagger.ApiProperty()
  mashBill!: string;

  @swagger.ApiProperty()
  calculatedAt!: string;
}

export class RecipeEnzymeDosingDto {
  @swagger.ApiProperty({ required: false })
  recipeId?: string;

  @swagger.ApiProperty({ required: false, example: "70-21-00-09" })
  mashBill?: string;

  @swagger.ApiProperty({ type: [String] })
  enzymeItemIds!: string[];
}

export class RecipeEnzymeDosingResponseDto {
  @swagger.ApiProperty()
  recipeId!: string;

  @swagger.ApiProperty()
  recipeName!: string;

  @swagger.ApiProperty()
  mashBill!: string;

  @swagger.ApiProperty({ type: [NormalizedEnzymeDosingResponseDto] })
  enzymeResults!: NormalizedEnzymeDosingResponseDto[];

  @swagger.ApiProperty()
  calculatedAt!: string;
}

@swagger.ApiTags("recipes")
@common.Controller("recipes")
export class RecipeController extends RecipeControllerBase {
  constructor(
    protected readonly service: RecipeService,
    protected readonly cookCreationService: RecipeCookCreationService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder,
    protected readonly recipeGenerator: RecipeGenerator
  ) {
    super(service, rolesBuilder);
  }

  @common.Post("/create-cook")
  @swagger.ApiOperation({ summary: "Create a new cook" })
  @swagger.ApiResponse({
    status: 201,
    description: "Cook created successfully",
  })
  @swagger.ApiResponse({ status: 400, description: "Bad Request" })
  @UseRoles({
    resource: "Recipe",
    action: "create",
    possession: "any",
  })
  async createNewCook(
    @common.Body()
    createCookDto: {
      scheduleOrderQueueId: string;
      username: string;
      mashingProtocolData: any;
    }
  ) {
    try {
      if (createCookDto.mashingProtocolData) {
        const result = await this.cookCreationService.createCook(
          createCookDto.scheduleOrderQueueId,
          createCookDto.username,
          3,
          createCookDto.mashingProtocolData
        );
        return result;
      } else {
        const result = await this.cookCreationService.createCook(
          createCookDto.scheduleOrderQueueId,
          createCookDto.username,
          3
        );
        return result;
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "An error occurred while creating the cook";
      throw new common.HttpException(
        errorMessage,
        common.HttpStatus.BAD_REQUEST
      );
    }
  }

  @common.Get("/active-recipes")
  @swagger.ApiOperation({ summary: "Get recipes for active production orders" })
  @swagger.ApiResponse({
    status: 200,
    description: "Active recipes retrieved successfully",
  })
  @swagger.ApiResponse({ status: 500, description: "Internal Server Error" })
  @UseRoles({
    resource: "Recipe",
    action: "read",
    possession: "any",
  })
  async getActiveRecipes() {
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

  @common.Post("/generate-recipe")
  @swagger.ApiOperation({ summary: "Generate a new recipe" })
  @swagger.ApiResponse({
    status: 201,
    description: "Recipe generated successfully",
  })
  @swagger.ApiResponse({ status: 400, description: "Bad Request" })
  @UseRoles({
    resource: "Recipe",
    action: "create",
    possession: "any",
  })
  async generateRecipe(
    @common.Body()
    generateRecipeDto: {
      customerCode: string;
      mashBill: string;
      finalProof: number;
      barrelInfo: string;
      customerName: string;
      orderQty: number;
      totalGrainWeight: number;
      bblsPerFerm: number;
      username: string;
      waterQty: number;
      backsetQty: number;
      bblItemNumbers: string[];
      yeastItemNumbersQtys: { [key: string]: number };
      mashingProtocol: any[];
      recipeParameters: { name: string; setpointValue: number }[];
      binAssignments: { [key: string]: string | string[] };
      specialtyItemNumber?: string;
    }
  ) {
    try {
      await this.recipeGenerator.createRecipeData(
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
        generateRecipeDto.bblItemNumbers || [],
        generateRecipeDto.yeastItemNumbersQtys,
        generateRecipeDto.mashingProtocol,
        generateRecipeDto.recipeParameters,
        generateRecipeDto.binAssignments,
        generateRecipeDto.specialtyItemNumber
      );
      return { message: "Recipe generated successfully" };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "An error occurred while generating the recipe";
      throw new common.HttpException(
        errorMessage,
        common.HttpStatus.BAD_REQUEST
      );
    }
  }

  @common.Post("/generate-recipe-bom")
  @swagger.ApiOperation({ summary: "Generate a recipe BOM" })
  @swagger.ApiResponse({
    status: 201,
    description: "Recipe BOM generated successfully",
    type: RecipeBomResponseDto,
  })
  @swagger.ApiResponse({ status: 400, description: "Bad Request" })
  @UseRoles({
    resource: "Recipe",
    action: "create",
    possession: "any",
  })
  async generateRecipeBom(
    @common.Body() generateRecipeBomDto: RecipeBomGenerationDto
  ): Promise<RecipeBomResponseDto> {
    try {
      const recipeBom = await this.service.generateRecipeBom(
        generateRecipeBomDto.recipeString,
        generateRecipeBomDto.saccharificationEnzymeId,
        generateRecipeBomDto.liquifactionEnzymeId,
        generateRecipeBomDto.viscosityEnzymeId,
        generateRecipeBomDto.yeastItemId,
        generateRecipeBomDto.yeastPoundsPerFermenter,
        generateRecipeBomDto.username,
        generateRecipeBomDto.totalGrainWeight
      );

      return RecipeBomResponseDto.fromEntity(recipeBom);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "An error occurred while generating the recipe BOM";
      throw new common.HttpException(
        errorMessage,
        common.HttpStatus.BAD_REQUEST
      );
    }
  }

  @common.Post("calculate-normalized-enzyme-dosing")
  @swagger.ApiOperation({
    summary: "Calculate normalized enzyme dosing for a single enzyme",
    description:
      "Calculate enzyme dosing as a unitless ratio (lbs enzyme / lbs grain) for a recipe or mash bill",
  })
  @swagger.ApiResponse({
    status: 200,
    description: "Normalized enzyme dosing calculated successfully",
  })
  @swagger.ApiResponse({ status: 400, description: "Bad request" })
  @swagger.ApiResponse({ status: 404, description: "Recipe not found" })
  async calculateNormalizedEnzymeDosing(
    @common.Body() data: CalculateNormalizedEnzymeDosingDto
  ) {
    return this.service.calculateNormalizedEnzymeDosing(
      data.recipeId,
      data.mashBill,
      data.enzymeItemId
    );
  }

  @common.Post("calculate-recipe-enzyme-dosing")
  @swagger.ApiOperation({
    summary: "Calculate normalized enzyme dosing for multiple enzymes",
    description:
      "Calculate enzyme dosing as unitless ratios (lbs enzyme / lbs grain) for multiple enzymes",
  })
  @swagger.ApiResponse({
    status: 200,
    description: "Recipe enzyme dosing calculated successfully",
  })
  @swagger.ApiResponse({ status: 400, description: "Bad request" })
  @swagger.ApiResponse({ status: 404, description: "Recipe not found" })
  async calculateRecipeEnzymeDosing(
    @common.Body() data: RecipeEnzymeDosingDto
  ) {
    return this.service.calculateRecipeEnzymeDosing(
      data.recipeId,
      data.mashBill,
      data.enzymeItemIds
    );
  }
}
