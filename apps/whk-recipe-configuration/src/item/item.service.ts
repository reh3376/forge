import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ItemServiceBase } from "./base/item.service.base";

@Injectable()
export class ItemService extends ItemServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
