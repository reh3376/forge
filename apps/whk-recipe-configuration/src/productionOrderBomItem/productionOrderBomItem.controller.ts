import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import { ACGuard, InjectRolesBuilder, RolesBuilder, UseRoles } from "nest-access-control";
import { ProductionOrderBomItemService } from "./productionOrderBomItem.service";
import { ProductionOrderBomItemControllerBase } from "./base/productionOrderBomItem.controller.base";

@swagger.ApiTags("productionOrderBomItems")
@common.Controller("productionOrderBomItems")
export class ProductionOrderBomItemController extends ProductionOrderBomItemControllerBase {
  constructor(
    protected readonly service: ProductionOrderBomItemService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
