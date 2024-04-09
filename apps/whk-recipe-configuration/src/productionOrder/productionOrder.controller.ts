import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { ProductionOrderService } from "./productionOrder.service";
import { ProductionOrderControllerBase } from "./base/productionOrder.controller.base";

@swagger.ApiTags("productionOrders")
@common.Controller("productionOrders")
export class ProductionOrderController extends ProductionOrderControllerBase {
  constructor(
    protected readonly service: ProductionOrderService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
