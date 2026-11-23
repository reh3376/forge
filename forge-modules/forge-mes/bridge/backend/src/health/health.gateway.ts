import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger } from "@nestjs/common";
import { HealthService } from "./health.service";
import { SystemHealth } from "./base/health.service.base";

@WebSocketGateway({
  namespace: "health",
  cors: {
    origin: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
      : ["http://localhost:4000", "http://localhost:3000"],
    credentials: process.env.CORS_CREDENTIALS !== "false",
  },
})
export class HealthGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger("HealthGateway");
  private healthInterval?: NodeJS.Timeout;
  private connectedClients = 0;

  constructor(private readonly healthService: HealthService) {}

  afterInit() {
    this.logger.log("Health WebSocket Gateway initialized");
  }

  handleConnection(client: Socket) {
    this.connectedClients++;
    this.logger.log(
      `Client connected: ${client.id}, total: ${this.connectedClients}`
    );

    // Send initial health status to the new client
    this.sendHealthStatus(client);

    // Start broadcasting health status if this is the first client
    if (this.connectedClients === 1) {
      this.startHealthBroadcast();
    }
  }

  handleDisconnect(client: Socket) {
    this.connectedClients--;
    this.logger.log(
      `Client disconnected: ${client.id}, remaining: ${this.connectedClients}`
    );

    // Stop the health broadcast if no clients are connected
    if (this.connectedClients === 0 && this.healthInterval) {
      this.stopHealthBroadcast();
    }
  }

  private async sendHealthStatus(client?: Socket) {
    try {
      const health = await this.healthService.getCompleteHealth();

      // Send to specific client if provided, otherwise broadcast to all
      if (client) {
        client.emit("health", health);
      } else {
        this.server.emit("health", health);
      }
    } catch (error) {
      this.logger.error("Error getting health status", error);
    }
  }

  private startHealthBroadcast() {
    // Broadcast health status every 10 seconds
    this.healthInterval = setInterval(async () => {
      await this.sendHealthStatus();
    }, 10000);

    this.logger.log("Started health status broadcast");
  }

  private stopHealthBroadcast() {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = undefined;
      this.logger.log("Stopped health status broadcast");
    }
  }

  // Public method to manually trigger a health broadcast
  async broadcastHealth() {
    await this.sendHealthStatus();
  }
}
