import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { HealthGateway } from "./health.gateway";

@Module({
  controllers: [HealthController],
  providers: [HealthService, HealthGateway],
  exports: [HealthService],
})
export class HealthModule {}
