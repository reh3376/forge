import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Socket } from "socket.io";
import { UserService } from "../user/user.service";
import { UserInfo } from "./UserInfo";

/**
 * WebSocket authentication guard for Socket.IO connections.
 *
 * Features:
 * - Validates JWT tokens from handshake auth or query parameters
 * - Optional authentication in development mode (NODE_ENV=development)
 * - Required authentication in production mode
 * - Attaches user information to socket for later use
 */
@Injectable()
export class WebSocketAuthGuard implements CanActivate {
  private readonly logger = new Logger(WebSocketAuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    private readonly configService: ConfigService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: Socket = context.switchToWs().getClient<Socket>();

      // Bypass authentication in development mode
      const nodeEnv = this.configService.get<string>("NODE_ENV");
      if (nodeEnv === "development") {
        const token = this.extractToken(client);

        // If no token is provided in development, allow access
        if (!token) {
          this.logger.debug(
            "Development mode: No token provided, allowing connection"
          );
          return true;
        }

        // If token is provided, validate it normally
        return await this.validateToken(client, token);
      }

      // For production mode, token is required
      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn("Production mode: No authentication token provided");
        client.disconnect(true);
        return false;
      }

      return await this.validateToken(client, token);
    } catch (error) {
      this.logger.error("WebSocket authentication error:", error);
      const client: Socket = context.switchToWs().getClient<Socket>();
      client.disconnect(true);
      return false;
    }
  }

  /**
   * Extract JWT token from Socket.IO handshake
   */
  private extractToken(client: Socket): string | null {
    // Try to get token from handshake auth
    const authToken = client.handshake.auth?.token;
    if (authToken) {
      return authToken;
    }

    // Try to get token from query parameters
    const queryToken = client.handshake.query?.token;
    if (queryToken && typeof queryToken === "string") {
      return queryToken;
    }

    // Try to get token from Authorization header
    const authHeader = client.handshake.headers?.authorization;
    if (authHeader && typeof authHeader === "string") {
      const match = authHeader.match(/^Bearer\s+(.+)$/);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Validate JWT token and attach user to socket
   */
  private async validateToken(client: Socket, token: string): Promise<boolean> {
    try {
      // Verify JWT token
      const payload = this.jwtService.verify(token);

      // Get user from database
      const user = await this.userService.user({
        where: { username: payload.username },
      });

      if (!user) {
        this.logger.warn(`User not found for username: ${payload.username}`);
        client.disconnect(true);
        return false;
      }

      // Validate user roles
      if (
        !Array.isArray(user.roles) ||
        typeof user.roles !== "object" ||
        user.roles === null
      ) {
        this.logger.error(`Invalid user roles for user: ${user.username}`);
        client.disconnect(true);
        return false;
      }

      // Attach user info to socket for later use
      const userInfo: UserInfo = {
        ...user,
        roles: user.roles as string[],
      };

      (client as any).user = userInfo;

      this.logger.debug(
        `WebSocket authentication successful for user: ${user.username}`
      );
      return true;
    } catch (error) {
      this.logger.warn(
        "Invalid JWT token:",
        error instanceof Error ? error.message : String(error)
      );
      client.disconnect(true);
      return false;
    }
  }
}
