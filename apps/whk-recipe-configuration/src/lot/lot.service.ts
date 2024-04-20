import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LotServiceBase } from "./base/lot.service.base";

@Injectable()
export class LotService extends LotServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
