import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RecipeParameterServiceBase } from "./base/recipeParameter.service.base";

@Injectable()
export class RecipeParameterService extends RecipeParameterServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async createInstanceFromClassAndAssociateToRecipe(
    classDefId: string,
    recipeId: string,
    userId: string
  ) {
    // Get the class definition
    const classDef = await this.prisma.recipeParameter.findFirst({
      where: {
        id: classDefId,
        isClassDefinition: true,
      },
    });

    if (!classDef) {
      throw new NotFoundException(
        `RecipeParameter class definition with ID ${classDefId} not found`
      );
    }

    // Verify the recipe exists
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: recipeId },
    });

    if (!recipe) {
      throw new NotFoundException(`Recipe with ID ${recipeId} not found`);
    }

    // Create a new instance based on the class definition
    try {
      const newInstance = await this.prisma.recipeParameter.create({
        data: {
          className: classDef.className,
          recipeParamName: classDef.recipeParamName,
          description: classDef.description,
          recipeNumericalSetpoint: classDef.recipeNumericalSetpoint,
          recipeSetpointBooleanValue: classDef.recipeSetpointBooleanValue,
          recipeSetpointType: classDef.recipeSetpointType,
          recipeSetpointLowerLimit: classDef.recipeSetpointLowerLimit,
          recipeSetpointUpperLimit: classDef.recipeSetpointUpperLimit,
          active: true,
          isClassDefinition: false,
          createdBy: userId,
          operation: classDef.operationId
            ? {
                connect: { id: classDef.operationId },
              }
            : undefined,
          units: classDef.unitsId
            ? {
                connect: { id: classDef.unitsId },
              }
            : undefined,
          recipe: {
            connect: { id: recipeId },
          },
        },
        include: {
          operation: true,
          units: true,
          recipe: true,
        },
      });

      return newInstance;
    } catch (error) {
      console.error("Error creating recipe parameter instance:", error);
      throw error;
    }
  }
}
