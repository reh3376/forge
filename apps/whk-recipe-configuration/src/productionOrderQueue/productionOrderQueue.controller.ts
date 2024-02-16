import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { ProductionOrderQueueService } from "./productionOrderQueue.service";
import { ProductionOrderQueueControllerBase } from "./base/productionOrderQueue.controller.base";

@swagger.ApiTags("productionOrderQueues")
@common.Controller("productionOrderQueues")
export class ProductionOrderQueueController extends ProductionOrderQueueControllerBase {
  constructor(
    protected readonly service: ProductionOrderQueueService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
