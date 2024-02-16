import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UnitProcedureServiceBase } from "./base/unitProcedure.service.base";

@Injectable()
export class UnitProcedureService extends UnitProcedureServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
