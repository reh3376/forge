import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { OpenRouterService } from "./openrouter.service";

@Module({
  imports: [ConfigModule],
  providers: [OpenRouterService],
  exports: [OpenRouterService],
})
export class OpenRouterModule {}
