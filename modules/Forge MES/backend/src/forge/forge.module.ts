/**
 * ForgeModule: the backend's link to forge-core (the hub).
 *
 * Global so MqttDomainPublisherService can take ForgeIngestService as an
 * optional dependency, and domain modules can register ForgeWriteTargets
 * with ForgeWriteService, without every module importing this one.
 */
import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { FORGE_CONFIG, ForgeConfig, loadForgeConfig } from "./forge.config";
import { ForgeController } from "./forge.controller";
import { ForgeHubClient } from "./forge-hub.client";
import { ForgeHubService } from "./forge-hub.service";
import { ForgeIngestService } from "./forge-ingest.service";
import { ForgeSpokeServer } from "./forge-spoke.server";
import { ForgeWriteService } from "./forge-write.service";

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [ForgeController],
  providers: [
    {
      provide: FORGE_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ForgeConfig =>
        loadForgeConfig((key) => config.get<string>(key)),
    },
    {
      provide: ForgeHubClient,
      inject: [FORGE_CONFIG],
      useFactory: (cfg: ForgeConfig): ForgeHubClient =>
        new ForgeHubClient({
          url: cfg.hubUrl,
          tls: cfg.tls,
          rpcTimeoutMs: cfg.rpcTimeoutMs,
        }),
    },
    ForgeIngestService,
    ForgeWriteService,
    ForgeSpokeServer,
    ForgeHubService,
  ],
  exports: [
    FORGE_CONFIG,
    ForgeHubClient,
    ForgeIngestService,
    ForgeWriteService,
    ForgeSpokeServer,
    ForgeHubService,
  ],
})
export class ForgeModule {}
