import { ExecutionContext } from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import type { Request } from "express";
import { DefaultAuthGuard } from "./defaultAuth.guard";
import { JwtAuthGuard } from "./jwt/jwtAuth.guard";

/**
 * GraphQL version of DefaultAuthGuard with the same development mode bypass functionality.
 *
 * Inherits all features from DefaultAuthGuard but adapted for GraphQL context:
 * - Supports @Public() decorator
 * - Optional authentication in development/ci mode (NODE_ENV=development or ci)
 * - Required authentication in production mode
 */
export class GqlDefaultAuthGuard extends DefaultAuthGuard {
  constructor(reflector: Reflector, configService: ConfigService) {
    super(reflector, configService);
  }

  // This method is required for the interface - do not delete it.
  getRequest<Request>(context: ExecutionContext): Request {
    const ctx = GqlExecutionContext.create(context);
    return ctx.getContext<{ req: Request }>().req;
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.get<boolean>(
      IS_PUBLIC_KEY,
      context.getHandler()
    );

    if (isPublic) {
      return true;
    }

    // Bypass authentication in development and CI modes
    const nodeEnv = this.configService.get<string>("NODE_ENV");
    if (nodeEnv === "development" || nodeEnv === "ci") {
      // Check if Authorization header is present in GraphQL context
      const request = this.getRequest(context) as any;
      const authHeader = request.headers?.authorization;

      // If no auth header is provided in development/ci, allow access
      if (!authHeader) {
        return true;
      }

      // If auth header is provided, validate it normally
      // Call JwtAuthGuard's canActivate directly to avoid HTTP context issues
      return JwtAuthGuard.prototype.canActivate.call(this, context);
    }

    // For production mode, call JwtAuthGuard's canActivate directly
    return JwtAuthGuard.prototype.canActivate.call(this, context);
  }
}
