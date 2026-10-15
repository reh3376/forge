import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RecipeBomModuleBase } from "./base/recipeBom.module.base";
import { RecipeBomService } from "./recipeBom.service";
import { RecipeBomController } from "./recipeBom.controller";
import { RecipeBomResolver } from "./recipeBom.resolver";
import { BomCalculationService } from "./bom-calculation.service";
import { EnzymeDosingService } from "../recipe/enzyme.dosing";
import { EnzymeConfigurationModule } from "../enzymeConfiguration/enzymeConfiguration.module";
import { SystemConfigurationModule } from "../systemConfiguration/systemConfiguration.module";
import { ExpressionEngineModule } from "../expressionEngine/expression-engine.module";
import { FormulaLibraryModule } from "../formulaLibrary/formula-library.module";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [
    RecipeBomModuleBase,
    forwardRef(() => AuthModule),
    EnzymeConfigurationModule,
    SystemConfigurationModule,
    ExpressionEngineModule,
    FormulaLibraryModule,
    AuditModule,
  ],
  controllers: [RecipeBomController],
  providers: [
    RecipeBomService,
    RecipeBomResolver,
    BomCalculationService,
    EnzymeDosingService,
  ],
  exports: [RecipeBomService, BomCalculationService],
})
export class RecipeBomModule {}
