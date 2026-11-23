import { Module } from "@nestjs/common";
import { OpenRouterModule } from "../providers/openrouter/openrouter.module";
import { FormulaConfigModule } from "../formulaConfig/formula-config.module";
import { FormulaLibraryModule } from "../formulaLibrary/formula-library.module";
import { PrismaModule } from "../prisma/prisma.module";
import { FormulaAssistantService } from "./formula-assistant.service";
import { FormulaAssistantResolver } from "./formula-assistant.resolver";

@Module({
  imports: [
    OpenRouterModule,
    FormulaConfigModule,
    FormulaLibraryModule,
    PrismaModule,
  ],
  providers: [FormulaAssistantService, FormulaAssistantResolver],
  exports: [FormulaAssistantService],
})
export class FormulaAssistantModule {}
