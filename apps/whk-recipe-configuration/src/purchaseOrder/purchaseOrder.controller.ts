import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import { ACGuard, InjectRolesBuilder, RolesBuilder, UseRoles } from "nest-access-control";
import * as errors from "../errors";

import { PurchaseOrderService } from "./purchaseOrder.service";
import { PurchaseOrderControllerBase } from "./base/purchaseOrder.controller.base";
import { AclFilterResponseInterceptor } from "../interceptors/aclFilterResponse.interceptor";
import { PurchaseOrder } from "./base/PurchaseOrder";
import { PurchaseOrderWhereUniqueInput } from "./base/PurchaseOrderWhereUniqueInput";

@swagger.ApiTags("purchaseOrders")
@common.Controller("purchaseOrders")
export class PurchaseOrderController extends PurchaseOrderControllerBase {
  constructor(
    protected readonly service: PurchaseOrderService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder,

  ) {
    super(service, rolesBuilder);
  }

  @common.UseInterceptors(AclFilterResponseInterceptor)
  @common.Get("/with-line-items")
  @swagger.ApiOkResponse({ type: [PurchaseOrder] })
  @UseRoles({
    resource: "PurchaseOrder",
    action: "read",
    possession: "any",
  })
  @swagger.ApiForbiddenResponse({
    type: errors.ForbiddenException,
  })
  async purchaseOrdersWithLineItems(
    @common.Query('purchaseOrderType') purchaseOrderType: string = ''
  ): Promise<PurchaseOrder[]> {
    const purchaseOrders = await this.service.getPurchaseOrdersWithLineItemsByType(purchaseOrderType);
    return purchaseOrders;
  }

  @common.UseInterceptors(AclFilterResponseInterceptor)
  @common.Get("/:id/with-line-items")
  @swagger.ApiOkResponse({ type: [PurchaseOrder] })
  @UseRoles({
    resource: "PurchaseOrder",
    action: "read",
    possession: "any",
  })
  @swagger.ApiForbiddenResponse({
    type: errors.ForbiddenException,
  })
  async purchaseOrderWithLineItems(
    @common.Param() params: PurchaseOrderWhereUniqueInput

  ): Promise<PurchaseOrder | null> {
    const purchaseOrder = await this.service.getPurchaseOrderWithLineItemsById(params.id);
    return purchaseOrder;
  }
}
