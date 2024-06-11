import { ClientProxy } from "@nestjs/microservices";
import { MqttMessage } from "./types";
import { Inject, OnModuleInit } from "@nestjs/common";
import { MyMessageBrokerTopics } from "./topics";

export class MqttProducerService implements OnModuleInit {
  constructor(
    @Inject("MQTT_CLIENT") private readonly mqttClient: ClientProxy
  ) {}

  async publish(
    topic: MyMessageBrokerTopics,
    message: MqttMessage
  ): Promise<void> {
    return await new Promise((resolve, reject) => {
      this.mqttClient.emit(topic, message).subscribe({
        error(err) {
          reject(err);
        },
        next() {
          resolve();
        },
      });
    });
  }

  async onModuleInit() {
    await this.mqttClient.connect();
  }
}
