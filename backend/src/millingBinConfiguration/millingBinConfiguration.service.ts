import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MillingBinConfigurationServiceBase } from "./base/millingBinConfiguration.service.base";

@Injectable()
export class MillingBinConfigurationService extends MillingBinConfigurationServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
