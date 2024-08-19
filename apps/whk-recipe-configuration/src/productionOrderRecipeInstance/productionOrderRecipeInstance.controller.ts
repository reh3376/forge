import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { ProductionOrderRecipeInstanceService } from "./productionOrderRecipeInstance.service";
import { ProductionOrderRecipeInstanceControllerBase } from "./base/productionOrderRecipeInstance.controller.base";

@swagger.ApiTags("productionOrderRecipeInstances")
@common.Controller("productionOrderRecipeInstances")
export class ProductionOrderRecipeInstanceController extends ProductionOrderRecipeInstanceControllerBase {
  constructor(
    protected readonly service: ProductionOrderRecipeInstanceService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
