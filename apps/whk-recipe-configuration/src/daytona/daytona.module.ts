import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DaytonaService } from "./daytona.service";
import { DaytonaResolver } from "./daytona.resolver";

/**
 * Daytona Module
 *
 * Provides sandbox environment management for AI-assisted code generation and testing.
 * Sandboxes offer isolated, secure execution environments for:
 * - Testing custom recipe calculations
 * - Running user-provided scripts
 * - AI-generated code validation
 * - Development environment provisioning
 *
 * Configuration:
 * - DAYTONA_API_KEY: Required for authentication
 * - DAYTONA_API_URL: Optional API endpoint
 * - DAYTONA_TARGET: Optional target environment
 */
@Module({
  imports: [ConfigModule],
  providers: [DaytonaService, DaytonaResolver],
  exports: [DaytonaService],
})
export class DaytonaModule {}
