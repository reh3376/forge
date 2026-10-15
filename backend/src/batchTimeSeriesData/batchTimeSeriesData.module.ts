import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BatchTimeSeriesDataModuleBase } from "./base/batchTimeSeriesData.module.base";
import { BatchTimeSeriesDataService } from "./batchTimeSeriesData.service";
import { BatchTimeSeriesDataController } from "./batchTimeSeriesData.controller";
import { BatchTimeSeriesDataResolver } from "./batchTimeSeriesData.resolver";

@Module({
  imports: [BatchTimeSeriesDataModuleBase, forwardRef(() => AuthModule)],
  controllers: [BatchTimeSeriesDataController],
  providers: [BatchTimeSeriesDataService, BatchTimeSeriesDataResolver],
  exports: [BatchTimeSeriesDataService],
})
export class BatchTimeSeriesDataModule {}
