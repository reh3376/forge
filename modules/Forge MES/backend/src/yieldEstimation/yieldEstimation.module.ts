import { Module } from "@nestjs/common";
import { ProductionMetricModule } from "../productionMetric/productionMetric.module";
import { ExpressionEngineModule } from "../expressionEngine/expression-engine.module";
import { FormulaLibraryModule } from "../formulaLibrary/formula-library.module";
import { YieldEstimationService } from "./yieldEstimation.service";
import { YieldEstimationResolver } from "./yieldEstimation.resolver";

@Module({
  imports: [
    ProductionMetricModule,
    ExpressionEngineModule,
    FormulaLibraryModule,
  ],
  providers: [YieldEstimationService, YieldEstimationResolver],
  exports: [YieldEstimationService],
})
export class YieldEstimationModule {}
