import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { BatchParameterConfigurationServiceBase } from "./base/batchParameterConfiguration.service.base";

@Injectable()
export class BatchParameterConfigurationService extends BatchParameterConfigurationServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
