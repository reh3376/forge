import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RecipeBomModuleBase } from "./base/recipeBom.module.base";
import { RecipeBomService } from "./recipeBom.service";
import { RecipeBomController } from "./recipeBom.controller";
import { RecipeBomResolver } from "./recipeBom.resolver";

@Module({
  imports: [RecipeBomModuleBase, forwardRef(() => AuthModule)],
  controllers: [RecipeBomController],
  providers: [RecipeBomService, RecipeBomResolver],
  exports: [RecipeBomService],
})
export class RecipeBomModule {}
