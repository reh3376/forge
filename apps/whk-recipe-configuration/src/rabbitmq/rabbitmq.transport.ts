import { ServerRMQ, CustomTransportStrategy } from "@nestjs/microservices";

export class RabbitMQ extends ServerRMQ implements CustomTransportStrategy {
  // Change Function to a specific callback type
  async setupChannel(channel: any, callback: () => void): Promise<void> {
    const exchange = this.queue;
    const groupId =
      this.getOptionsProp(this.options?.queueOptions, "consumerGroupId" as never) ||
      "whk-mes";

    await channel.assertExchange(exchange, "fanout", { durable: true });

    await channel.assertQueue(groupId, {
      exclusive: false,
      durable: true,
      ...this.queueOptions,
    });
    await channel.bindQueue(groupId, exchange, "");

    channel.consume(
      groupId,
      async (msg: any) => {
        await this.handleMessage(msg, channel);
        channel.ack(msg);
      },
      {
        noAck: false,
      }
    );
    callback();
  }
}