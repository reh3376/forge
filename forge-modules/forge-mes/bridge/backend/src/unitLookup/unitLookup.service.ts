import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UnitLookupServiceBase } from "./base/unitLookup.service.base";

@Injectable()
export class UnitLookupService extends UnitLookupServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
