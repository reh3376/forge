import { Observable } from "rxjs";
import { ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { GqlExecutionContext } from "@nestjs/graphql";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { JwtAuthGuard } from "./jwt/jwtAuth.guard";

/**
 * Default authentication guard that extends JWT authentication with additional features:
 *
 * 1. Supports @Public() decorator to bypass authentication for specific routes
 * 2. In development/ci mode (NODE_ENV=development or ci), authentication is optional:
 *    - If no Authorization header is provided, access is granted
 *    - If Authorization header is provided, it's validated normally
 * 3. In production mode, authentication is always required (unless @Public())
 * 4. Supports both HTTP and GraphQL contexts
 */
@Injectable()
export class DefaultAuthGuard extends JwtAuthGuard {
  constructor(
    protected readonly reflector: Reflector,
    protected readonly configService: ConfigService
  ) {
    super();
  }

  /**
   * Extract request object from either HTTP or GraphQL context
   */
  public getRequest(context: ExecutionContext): any {
    const contextType = context.getType<"http" | "graphql">();

    if (contextType === "graphql") {
      const gqlContext = GqlExecutionContext.create(context);
      return gqlContext.getContext().req;
    }

    // Default to HTTP context
    return context.switchToHttp().getRequest();
  }

  canActivate(
    context: ExecutionContext
  ): boolean | Promise<boolean> | Observable<any> {
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
      // Check if Authorization header is present
      const request = this.getRequest(context);

      // Ensure request and headers exist
      if (!request || !request.headers) {
        return true; // Allow access if request context is not available
      }

      const authHeader = request.headers.authorization;

      // If no auth header is provided in development/ci, allow access
      if (!authHeader) {
        return true;
      }

      // If auth header is provided, validate it normally
      return super.canActivate(context);
    }

    return super.canActivate(context);
  }
}
