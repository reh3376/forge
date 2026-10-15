import { Module } from "@nestjs/common";
import { AccessControlModule, RolesBuilder } from "nest-access-control";
import { OptimizedPermissionService } from "./optimized-permission.service";

// Create a factory function that uses our optimized service
export function createOptimizedRolesBuilder(): RolesBuilder {
  const optimizedService = new OptimizedPermissionService();
  const grants = optimizedService.generateFullGrants();

  // Log optimization stats for monitoring
  const stats = optimizedService.getOptimizationStats();
  console.log("🚀 Optimized Grants System Loaded:", {
    totalRoles: stats.totalRoles,
    totalPermissions: stats.totalPermissions,
    compressionRatio: stats.compressionRatio,
  });

  return new RolesBuilder(grants);
}

@Module({
  imports: [AccessControlModule.forRoles(createOptimizedRolesBuilder())],
  providers: [OptimizedPermissionService],
  exports: [AccessControlModule, OptimizedPermissionService],
})
export class ACLModule {}
