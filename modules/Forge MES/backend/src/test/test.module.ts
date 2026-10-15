import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TestModuleBase } from "./base/test.module.base";
import { TestService } from "./test.service";
import { TestController } from "./test.controller";
import { TestResolver } from "./test.resolver";

@Module({
  imports: [TestModuleBase, forwardRef(() => AuthModule)],
  controllers: [TestController],
  providers: [TestService, TestResolver],
  exports: [TestService],
})
export class TestModule {}
