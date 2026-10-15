import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Logger,
} from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import { MqttEventPublishRuleService } from "./mqttEventPublishRule.service";

@swagger.ApiTags("mqttEventPublishRules")
@Controller("mqttEventPublishRules")
export class MqttEventPublishRuleController {
  private readonly logger = new Logger(MqttEventPublishRuleController.name);

  constructor(private readonly service: MqttEventPublishRuleService) {}

  @Get()
  async findMany() {
    return this.service.findMany({
      include: { brokers: true },
      orderBy: { priority: "desc" },
    });
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }

  @Post()
  async create(@Body() data: any) {
    return this.service.create(data);
  }

  @Put(":id")
  async update(@Param("id") id: string, @Body() data: any) {
    return this.service.update(id, data);
  }

  @Delete(":id")
  async delete(@Param("id") id: string) {
    return this.service.delete(id);
  }

  @Post("refresh-cache")
  async refreshCache() {
    return this.service.refreshPublisherCache();
  }
}
