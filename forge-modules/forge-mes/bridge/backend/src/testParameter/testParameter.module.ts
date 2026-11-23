import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TestParameterModuleBase } from "./base/testParameter.module.base";
import { TestParameterService } from "./testParameter.service";
import { TestParameterController } from "./testParameter.controller";
import { TestParameterResolver } from "./testParameter.resolver";

@Module({
  imports: [TestParameterModuleBase, forwardRef(() => AuthModule)],
  controllers: [TestParameterController],
  providers: [TestParameterService, TestParameterResolver],
  exports: [TestParameterService],
})
export class TestParameterModule {}
