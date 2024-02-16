import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PhaseParameterServiceBase } from "./base/phaseParameter.service.base";

@Injectable()
export class PhaseParameterService extends PhaseParameterServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
