import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { ClsService } from "nestjs-cls";
import { Request } from "express";
import { GqlExecutionContext } from "@nestjs/graphql";

// Extend the Request interface to include user information
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username?: string;
    [key: string]: any;
  };
}

@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditContextInterceptor.name);

  constructor(private readonly cls: ClsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return new Observable((observer) => {
      // Use CLS run to ensure we have a proper context
      this.cls.run(() => {
        try {
          let request: AuthenticatedRequest | undefined;

          // Handle different execution contexts
          if (context.getType() === "http") {
            request = context.switchToHttp().getRequest<AuthenticatedRequest>();
          } else if (context.getType<any>() === "graphql") {
            const gqlContext = GqlExecutionContext.create(context);
            request = gqlContext.getContext()?.req;
          }

          // Only proceed if we have a valid request object
          if (request) {
            // Extract audit context from the request
            const userId = request.user?.id;
            const ipAddress = this.getClientIp(request);
            const userAgent = request.headers?.["user-agent"];

            // Set audit context in CLS for the duration of this request
            if (userId) {
              this.cls.set("userId", userId);
            }
            if (ipAddress) {
              this.cls.set("ipAddress", ipAddress);
            }
            if (userAgent) {
              this.cls.set("userAgent", userAgent);
            }
          }
        } catch (error: unknown) {
          // Log the error but don't fail the request
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          this.logger.warn("Failed to extract audit context:", errorMessage);
        }

        // Execute the actual request handler
        next.handle().subscribe({
          next: (value) => observer.next(value),
          error: (error) => observer.error(error),
          complete: () => observer.complete(),
        });
      });
    });
  }

  private getClientIp(request: Request): string | undefined {
    if (!request || !request.headers) {
      return undefined;
    }

    try {
      // Try to get the real IP address from various headers
      const forwarded = request.headers["x-forwarded-for"];
      if (forwarded) {
        // x-forwarded-for can contain multiple IPs, take the first one
        return Array.isArray(forwarded)
          ? forwarded[0]
          : forwarded.split(",")[0].trim();
      }

      return (
        (request.headers["x-real-ip"] as string) ||
        (request.headers["x-client-ip"] as string) ||
        request.connection?.remoteAddress ||
        request.socket?.remoteAddress ||
        undefined
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.warn("Failed to extract IP address:", errorMessage);
      return undefined;
    }
  }
}
