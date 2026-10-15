import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import { UseRoles } from "nest-access-control";
import { ChangeoverService } from "./changeover.service";
import {
  ChangeoverArea,
  VALID_AREAS,
  AreaChangeoverState,
  TransitionResult,
} from "./changeover.types";
import {
  ChangeoverRequestDto,
  CipCompleteDto,
  RecipeLoadedDto,
  StartProductionDto,
  ResetErrorDto,
} from "./dto/changeover.dto";

@swagger.ApiTags("changeover")
@common.Controller("changeover")
export class ChangeoverController {
  constructor(private readonly changeoverService: ChangeoverService) {}

  @common.Get(":area/state")
  @swagger.ApiOperation({ summary: "Get current changeover state for an area" })
  @swagger.ApiOkResponse({ description: "Current area changeover state" })
  @swagger.ApiBadRequestResponse({ description: "Invalid area" })
  @UseRoles({
    resource: "ScheduleOrderQueue",
    action: "read",
    possession: "any",
  })
  getAreaState(@common.Param("area") area: string): AreaChangeoverState {
    this.validateArea(area);
    return this.changeoverService.getAreaState(area as ChangeoverArea);
  }

  @common.Post(":area/request")
  @swagger.ApiOperation({ summary: "Request changeover for an area" })
  @swagger.ApiCreatedResponse({ description: "Changeover requested" })
  @swagger.ApiBadRequestResponse({ description: "Invalid state or area" })
  @swagger.ApiBody({ type: ChangeoverRequestDto })
  @UseRoles({
    resource: "ScheduleOrderQueue",
    action: "update",
    possession: "any",
  })
  async requestChangeover(
    @common.Param("area") area: string,
    @common.Body() dto: ChangeoverRequestDto
  ): Promise<TransitionResult> {
    this.validateArea(area);
    return this.changeoverService.requestChangeover(
      area as ChangeoverArea,
      dto
    );
  }

  @common.Post(":area/cip-complete")
  @swagger.ApiOperation({ summary: "Report CIP completion for an area" })
  @swagger.ApiCreatedResponse({ description: "CIP complete recorded" })
  @swagger.ApiBadRequestResponse({ description: "Invalid state or area" })
  @swagger.ApiBody({ type: CipCompleteDto })
  @UseRoles({
    resource: "ScheduleOrderQueue",
    action: "update",
    possession: "any",
  })
  async cipComplete(
    @common.Param("area") area: string,
    @common.Body() dto: CipCompleteDto
  ): Promise<TransitionResult> {
    this.validateArea(area);
    return this.changeoverService.cipComplete(area as ChangeoverArea, dto);
  }

  @common.Post(":area/recipe-loaded")
  @swagger.ApiOperation({ summary: "Confirm recipe loaded on equipment" })
  @swagger.ApiCreatedResponse({ description: "Recipe load confirmed" })
  @swagger.ApiBadRequestResponse({ description: "Invalid state or area" })
  @swagger.ApiConflictResponse({ description: "Version mismatch" })
  @swagger.ApiBody({ type: RecipeLoadedDto })
  @UseRoles({
    resource: "ScheduleOrderQueue",
    action: "update",
    possession: "any",
  })
  async recipeLoaded(
    @common.Param("area") area: string,
    @common.Body() dto: RecipeLoadedDto
  ): Promise<TransitionResult> {
    this.validateArea(area);
    return this.changeoverService.recipeLoaded(area as ChangeoverArea, dto);
  }

  @common.Post(":area/start-production")
  @swagger.ApiOperation({ summary: "Start production after changeover" })
  @swagger.ApiCreatedResponse({ description: "Production started" })
  @swagger.ApiBadRequestResponse({ description: "Invalid state or area" })
  @swagger.ApiBody({ type: StartProductionDto })
  @UseRoles({
    resource: "ScheduleOrderQueue",
    action: "update",
    possession: "any",
  })
  async startProduction(
    @common.Param("area") area: string,
    @common.Body() dto: StartProductionDto
  ): Promise<TransitionResult> {
    this.validateArea(area);
    return this.changeoverService.startProduction(area as ChangeoverArea, dto);
  }

  @common.Get(":area/next-recipe")
  @swagger.ApiOperation({ summary: "Get next recipe for an area" })
  @swagger.ApiOkResponse({ description: "Next recipe data" })
  @swagger.ApiBadRequestResponse({ description: "Invalid area" })
  @UseRoles({
    resource: "ScheduleOrderQueue",
    action: "read",
    possession: "any",
  })
  async getNextRecipe(@common.Param("area") area: string): Promise<any> {
    this.validateArea(area);
    return this.changeoverService.getNextRecipe(area as ChangeoverArea);
  }

  @common.Post(":area/reset")
  @swagger.ApiOperation({ summary: "Reset error state for an area" })
  @swagger.ApiCreatedResponse({ description: "Error state reset" })
  @swagger.ApiBadRequestResponse({ description: "Invalid state or area" })
  @swagger.ApiBody({ type: ResetErrorDto })
  @UseRoles({
    resource: "ScheduleOrderQueue",
    action: "update",
    possession: "any",
  })
  async resetError(
    @common.Param("area") area: string,
    @common.Body() dto: ResetErrorDto
  ): Promise<TransitionResult> {
    this.validateArea(area);
    return this.changeoverService.resetError(area as ChangeoverArea, dto);
  }

  private validateArea(area: string): void {
    if (!VALID_AREAS.includes(area as ChangeoverArea)) {
      throw new common.BadRequestException(
        `Invalid area '${area}'. Valid areas: ${VALID_AREAS.join(", ")}`
      );
    }
  }
}
