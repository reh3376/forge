import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UnitServiceBase } from "./base/unit.service.base";

@Injectable()
export class UnitService extends UnitServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
