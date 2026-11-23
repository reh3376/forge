import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { BatchDeviationService } from "./batchDeviation.service";

@Module({
  imports: [PrismaModule],
  providers: [BatchDeviationService],
  exports: [BatchDeviationService],
})
export class BatchDeviationModule {}
