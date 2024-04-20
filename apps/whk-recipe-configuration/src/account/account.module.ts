import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AccountModuleBase } from "./base/account.module.base";
import { AccountService } from "./account.service";
import { AccountController } from "./account.controller";
import { AccountResolver } from "./account.resolver";

@Module({
  imports: [AccountModuleBase, forwardRef(() => AuthModule)],
  controllers: [AccountController],
  providers: [AccountService, AccountResolver],
  exports: [AccountService],
})
export class AccountModule {}
