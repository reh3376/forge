import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { ProductionOrderUnitProcedureService } from "./productionOrderUnitProcedure.service";
import { ProductionOrderUnitProcedureControllerBase } from "./base/productionOrderUnitProcedure.controller.base";

@swagger.ApiTags("productionOrderUnitProcedures")
@common.Controller("productionOrderUnitProcedures")
export class ProductionOrderUnitProcedureController extends ProductionOrderUnitProcedureControllerBase {
  constructor(
    protected readonly service: ProductionOrderUnitProcedureService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
