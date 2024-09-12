import { Inject, Injectable } from "@nestjs/common";
import { ClientRMQ, RmqRecordBuilder } from "@nestjs/microservices";
import { RabbitMQMessage } from "./RabbitMQMessage";
import { RabbitMQMessageHeaders } from "./RabbitMQMessageHeaders";
import { AllMessageBrokerTopics } from "./topics";

@Injectable()
export class RabbitMQProducerService {
  constructor(@Inject("RABBITMQ_CLIENT") private rabbitMQClient: ClientRMQ) {}

  private isnumber(value: any) {
    return Object.prototype.toString.call(value) === '[object number]' ||
        (value != null && value.constructor && value.constructor.name === 'number');
  }

  public recursivenumberReplacer(key: string, value: any): any {
    // Handle arrays: apply replacer to each element
    if (Array.isArray(value)) {
      return value.map(item => this.recursivenumberReplacer('', item));
    }

    // Convert number instances to numbers
    if (this.isnumber(value)) {
      return value.toNumber();
    }

    // Handle objects: apply replacer to each property
    if (value !== null && typeof value === 'object') {
      const replacement: any = {};
      for (const [k, v] of Object.entries(value)) {
        replacement[k] = this.recursivenumberReplacer(k, v);
      }
      return replacement;
    }


    // Return all other values unchanged
    return value;
  }

  async emitMessage(
    topic: AllMessageBrokerTopics,
    message: RabbitMQMessage,
    headers?: RabbitMQMessageHeaders,
    priority?: number
  ): Promise<void> {
    const record = new RmqRecordBuilder(message)
      .setOptions({
        headers,
        priority,
      })
      .build();

    const client = await this.rabbitMQClient.createClient();
    const channel = client.createChannel();

    await channel.waitForConnect();

    await channel.assertExchange(topic, "fanout", { durable: true });
    console.log(JSON.stringify({ pattern: topic, data: record }, this.recursivenumberReplacer.bind(this)))
    await channel.publish(
      topic,
      "",
      Buffer.from(JSON.stringify({ pattern: topic, data: record }, this.recursivenumberReplacer.bind(this))),
      {
        persistent: true,
      }
    );
  }

  async onModuleInit() {
    await this.rabbitMQClient.connect();
  }
}
