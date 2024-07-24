import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RecipeBomItemServiceBase } from "./base/recipeBomItem.service.base";

@Injectable()
export class RecipeBomItemService extends RecipeBomItemServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
