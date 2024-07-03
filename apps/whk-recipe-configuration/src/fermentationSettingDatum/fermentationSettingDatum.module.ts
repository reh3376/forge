import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FermentationSettingDatumModuleBase } from "./base/fermentationSettingDatum.module.base";
import { FermentationSettingDatumService } from "./fermentationSettingDatum.service";
import { FermentationSettingDatumController } from "./fermentationSettingDatum.controller";
import { FermentationSettingDatumResolver } from "./fermentationSettingDatum.resolver";

@Module({
  imports: [FermentationSettingDatumModuleBase, forwardRef(() => AuthModule)],
  controllers: [FermentationSettingDatumController],
  providers: [
    FermentationSettingDatumService,
    FermentationSettingDatumResolver,
  ],
  exports: [FermentationSettingDatumService],
})
export class FermentationSettingDatumModule {}
