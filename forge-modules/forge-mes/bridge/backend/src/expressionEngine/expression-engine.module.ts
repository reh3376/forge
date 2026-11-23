import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ExpressionEngineService } from "./expression-engine.service";

@Module({
  imports: [PrismaModule],
  providers: [ExpressionEngineService],
  exports: [ExpressionEngineService],
})
export class ExpressionEngineModule {}
