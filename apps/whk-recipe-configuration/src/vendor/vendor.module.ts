import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { VendorModuleBase } from "./base/vendor.module.base";
import { VendorService } from "./vendor.service";
import { VendorController } from "./vendor.controller";
import { VendorResolver } from "./vendor.resolver";

@Module({
  imports: [VendorModuleBase, forwardRef(() => AuthModule)],
  controllers: [VendorController],
  providers: [VendorService, VendorResolver],
  exports: [VendorService],
})
export class VendorModule {}
