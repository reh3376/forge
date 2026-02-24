import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { BatchParameterValueServiceBase } from "./base/batchParameterValue.service.base";

@Injectable()
export class BatchParameterValueService extends BatchParameterValueServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
