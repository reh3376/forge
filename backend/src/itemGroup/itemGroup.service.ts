import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ItemGroupServiceBase } from "./base/itemGroup.service.base";

@Injectable()
export class ItemGroupService extends ItemGroupServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
