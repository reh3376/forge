import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ProcedureServiceBase } from "./base/procedure.service.base";

@Injectable()
export class ProcedureService extends ProcedureServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
