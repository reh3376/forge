import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RecipeBomActualServiceBase } from "./base/recipeBomActual.service.base";

@Injectable()
export class RecipeBomActualService extends RecipeBomActualServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
