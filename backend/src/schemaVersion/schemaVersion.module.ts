import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SchemaVersionService } from "./schemaVersion.service";
import { SchemaVersionController } from "./schemaVersion.controller";

@Module({
  imports: [PrismaModule],
  providers: [SchemaVersionService],
  controllers: [SchemaVersionController],
  exports: [SchemaVersionService],
})
export class SchemaVersionModule {}
