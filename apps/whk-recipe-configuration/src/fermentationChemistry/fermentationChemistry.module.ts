import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FermentationChemistryModuleBase } from "./base/fermentationChemistry.module.base";
import { FermentationChemistryService } from "./fermentationChemistry.service";
import { FermentationChemistryController } from "./fermentationChemistry.controller";
import { FermentationChemistryResolver } from "./fermentationChemistry.resolver";

@Module({
  imports: [FermentationChemistryModuleBase, forwardRef(() => AuthModule)],
  controllers: [FermentationChemistryController],
  providers: [FermentationChemistryService, FermentationChemistryResolver],
  exports: [FermentationChemistryService],
})
export class FermentationChemistryModule {}
