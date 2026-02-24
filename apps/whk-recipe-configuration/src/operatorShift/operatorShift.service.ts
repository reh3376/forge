import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { OperatorShiftServiceBase } from "./base/operatorShift.service.base";

@Injectable()
export class OperatorShiftService extends OperatorShiftServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
