import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RecipeBomServiceBase } from "./base/recipeBom.service.base";

@Injectable()
export class RecipeBomService extends RecipeBomServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
