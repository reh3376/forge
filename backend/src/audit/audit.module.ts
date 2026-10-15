import { Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { AuditController } from "./audit.controller";
import { AuditResolver } from "./audit.resolver";
import { AuditMiddlewareService } from "./audit-middleware.service";
import { AuditContextInterceptor } from "./audit-context.interceptor";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [AuditController],
  providers: [
    AuditService,
    AuditResolver,
    AuditMiddlewareService,
    AuditContextInterceptor,
  ],
  exports: [AuditService, AuditMiddlewareService, AuditContextInterceptor],
})
export class AuditModule {}
