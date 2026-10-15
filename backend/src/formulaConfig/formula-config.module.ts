import { Module } from "@nestjs/common";
import { FormulaConfigService } from "./formula-config.service";
import { FormulaConfigResolver } from "./formula-config.resolver";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  providers: [FormulaConfigService, FormulaConfigResolver],
  exports: [FormulaConfigService],
})
export class FormulaConfigModule {}
