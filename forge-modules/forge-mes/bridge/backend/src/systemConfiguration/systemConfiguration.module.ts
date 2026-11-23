import { Module } from "@nestjs/common";
import { CacheModule } from "@nestjs/cache-manager";
import { SystemConfigurationService } from "./systemConfiguration.service";
import { SystemConfigurationController } from "./systemConfiguration.controller";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [
    PrismaModule,
    CacheModule.register({
      ttl: 300, // 5 minutes
      max: 1000, // maximum number of items in cache
    }),
  ],
  controllers: [SystemConfigurationController],
  providers: [SystemConfigurationService],
  exports: [SystemConfigurationService],
})
export class SystemConfigurationModule {}
