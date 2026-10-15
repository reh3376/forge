import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import { BomService } from "./bom.service";
import { BomControllerBase } from "./base/bom.controller.base";
import { CalculateBomDto, CalculatedBomDto } from "./dto/calculate-bom.dto";

@swagger.ApiTags("boms")
@common.Controller("boms")
export class BomController extends BomControllerBase {
  constructor(
    protected readonly service: BomService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }

  /**
   * Calculate BOM quantities based on production parameters
   * @param calculateBomDto DTO containing calculation parameters
   * @returns Calculated BOM with actual quantities
   */
  @common.Post("calculate")
  @swagger.ApiOperation({
    summary: "Calculate BOM quantities based on production parameters",
    description:
      "Calculate actual BOM quantities from a recipe BOM based on specific production parameters",
  })
  @swagger.ApiResponse({
    status: 201,
    description: "Calculated BOM",
    type: CalculatedBomDto,
  })
  @swagger.ApiResponse({ status: 404, description: "Recipe or BOM not found" })
  async calculateBom(
    @common.Body() calculateBomDto: CalculateBomDto
  ): Promise<CalculatedBomDto> {
    return this.service.calculateBom(calculateBomDto);
  }
}
