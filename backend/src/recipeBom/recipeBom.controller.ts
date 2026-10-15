import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import { RecipeBomService } from "./recipeBom.service";
import { RecipeBomControllerBase } from "./base/recipeBom.controller.base";
import {
  ValidateRecipeBomDto,
  ValidationResultDto,
} from "./dto/validate-recipe-bom.dto";
import {
  GenerateRecipeBomDto,
  GenerateRecipeBomResultDto,
} from "./dto/generate-recipe-bom.dto";

@swagger.ApiTags("recipeBoms")
@common.Controller("recipeBoms")
export class RecipeBomController extends RecipeBomControllerBase {
  constructor(
    protected readonly service: RecipeBomService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }

  /**
   * Calculate enzyme dosing for a recipe BOM
   * @param id The ID of the recipe BOM
   * @param totalGrainLbs The total grain weight in pounds
   * @returns Calculated enzyme dosages
   */
  @common.Get("/:id/calculateEnzymeDosing")
  @swagger.ApiOperation({ summary: "Calculate enzyme dosing for a recipe BOM" })
  @swagger.ApiParam({
    name: "id",
    type: "string",
    description: "Recipe BOM ID",
  })
  @swagger.ApiQuery({
    name: "totalGrainLbs",
    type: "number",
    description: "Total grain weight in pounds",
    required: true,
  })
  @swagger.ApiResponse({
    status: 200,
    description: "Enzyme dosing calculated successfully",
    schema: {
      type: "object",
      properties: {
        recipeBomId: { type: "string" },
        totalGrainLbs: { type: "number" },
        mashBill: { type: "string" },
        enzymeCalculations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              itemId: { type: "string" },
              name: { type: "string" },
              doseLbs: { type: "number" },
              instructions: { type: "string" },
              originalQuantity: { type: "number" },
              originalUnit: { type: "string" },
            },
          },
        },
      },
    },
  })
  @common.UseGuards(ACGuard)
  @UseRoles({
    resource: "recipeBom",
    action: "read",
    possession: "any",
  })
  async calculateEnzymeDosing(
    @common.Param("id") id: string,
    @common.Query("totalGrainLbs") totalGrainLbs: number
  ) {
    return this.service.calculateEnzymeDosing(id, totalGrainLbs);
  }

  /**
   * Validate a recipe BOM for completeness and correctness
   * @param data Data containing recipe name and BOM items
   * @returns Validation result with issues if any
   */
  @common.Post("/validate")
  @swagger.ApiOperation({ summary: "Validate a recipe BOM" })
  @swagger.ApiBody({ type: ValidateRecipeBomDto })
  @swagger.ApiResponse({
    status: 200,
    description: "Validation result",
    type: ValidationResultDto,
  })
  @common.UseGuards(ACGuard)
  @UseRoles({
    resource: "recipeBom",
    action: "read",
    possession: "any",
  })
  async validateRecipeBom(
    @common.Body() data: ValidateRecipeBomDto
  ): Promise<ValidationResultDto> {
    return this.service.validateRecipeBom(data);
  }

  /**
   * Generate recipe BOM item suggestions based on recipe name
   * @param data Data containing recipe name with mash bill
   * @returns Suggested BOM items for grains, water, and backset
   */
  @common.Post("/generate")
  @swagger.ApiOperation({ summary: "Generate recipe BOM suggestions" })
  @swagger.ApiBody({ type: GenerateRecipeBomDto })
  @swagger.ApiResponse({
    status: 200,
    description: "Generated recipe BOM suggestions",
    type: GenerateRecipeBomResultDto,
  })
  @common.UseGuards(ACGuard)
  @UseRoles({
    resource: "recipeBom",
    action: "read",
    possession: "any",
  })
  async generateRecipeBomSuggestions(
    @common.Body() data: GenerateRecipeBomDto
  ): Promise<GenerateRecipeBomResultDto> {
    return this.service.generateRecipeBomSuggestions(data);
  }
}
