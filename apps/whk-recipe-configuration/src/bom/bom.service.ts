import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { BomServiceBase } from "./base/bom.service.base";

@Injectable()
export class BomService extends BomServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
