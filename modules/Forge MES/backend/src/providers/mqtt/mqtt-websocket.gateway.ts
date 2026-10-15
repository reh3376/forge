import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import {
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  UseGuards,
} from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { Subscription } from "rxjs";
import { MqttService, MqttEvent } from "./mqtt.service";
import { WebSocketAuthGuard } from "../../auth/websocket-auth.guard";
import { UserInfo } from "../../auth/UserInfo";

interface AuthenticatedSocket extends Socket {
  user?: UserInfo;
}

interface ClientInfo {
  id: string;
  connectedAt: Date;
  lastActivity: Date;
  messageCount: number;
  user?: UserInfo;
}

@UseGuards(WebSocketAuthGuard)
@WebSocketGateway({
  namespace: "/mqtt",
  cors: {
    origin: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
      : ["http://localhost:4000", "http://localhost:3000"],
    credentials: process.env.CORS_CREDENTIALS !== "false",
  },
})
export class MqttWebSocketGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(MqttWebSocketGateway.name);
  private mqttEventSubscription!: Subscription;
  private connectedClients = new Map<string, ClientInfo>();

  // Rate limiting configuration
  private readonly maxMessagesPerMinute = 60;
  private readonly maxConnectionsPerUser = 3;

  constructor(private readonly mqttService: MqttService) {}

  onModuleInit() {
    this.logger.log("Initializing MQTT WebSocket Gateway...");
    this.subscribeMqttEvents();
  }

  onModuleDestroy() {
    this.logger.log("Destroying MQTT WebSocket Gateway...");
    if (this.mqttEventSubscription) {
      this.mqttEventSubscription.unsubscribe();
    }
  }

  afterInit(server: Server) {
    this.logger.log("MQTT WebSocket Gateway initialized");
    this.startCleanupInterval();
  }

  handleConnection(client: AuthenticatedSocket) {
    const clientInfo: ClientInfo = {
      id: client.id,
      connectedAt: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
      user: client.user,
    };

    // Check connection limits per user
    if (client.user && this.checkConnectionLimits(client.user)) {
      this.logger.warn(
        `Connection limit exceeded for user: ${client.user.username}`
      );
      client.emit("mqtt:error", {
        type: "connection_limit_exceeded",
        message: "Maximum connections per user exceeded",
        timestamp: new Date().toISOString(),
      });
      client.disconnect(true);
      return;
    }

    this.connectedClients.set(client.id, clientInfo);

    this.logger.log(
      `Client connected: ${client.id}${
        client.user ? ` (user: ${client.user.username})` : ""
      }`
    );

    // Send current connection status to newly connected client
    this.sendConnectionStatus(client);

    // Send welcome message with user info
    client.emit("mqtt:status", {
      type: "gateway_connected",
      message: "Connected to MQTT WebSocket Gateway",
      timestamp: new Date().toISOString(),
      connectedBrokers: this.mqttService.getConnectedBrokers(),
      user: client.user
        ? {
            username: client.user.username,
            roles: client.user.roles,
          }
        : null,
    });

    // Broadcast connection event to other clients (without sensitive user data)
    client.broadcast.emit("mqtt:client_event", {
      type: "client_connected",
      clientId: client.id,
      timestamp: new Date().toISOString(),
      totalClients: this.connectedClients.size,
    });
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const clientInfo = this.connectedClients.get(client.id);
    this.connectedClients.delete(client.id);

    this.logger.log(
      `Client disconnected: ${client.id}${
        clientInfo?.user ? ` (user: ${clientInfo.user.username})` : ""
      }`
    );

    // Broadcast disconnection event
    client.broadcast.emit("mqtt:client_event", {
      type: "client_disconnected",
      clientId: client.id,
      timestamp: new Date().toISOString(),
      totalClients: this.connectedClients.size,
    });
  }

  /**
   * Handle client requests for broker status
   */
  @SubscribeMessage("mqtt:get_status")
  handleGetStatus(@ConnectedSocket() client: AuthenticatedSocket) {
    this.logger.debug(`Received mqtt:get_status from client: ${client.id}`);

    if (!this.checkRateLimit(client)) {
      this.logger.warn(`Rate limit check failed for client: ${client.id}`);
      return;
    }

    this.logger.debug(`Sending connection status to client: ${client.id}`);
    this.sendConnectionStatus(client);
  }

  /**
   * Handle client requests for connection statistics
   */
  @SubscribeMessage("mqtt:get_stats")
  handleGetStats(@ConnectedSocket() client: AuthenticatedSocket) {
    if (!this.checkRateLimit(client)) {
      return;
    }

    const stats = {
      totalClients: this.connectedClients.size,
      connectedBrokers: this.mqttService.getConnectedBrokers().length,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };

    client.emit("mqtt:stats", stats);
  }

  /**
   * Subscribe to MQTT service events and forward them to WebSocket clients
   */
  private subscribeMqttEvents() {
    this.mqttEventSubscription = this.mqttService
      .getEventObservable()
      .subscribe({
        next: (event: MqttEvent) => {
          this.forwardMqttEvent(event);
        },
        error: (error) => {
          this.logger.error("Error in MQTT event subscription", error);
          if (this.server) {
            this.server.emit("mqtt:error", {
              type: "subscription_error",
              error: error instanceof Error ? error.message : String(error),
              timestamp: new Date().toISOString(),
            });
          }
        },
      });

    this.logger.log("Subscribed to MQTT events");
  }

  /**
   * Forward MQTT events to all connected WebSocket clients
   */
  private forwardMqttEvent(event: MqttEvent) {
    try {
      let eventData: any;

      switch (event.type) {
        case "message":
          eventData = {
            type: "message",
            topic: (event.data as any).topic,
            payload: (event.data as any).payload.toString(), // Convert Buffer to string
            timestamp: (event.data as any).timestamp,
            brokerId: event.brokerId,
          };
          break;

        case "connect":
        case "disconnect":
          eventData = {
            type: event.type,
            brokerId: event.brokerId,
            connected: (event.data as any).connected,
            timestamp: (event.data as any).timestamp,
          };
          break;

        case "error":
          eventData = {
            type: "error",
            brokerId: event.brokerId,
            error: (event.data as Error).message,
            timestamp: new Date().toISOString(),
          };
          break;

        case "reconnect":
          eventData = {
            type: "reconnect",
            brokerId: event.brokerId,
            timestamp: new Date().toISOString(),
          };
          break;

        default:
          this.logger.warn(`Unknown MQTT event type: ${event.type}`);
          return;
      }

      // Emit to all connected clients with null check
      if (this.server) {
        this.server.emit("mqtt:event", eventData);
        this.logger.debug(
          `Forwarded MQTT event: ${event.type} from broker ${event.brokerId}`
        );
      } else {
        this.logger.warn(
          `Server not available to forward MQTT event: ${event.type}`
        );
      }
    } catch (error) {
      this.logger.error("Error forwarding MQTT event", error);
    }
  }

  /**
   * Send current connection status to a specific client
   */
  private sendConnectionStatus(client: AuthenticatedSocket) {
    const connectionStatus = this.mqttService.getConnectionStatus();
    const statusArray = Array.from(connectionStatus.entries()).map(
      ([brokerId, connected]) => ({
        brokerId,
        connected,
        brokerConfig: this.mqttService.getBrokerConfiguration(brokerId),
      })
    );

    const response = {
      brokers: statusArray,
      timestamp: new Date().toISOString(),
    };

    this.logger.debug(
      `Sending connection status to client ${client.id}:`,
      JSON.stringify(response, null, 2)
    );
    client.emit("mqtt:connection_status", response);
    this.logger.debug(`Connection status sent to client: ${client.id}`);
  }

  /**
   * Check rate limiting for a client
   */
  private checkRateLimit(client: AuthenticatedSocket): boolean {
    const clientInfo = this.connectedClients.get(client.id);
    if (!clientInfo) {
      this.logger.warn(
        `Client info not found for rate limit check: ${client.id}`
      );
      return false;
    }

    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60000);

    // Reset message count if it's been more than a minute since last activity
    if (clientInfo.lastActivity < oneMinuteAgo) {
      clientInfo.messageCount = 0;
    }

    clientInfo.messageCount++;
    clientInfo.lastActivity = now;

    if (clientInfo.messageCount > this.maxMessagesPerMinute) {
      this.logger.warn(`Rate limit exceeded for client: ${client.id}`);
      client.emit("mqtt:error", {
        type: "rate_limit_exceeded",
        message: "Too many requests. Please slow down.",
        timestamp: new Date().toISOString(),
      });
      return false;
    }

    this.logger.debug(
      `Rate limit check passed for client: ${client.id} (${clientInfo.messageCount}/${this.maxMessagesPerMinute})`
    );
    return true;
  }

  /**
   * Check connection limits per user
   */
  private checkConnectionLimits(user: UserInfo): boolean {
    const userConnections = Array.from(this.connectedClients.values()).filter(
      (client) => client.user?.username === user.username
    );

    return userConnections.length >= this.maxConnectionsPerUser;
  }

  /**
   * Start cleanup interval for inactive connections
   */
  private startCleanupInterval() {
    setInterval(() => {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 300000); // 5 minutes

      for (const [clientId, clientInfo] of this.connectedClients.entries()) {
        if (clientInfo.lastActivity < fiveMinutesAgo) {
          this.logger.debug(`Cleaning up inactive client: ${clientId}`);

          // Add null checks to prevent TypeError
          if (
            this.server &&
            this.server.sockets &&
            this.server.sockets.sockets
          ) {
            const socket = this.server.sockets.sockets.get(clientId);
            if (socket) {
              socket.disconnect(true);
            }
          } else {
            this.logger.warn(
              `Server or sockets not available for cleanup of client: ${clientId}`
            );
          }

          this.connectedClients.delete(clientId);
        }
      }
    }, 60000); // Run every minute
  }

  /**
   * Get the number of connected WebSocket clients
   */
  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  /**
   * Get connected clients info (for admin purposes)
   */
  getConnectedClientsInfo(): Omit<ClientInfo, "user">[] {
    return Array.from(this.connectedClients.values()).map((client) => ({
      id: client.id,
      connectedAt: client.connectedAt,
      lastActivity: client.lastActivity,
      messageCount: client.messageCount,
      user: client.user
        ? {
            username: client.user.username,
            roles: client.user.roles,
          }
        : undefined,
    }));
  }

  /**
   * Broadcast a custom message to all connected clients
   */
  broadcastMessage(message: any) {
    if (this.server) {
      this.server.emit("mqtt:broadcast", {
        ...message,
        timestamp: new Date().toISOString(),
      });
    } else {
      this.logger.warn("Server not available to broadcast message");
    }
  }
}
