import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import { ProductionOrderRecipeInstanceService } from "./productionOrderRecipeInstance.service";
import { ProductionOrderRecipeInstanceControllerBase } from "./base/productionOrderRecipeInstance.controller.base";

@swagger.ApiTags("productionOrderRecipeInstances")
@common.Controller("productionOrderRecipeInstances")
export class ProductionOrderRecipeInstanceController extends ProductionOrderRecipeInstanceControllerBase {
  constructor(
    protected readonly service: ProductionOrderRecipeInstanceService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
