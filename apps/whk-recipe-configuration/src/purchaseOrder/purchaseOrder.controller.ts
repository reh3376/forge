import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { PurchaseOrderService } from "./purchaseOrder.service";
import { PurchaseOrderControllerBase } from "./base/purchaseOrder.controller.base";

@swagger.ApiTags("purchaseOrders")
@common.Controller("purchaseOrders")
export class PurchaseOrderController extends PurchaseOrderControllerBase {
  constructor(
    protected readonly service: PurchaseOrderService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
