import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SchemaVersionService {
  constructor(private readonly prisma: PrismaService) {}

  async getVersion(): Promise<string | null> {
    return this.prisma.getSchemaVersion();
  }
}
