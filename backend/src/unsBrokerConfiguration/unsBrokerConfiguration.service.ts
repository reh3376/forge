import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PasswordService } from "../auth/password.service";
import { UnsBrokerConfigurationServiceBase } from "./base/unsBrokerConfiguration.service.base";

@Injectable()
export class UnsBrokerConfigurationService extends UnsBrokerConfigurationServiceBase {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly passwordService: PasswordService
  ) {
    super(prisma, passwordService);
  }
}
