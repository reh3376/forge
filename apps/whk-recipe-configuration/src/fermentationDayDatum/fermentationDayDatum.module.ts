import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FermentationDayDatumModuleBase } from "./base/fermentationDayDatum.module.base";
import { FermentationDayDatumService } from "./fermentationDayDatum.service";
import { FermentationDayDatumController } from "./fermentationDayDatum.controller";
import { FermentationDayDatumResolver } from "./fermentationDayDatum.resolver";

@Module({
  imports: [FermentationDayDatumModuleBase, forwardRef(() => AuthModule)],
  controllers: [FermentationDayDatumController],
  providers: [FermentationDayDatumService, FermentationDayDatumResolver],
  exports: [FermentationDayDatumService],
})
export class FermentationDayDatumModule {}
