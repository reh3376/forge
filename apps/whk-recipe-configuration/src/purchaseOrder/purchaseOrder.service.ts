import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PurchaseOrderServiceBase } from "./base/purchaseOrder.service.base";
import { Prisma, PurchaseOrder } from "@prisma/client";

@Injectable()
export class PurchaseOrderService extends PurchaseOrderServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async getPurchaseOrdersWithLineItemsByType(purchaseOrderType: string) {
    // NOTE - "ItemName" is incorrect in the LineItem JSON from PO. It's really the ItemNumber, hence the join
    const query = Prisma.sql`
    SELECT DISTINCT
      po.*,
--       jsonb_build_object(
--               'rate', "li"."rate",
--               'itemName', "li"."itemName",
--               'quantity', "li"."quantity",
--               'description', "li"."description"
--       ),
      li.quantity as "lineItemQuantity",
      li."itemName" as "lineItemItemName",
--       li.rate as "lineItemRate",
--      li.description as "lineItemDescription",
      i.id as itemId,
      i."itemNumber" as itemNumber,
      i."itemClass",
      i."itemGroup",
      v."name" as "vendorName"
    FROM "PurchaseOrder" po
    CROSS JOIN LATERAL jsonb_to_recordset(po."lineItems") "li" (
      "itemName" text,
      "rate" text,
      "quantity" text,
     "description" text
    )
    LEFT JOIN "Item" i on i."itemNumber" = li."itemName"
    LEFT JOIN "Vendor" v on i."vendorId" = v.id
     WHERE i."itemGroup" LIKE ${`%${purchaseOrderType}%`}
     AND po.complete = false
     AND po."receiptStatus" != 'PurchaseOrderComplete'
    ORDER BY li."itemName"`;
    // WHERE i."itemGroup" LIKE ${`%${purchaseOrderType}%`}`;

    const purchaseOrders = await this.prisma.$queryRaw<PurchaseOrder[]>(query);
    return purchaseOrders;
  }

  async getPurchaseOrderWithLineItemsById(id: string) {
    const query = `
      SELECT DISTINCT
      po.*,
--       jsonb_build_object(
--               'rate', "li"."rate",
--               'itemName', "li"."itemName",
--               'quantity', "li"."quantity",
--               'description', "li"."description"
--       ),
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
    LEFT JOIN "Vendor" v on i."vendorId" = v.id
      WHERE po.id = $1`;
    const purchaseOrder = await this.prisma.$queryRaw<PurchaseOrder>(
      Prisma.sql([query, id])
    );
    return purchaseOrder;
  }
}
