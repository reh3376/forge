import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Logger,
  HttpException,
  HttpStatus,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { DefaultAuthGuard } from "../../auth/defaultAuth.guard";
import { ACGuard, UseRoles } from "nest-access-control";
import { UserInfo } from "../../auth/UserInfo";
import { UserData } from "../../auth/userData.decorator";
import { MqttService } from "./mqtt.service";
import { PublishMqttMessageDto } from "./dto/publish-mqtt-message.dto";
import { AuditInterceptor } from "./interceptors/audit.interceptor";

@ApiTags("MQTT")
@Controller("mqtt")
@UseGuards(DefaultAuthGuard, ACGuard)
@ApiBearerAuth()
@UseInterceptors(AuditInterceptor)
export class MqttController {
  private readonly logger = new Logger(MqttController.name);

  constructor(private readonly mqttService: MqttService) {}

  @Get("status")
  @UseGuards() // Override class-level guards - make status endpoint public
  @ApiOperation({
    summary: "Get MQTT broker connection status",
    description:
      "Returns the connection status for all configured MQTT brokers",
  })
  @ApiResponse({
    status: 200,
    description: "Connection status retrieved successfully",
    schema: {
      type: "object",
      properties: {
        isConnected: { type: "boolean" },
        connectedBrokers: { type: "number" },
        totalBrokers: { type: "number" },
        lastUpdate: { type: "string" },
        brokerStatuses: {
          type: "array",
          items: {
            type: "object",
            properties: {
              brokerId: { type: "string" },
              connected: { type: "boolean" },
            },
          },
        },
      },
    },
  })
  getStatus() {
    const connectionStatus = this.mqttService.getConnectionStatus();
    const brokerStatuses = Array.from(connectionStatus.entries()).map(
      ([brokerId, connected]) => ({
        brokerId,
        connected,
      })
    );

    const connectedCount = brokerStatuses.filter((b) => b.connected).length;
    const totalCount = brokerStatuses.length;

    // Wrap response in standard API format expected by frontend
    return {
      success: true,
      data: {
        isConnected: connectedCount > 0,
        connectedBrokers: connectedCount,
        totalBrokers: totalCount,
        lastUpdate: new Date().toISOString(),
        brokerStatuses,
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Post("publish")
  @UseRoles({
    resource: "mqtt",
    action: "create",
    possession: "any",
  })
  @ApiOperation({
    summary: "Publish message to MQTT broker",
    description:
      "Publishes a message to the specified MQTT topic on the configured broker",
  })
  @ApiResponse({
    status: 200,
    description: "Message published successfully",
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        message: { type: "string" },
        timestamp: { type: "string" },
        brokerId: { type: "string" },
        topic: { type: "string" },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "Invalid request parameters",
  })
  @ApiResponse({
    status: 403,
    description: "Insufficient permissions or topic not allowed",
  })
  @ApiResponse({
    status: 404,
    description: "Broker not found or not connected",
  })
  @ApiResponse({
    status: 500,
    description: "Internal server error during message publishing",
  })
  async publishMessage(
    @Body() publishDto: PublishMqttMessageDto,
    @UserData() user: UserInfo
  ) {
    try {
      this.logger.log(
        `Publishing MQTT message to topic ${publishDto.topic} on broker ${publishDto.brokerId} by user ${user.username}`
      );

      // Validate broker exists and is connected
      const connectionStatus = this.mqttService.getConnectionStatus();
      const isConnected = connectionStatus.get(publishDto.brokerId);

      // Enhanced logging for debugging
      this.logger.debug(
        `Available broker IDs: ${Array.from(connectionStatus.keys()).join(
          ", "
        )}`
      );
      this.logger.debug(`Requested broker ID: ${publishDto.brokerId}`);
      this.logger.debug(
        `Connection status for requested broker: ${isConnected}`
      );

      if (isConnected === undefined) {
        this.logger.error(
          `Broker ${
            publishDto.brokerId
          } not found. Available brokers: ${Array.from(
            connectionStatus.keys()
          ).join(", ")}`
        );
        throw new HttpException(
          `Broker ${publishDto.brokerId} not found`,
          HttpStatus.NOT_FOUND
        );
      }

      if (!isConnected) {
        throw new HttpException(
          `Broker ${publishDto.brokerId} is not connected`,
          HttpStatus.SERVICE_UNAVAILABLE
        );
      }

      // Publish the message
      await this.mqttService.publish(
        publishDto.brokerId,
        publishDto.topic,
        publishDto.payload,
        {
          qos: publishDto.qos || 0,
          retain: publishDto.retain || false,
        }
      );

      const response = {
        success: true,
        message: "Message published successfully",
        timestamp: new Date().toISOString(),
        brokerId: publishDto.brokerId,
        topic: publishDto.topic,
      };

      this.logger.log(
        `Successfully published message to topic ${publishDto.topic} on broker ${publishDto.brokerId}`
      );

      return response;
    } catch (error) {
      this.logger.error(
        `Failed to publish message to topic ${publishDto.topic} on broker ${publishDto.brokerId}`,
        error
      );

      if (error instanceof HttpException) {
        throw error;
      }

      // Handle MQTT-specific errors
      if ((error as Error).message?.includes("not allowed by ACL")) {
        throw new HttpException(
          `Publishing to topic ${publishDto.topic} is not allowed`,
          HttpStatus.FORBIDDEN
        );
      }

      throw new HttpException(
        "Failed to publish message",
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
