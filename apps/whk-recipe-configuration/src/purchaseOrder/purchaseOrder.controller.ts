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
import { PurchaseOrderWhereUniqueInput } from "./base/PurchaseOrderWhereUniqueInput";

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
  @common.Get("/with-line-items")
  @swagger.ApiOkResponse({ type: [PurchaseOrder] })
  // @ApiNestedQuery(PurchaseOrderFindManyArgs)
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
    // use raw sql to get purchase orders with line items
    const query = `
    SELECT
    po.*,
    jsonb_build_object(
            'rate', "li"."rate",
            'itemName', "li"."itemName",
            'quantity', "li"."quantity",
            'description', "li"."description"
    ),
    li.quantity as "lineItemQuantity",
    li."itemName" as "lineItemItemName",
    li.rate as "lineItemRate",
    li.description as "lineItemDescription",
    i.id as itemId,
    i."itemNumber" as itemNumber,
    i."itemClass",
    v."name" as "vendorName"
FROM "PurchaseOrder" po
CROSS JOIN LATERAL jsonb_to_recordset(po."lineItems") "li" (
    "itemName" text,
    "rate" text,
    "quantity" text,
    "description" text
  )
LEFT JOIN "Item" i on i."itemNumber" = li."itemName"
LEFT JOIN "Vendor" v on i."vendorId" = v.id;
    `;
    const purchaseOrders = await this.prisma.$queryRaw<PurchaseOrder[]>(Prisma.sql([query]));

    return purchaseOrders;
  }

  @common.UseInterceptors(AclFilterResponseInterceptor)
  @common.Get("/:id/with-line-items")
  @swagger.ApiOkResponse({ type: [PurchaseOrder] })
  // @ApiNestedQuery(PurchaseOrderFindManyArgs)
  @nestAccessControl.UseRoles({
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
    // use raw sql to get purchase orders with line items
    const query = `
    SELECT
    po.*,
    jsonb_build_object(
            'rate', "li"."rate",
            'itemName', "li"."itemName",
            'quantity', "li"."quantity",
            'description', "li"."description"
    ),
    li.quantity as "lineItemQuantity",
    li."itemName" as "lineItemItemName",
    li.rate as "lineItemRate",
    li.description as "lineItemDescription",
    i.id as itemId,
    i."itemNumber" as itemNumber,
    i."itemClass",
    v."name" as "vendorName"
FROM "PurchaseOrder" po
CROSS JOIN LATERAL jsonb_to_recordset(po."lineItems") "li" (
    "itemName" text,
    "rate" text,
    "quantity" text,
    "description" text
  )
LEFT JOIN "Item" i on i."itemNumber" = li."itemName"
LEFT JOIN "Vendor" v on i."vendorId" = v.id;
WHERE po.id = '${params.id}'
    `;
    const purchaseOrders = await this.prisma.$queryRaw<PurchaseOrder>(Prisma.sql([query]));

    return purchaseOrders;
  }
}
