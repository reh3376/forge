import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { WinstonModule } from "nest-winston";
import { LoggerConfiguration } from "./logger.config";

@Module({
  imports: [
    WinstonModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => LoggerConfiguration(config)
    })
  ]
})
export class LoggerModule {}