import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ItemReceiptServiceBase } from "./base/itemReceipt.service.base";

@Injectable()
export class ItemReceiptService extends ItemReceiptServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
