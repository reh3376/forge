import { Module, forwardRef } from "@nestjs/common";
import { EnzymeConfigurationService } from "./enzymeConfiguration.service";
import { EnzymeConfigurationController } from "./enzymeConfiguration.controller";
import { EnzymeConfigurationResolver } from "./enzymeConfiguration.resolver";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { ACLModule } from "../auth/acl.module";

@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule), ACLModule],
  controllers: [EnzymeConfigurationController],
  providers: [EnzymeConfigurationService, EnzymeConfigurationResolver],
  exports: [EnzymeConfigurationService],
})
export class EnzymeConfigurationModule {}
