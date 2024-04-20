import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { SalesOrderService } from "./salesOrder.service";
import { SalesOrderControllerBase } from "./base/salesOrder.controller.base";

@swagger.ApiTags("salesOrders")
@common.Controller("salesOrders")
export class SalesOrderController extends SalesOrderControllerBase {
  constructor(
    protected readonly service: SalesOrderService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
