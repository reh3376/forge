import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UnsConfigurationServiceBase } from "./base/unsConfiguration.service.base";

@Injectable()
export class UnsConfigurationService extends UnsConfigurationServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }
}
