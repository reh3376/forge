import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { OperationServiceBase } from "./base/operation.service.base";

@Injectable()
export class OperationService extends OperationServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
