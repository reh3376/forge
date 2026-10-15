import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { BomItemServiceBase } from "./base/bomItem.service.base";

@Injectable()
export class BomItemService extends BomItemServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
