import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { UnitLookupModuleBase } from "./base/unitLookup.module.base";
import { UnitLookupService } from "./unitLookup.service";
import { UnitLookupController } from "./unitLookup.controller";
import { UnitLookupResolver } from "./unitLookup.resolver";

@Module({
  imports: [UnitLookupModuleBase, forwardRef(() => AuthModule)],
  controllers: [UnitLookupController],
  providers: [UnitLookupService, UnitLookupResolver],
  exports: [UnitLookupService],
})
export class UnitLookupModule {}
