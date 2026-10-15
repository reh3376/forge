import { Injectable, ExecutionContext } from "@nestjs/common";
import { ThrottlerGuard, ThrottlerException } from "@nestjs/throttler";
import { GqlExecutionContext } from "@nestjs/graphql";

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Handle GraphQL context - req might be the GraphQL context object
    if (req && req.req) {
      // This is a GraphQL request, extract from the underlying HTTP request
      const httpRequest = req.req;
      return this.getClientIP(httpRequest);
    }

    // Handle regular HTTP requests
    return this.getClientIP(req);
  }

  private getClientIP(req: any): string {
    // Handle case where req might be undefined or null
    if (!req) {
      return "127.0.0.1";
    }

    // Try multiple ways to get the client IP
    return (
      req.ip ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      req.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.headers?.["x-real-ip"] ||
      req.headers?.["x-client-ip"] ||
      req.connection?.socket?.remoteAddress ||
      "127.0.0.1" // fallback to localhost
    );
  }

  protected getRequestResponse(context: ExecutionContext): {
    req: any;
    res: any;
  } {
    try {
      // Check if this is a GraphQL context
      if (context.getType<"graphql" | "http">() === "graphql") {
        const gqlContext = GqlExecutionContext.create(context);
        const contextValue = gqlContext.getContext();

        // Return the request and response objects from GraphQL context
        if (contextValue && contextValue.req && contextValue.res) {
          return { req: contextValue.req, res: contextValue.res };
        }

        // Create mock objects for GraphQL that have the required methods
        const mockReq = contextValue?.req || {};
        const mockRes = {
          header: (_name: string, _value: any) => {},
          setHeader: (_name: string, _value: any) => {},
          getHeader: (_name: string) => undefined,
          status: (_code: number) => ({ send: (_body: any) => {} }),
        };

        return { req: mockReq, res: mockRes };
      }

      // For HTTP contexts, return the request and response directly
      const req = context.switchToHttp().getRequest();
      const res = context.switchToHttp().getResponse();
      return { req, res };
    } catch (error) {
      console.warn(
        "Error getting request/response in CustomThrottlerGuard:",
        error
      );

      // Return safe fallback objects
      const mockReq = {};
      const mockRes = {
        header: (_name: string, _value: any) => {},
        setHeader: (_name: string, _value: any) => {},
        getHeader: (_name: string) => undefined,
        status: (_code: number) => ({ send: (_body: any) => {} }),
      };

      return { req: mockReq, res: mockRes };
    }
  }
}
