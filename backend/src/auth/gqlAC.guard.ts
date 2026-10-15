import { ExecutionContext, Injectable, CanActivate } from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { ACGuard, InjectRolesBuilder, RolesBuilder } from "nest-access-control";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import type { Request } from "express";

/**
 * GraphQL version of ACGuard with development mode bypass functionality.
 *
 * Features:
 * - Supports @Public() decorator
 * - Optional access control in development/ci mode (NODE_ENV=development or ci)
 * - Required access control in production mode
 * - When bypassing in development/ci, grants full access to all resources
 */
@Injectable()
export class GqlACGuard<User> implements CanActivate {
  private acGuard: ACGuard<User>;

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    @InjectRolesBuilder() private readonly rolesBuilder: RolesBuilder
  ) {
    this.acGuard = new ACGuard<User>(reflector, rolesBuilder);
  }

  async getUser(context: ExecutionContext): Promise<User> {
    const ctx = GqlExecutionContext.create(context);
    const request = ctx.getContext<{ req: { user: User } }>().req;

    // In development/ci mode, if no user is present, create a default admin user
    const nodeEnv = this.configService.get<string>("NODE_ENV");
    if ((nodeEnv === "development" || nodeEnv === "ci") && !request.user) {
      // Create a default user with admin role for development/ci
      const defaultUser = {
        id: "dev-user",
        username: "dev-user",
        roles: ["admin"],
      } as unknown as User;

      // Set the user on the request for other parts of the application
      request.user = defaultUser;
      return defaultUser;
    }

    return request.user;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if the endpoint is marked as public
    const isPublic = this.reflector.get<boolean>(
      IS_PUBLIC_KEY,
      context.getHandler()
    );

    if (isPublic) {
      return true;
    }

    // Bypass access control in development and CI modes
    const nodeEnv = this.configService.get<string>("NODE_ENV");
    if (nodeEnv === "development" || nodeEnv === "ci") {
      // Check if Authorization header is present in GraphQL context
      const ctx = GqlExecutionContext.create(context);
      const request = ctx.getContext<{ req: Request }>().req;
      const authHeader = request.headers?.authorization;

      // If no auth header is provided in development/ci, set up default user and allow access
      if (!authHeader) {
        // Ensure we have a default user set up for ACL processing
        await this.getUser(context);
        return true;
      }

      // If auth header is provided, validate it normally
      return this.acGuard.canActivate(context);
    }

    // For production mode, use normal access control
    return this.acGuard.canActivate(context);
  }
}
