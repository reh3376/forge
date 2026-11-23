import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { InstructionServiceBase } from "./base/instruction.service.base";

@Injectable()
export class InstructionService extends InstructionServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
