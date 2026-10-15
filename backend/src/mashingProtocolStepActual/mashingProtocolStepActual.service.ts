import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MashingProtocolStepActualServiceBase } from "./base/mashingProtocolStepActual.service.base";

@Injectable()
export class MashingProtocolStepActualService extends MashingProtocolStepActualServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
