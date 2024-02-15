import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { OperationStepServiceBase } from "./base/operationStep.service.base";

@Injectable()
export class OperationStepService extends OperationStepServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
