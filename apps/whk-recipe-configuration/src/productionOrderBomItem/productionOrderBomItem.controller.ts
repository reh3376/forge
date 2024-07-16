import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { ProductionOrderBomItemService } from "./productionOrderBomItem.service";
import { ProductionOrderBomItemControllerBase } from "./base/productionOrderBomItem.controller.base";

@swagger.ApiTags("productionOrderBomItems")
@common.Controller("productionOrderBomItems")
export class ProductionOrderBomItemController extends ProductionOrderBomItemControllerBase {
  constructor(
    protected readonly service: ProductionOrderBomItemService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
