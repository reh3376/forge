import { Controller, Get } from "@nestjs/common";
import { SchemaVersionService } from "./schemaVersion.service";

@Controller("schema-version")
export class SchemaVersionController {
  constructor(private readonly service: SchemaVersionService) {}

  @Get()
  async getVersion() {
    const version = await this.service.getVersion();
    return { schemaVersion: version };
  }
}
