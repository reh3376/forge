import { Module } from "@nestjs/common";
import { FormulaLibraryService } from "./formula-library.service";
import { FormulaLibraryResolver } from "./formula-library.resolver";
import { PrismaModule } from "../prisma/prisma.module";
import { ExpressionEngineModule } from "../expressionEngine/expression-engine.module";

@Module({
  imports: [PrismaModule, ExpressionEngineModule],
  providers: [FormulaLibraryService, FormulaLibraryResolver],
  exports: [FormulaLibraryService],
})
export class FormulaLibraryModule {}
