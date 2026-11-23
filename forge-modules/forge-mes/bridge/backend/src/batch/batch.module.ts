import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BatchModuleBase } from "./base/batch.module.base";
import { BatchService } from "./batch.service";
import { BatchController } from "./batch.controller";
import { BatchResolver } from "./batch.resolver";

@Module({
  imports: [BatchModuleBase, forwardRef(() => AuthModule)],
  controllers: [BatchController],
  providers: [BatchService, BatchResolver],
  exports: [BatchService],
})
export class BatchModule {}
