import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import * as errors from "../errors";
import { Request } from "express";

import { PurchaseOrderService } from "./purchaseOrder.service";
import { PurchaseOrderControllerBase } from "./base/purchaseOrder.controller.base";
import { AclFilterResponseInterceptor } from "../interceptors/aclFilterResponse.interceptor";
import { PurchaseOrder } from "./base/PurchaseOrder";
import { PurchaseOrderFindManyArgs } from "./base/PurchaseOrderFindManyArgs";
import { ApiNestedQuery } from "../decorators/api-nested-query.decorator";
import { plainToClass } from "class-transformer";
import { Inject } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "@prisma/client";

@swagger.ApiTags("purchaseOrders")
@common.Controller("purchaseOrders")
export class PurchaseOrderController extends PurchaseOrderControllerBase {
  constructor(
    protected readonly service: PurchaseOrderService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder,
    @Inject(PrismaService)
    private readonly prisma: PrismaService
  ) {
    super(service, rolesBuilder);
  }

  @common.UseInterceptors(AclFilterResponseInterceptor)
  @common.Get("with-line-items")
  @swagger.ApiOkResponse({ type: [PurchaseOrder] })
  @ApiNestedQuery(PurchaseOrderFindManyArgs)
  @nestAccessControl.UseRoles({
    resource: "PurchaseOrder",
    action: "read",
    possession: "any",
  })
  @swagger.ApiForbiddenResponse({
    type: errors.ForbiddenException,
  })
  async purchaseOrdersWithLineItems(
    @common.Req() request: Request
  ): Promise<PurchaseOrder[]> {
    const args = plainToClass(PurchaseOrderFindManyArgs, request.query);

    // use raw sql to get purchase orders with line items
    const query = `
    SELECT
    po.*,
    jsonb_build_object(
            'rate', "li"."rate",
            'itemName', "li"."itemName",
            'quantity', "li"."quantity"
    ),
    li.quantity,
    li."itemName",
    li.rate,
    i.*
FROM "PurchaseOrder" po
CROSS JOIN LATERAL jsonb_to_recordset(po."lineItems") "li" ("itemName" text,
                                                                    "rate" text,
    "quantity" text)
LEFT JOIN "Item" i on i."itemNumber" = li."itemName";
    `;
    const purchaseOrders = await this.prisma.$queryRaw<PurchaseOrder[]>(Prisma.sql([query]));

    return purchaseOrders;
  }
}
