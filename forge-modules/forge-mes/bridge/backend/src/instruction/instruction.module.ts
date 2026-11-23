import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { InstructionModuleBase } from "./base/instruction.module.base";
import { InstructionService } from "./instruction.service";
import { InstructionController } from "./instruction.controller";
import { InstructionResolver } from "./instruction.resolver";

@Module({
  imports: [InstructionModuleBase, forwardRef(() => AuthModule)],
  controllers: [InstructionController],
  providers: [InstructionService, InstructionResolver],
  exports: [InstructionService],
})
export class InstructionModule {}
