import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MashingProtocolStepServiceBase } from "./base/mashingProtocolStep.service.base";

@Injectable()
export class MashingProtocolStepService extends MashingProtocolStepServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
