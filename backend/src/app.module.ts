import { Module } from "@nestjs/common";
import { CacheModule } from "@nestjs/cache-manager";
import { redisStore } from "cache-manager-ioredis-yet";
import { ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ClsModule } from "nestjs-cls";

// OpenTelemetry disabled for staging deployment (ARM compatibility issues)
// import {
//   OpenTelemetryModule,
//   PipeInjector,
//   ControllerInjector,
//   EventEmitterInjector,
//   GraphQLResolverInjector,
//   GuardInjector,
// } from "@amplication/opentelemetry-nestjs";

// import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
// import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
// import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { RabbitMQModule } from "./rabbitmq/rabbitmq.module";
import { UserModule } from "./user/user.module";
import { PhaseParameterModule } from "./phaseParameter/phaseParameter.module";
import { TestParameterModule } from "./testParameter/testParameter.module";
import { InstructionModule } from "./instruction/instruction.module";
import { EquipmentPhaseModule } from "./equipmentPhase/equipmentPhase.module";
import { OperationModule } from "./operation/operation.module";
import { ProcedureModule } from "./procedure/procedure.module";
import { RecipeModule } from "./recipe/recipe.module";
import { BomModule } from "./bom/bom.module";
import { ScheduleOrderQueueModule } from "./scheduleOrderQueue/scheduleOrderQueue.module";
import { UnitProcedureModule } from "./unitProcedure/unitProcedure.module";
import { RecipeGroupModule } from "./recipeGroup/recipeGroup.module";
import { ProductionOrderModule } from "./productionOrder/productionOrder.module";
import { ScheduleOrderModule } from "./scheduleOrder/scheduleOrder.module";
import { ItemModule } from "./item/item.module";
import { ItemGroupModule } from "./itemGroup/itemGroup.module";
import { CustomerModule } from "./customer/customer.module";
import { PurchaseOrderModule } from "./purchaseOrder/purchaseOrder.module";
import { SalesOrderModule } from "./salesOrder/salesOrder.module";
import { TestModule } from "./test/test.module";
import { AssetModule } from "./asset/asset.module";
import { ItemReceiptModule } from "./itemReceipt/itemReceipt.module";
import { LotModule } from "./lot/lot.module";
import { WhiskeyTypeModule } from "./whiskeyType/whiskeyType.module";
import { BomItemModule } from "./bomItem/bomItem.module";
import { BatchModule } from "./batch/batch.module";
import { VendorModule } from "./vendor/vendor.module";
import { InventoryModule } from "./inventory/inventory.module";
import { InventoryLogModule } from "./inventoryLog/inventoryLog.module";
import { InventoryTransferModule } from "./inventoryTransfer/inventoryTransfer.module";
import { UnitLookupModule } from "./unitLookup/unitLookup.module";
import { ProductionOrderBomItemModule } from "./productionOrderBomItem/productionOrderBomItem.module";
import { RecipeBomItemModule } from "./recipeBomItem/recipeBomItem.module";
import { MashingProtocolModule } from "./mashingProtocol/mashingProtocol.module";
import { MashingProtocolStepModule } from "./mashingProtocolStep/mashingProtocolStep.module";
import { RecipeBomModule } from "./recipeBom/recipeBom.module";
import { ProductionOrderRecipeInstanceModule } from "./productionOrderRecipeInstance/productionOrderRecipeInstance.module";
import { ScheduleOrderRecipeInstanceModule } from "./scheduleOrderRecipeInstance/scheduleOrderRecipeInstance.module";
import { SeparationEventModule } from "./separationEvent/separationEvent.module";
import { AdditiveActualModule } from "./additiveActual/additiveActual.module";
import { UnsConfigurationModule } from "./unsConfiguration/unsConfiguration.module";
import { UnsBrokerConfigurationModule } from "./unsBrokerConfiguration/unsBrokerConfiguration.module";
import { MashingProtocolStepActualModule } from "./mashingProtocolStepActual/mashingProtocolStepActual.module";
import { RecipeBomActualModule } from "./recipeBomActual/recipeBomActual.module";
import { MillingBinConfigurationModule } from "./millingBinConfiguration/millingBinConfiguration.module";
import { CommentModule } from "./comment/comment.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { WidgetModule } from "./widget/widget.module";
import { BatchTimeSeriesDataModule } from "./batchTimeSeriesData/batchTimeSeriesData.module";
import { BatchMaterialConsumptionModule } from "./batchMaterialConsumption/batchMaterialConsumption.module";
import { BatchParameterConfigurationModule } from "./batchParameterConfiguration/batchParameterConfiguration.module";
import { BatchParameterValueModule } from "./batchParameterValue/batchParameterValue.module";
import { OperatorShiftModule } from "./operatorShift/operatorShift.module";
import { HealthModule } from "./health/health.module";
import { SchemaVersionModule } from "./schemaVersion/schemaVersion.module";
import { PrismaModule } from "./prisma/prisma.module";
import { SecretsManagerModule } from "./providers/secrets/secretsManager.module";
import { StorageModule } from "./storage/storage.module";
import { ServeStaticModule } from "@nestjs/serve-static";
import { ServeStaticOptionsService } from "./serveStaticOptions.service";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { GraphQLModule } from "@nestjs/graphql";
import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import { NotificationModule } from "./providers/notification/notification.module";
import { MqttModule } from "./providers/mqtt/mqtt.module";

import { ACLModule } from "./auth/acl.module";
import { AuthModule } from "./auth/auth.module";
import { SyncModule } from "./sync/sync.module";

import { LoggerModule } from "./logger/logger.module";

import { DevtoolsModule } from "@nestjs/devtools-integration";
import { RecipeParameterModule } from "./recipeParameter/recipeParameter.module";
import { UnitsModule } from "./units/units.module";
import { OpenApiModule } from "./openapi/openapi.module";
import { EnzymeConfigurationModule } from "./enzymeConfiguration/enzymeConfiguration.module";
import { SystemConfigurationModule } from "./systemConfiguration/systemConfiguration.module";
import { AuditModule } from "./audit/audit.module";
import { CustomThrottlerGuard } from "./guards/custom-throttler.guard";
import { AuditContextInterceptor } from "./audit/audit-context.interceptor";
import { DaytonaModule } from "./daytona/daytona.module";
import { GrainCharacterModule } from "./grainCharacter/grainCharacter.module";
import { ExpressionEngineModule } from "./expressionEngine/expression-engine.module";
import { FormulaLibraryModule } from "./formulaLibrary/formula-library.module";
import { FormulaConfigModule } from "./formulaConfig/formula-config.module";
import { ProductionEventModule } from "./productionEvent/productionEvent.module";
import { BatchDeviationModule } from "./batchDeviation/batchDeviation.module";
import { StepExecutionModule } from "./stepExecution/stepExecution.module";
import { MashingExecutionModule } from "./mashingExecution/mashingExecution.module";
import { MqttDomainPublisherModule } from "./mqttDomainPublisher/mqttDomainPublisher.module";
import { MqttEventPublishRuleModule } from "./mqttEventPublishRule/mqttEventPublishRule.module";
import { ProductionMetricModule } from "./productionMetric/productionMetric.module";
import { YieldEstimationModule } from "./yieldEstimation/yieldEstimation.module";
import { FormulaAssistantModule } from "./formulaAssistant/formula-assistant.module";
import { MashingStepParameterModule } from "./mashingStepParameter/mashingStepParameter.module";
import { ChangeoverModule } from "./changeover/changeover.module";
import { EquipmentStateModule } from "./equipmentState/equipmentState.module";

@Module({
  controllers: [],
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
      },
    }),
    StorageModule,
    RabbitMQModule,
    LoggerModule,
    ACLModule,
    AuthModule,
    ThrottlerModule.forRoot([
      {
        name: "short",
        ttl: 1000, // 1 second
        limit: parseInt(process.env.THROTTLE_SHORT_LIMIT || "20"), // Increased from 10 to 20 requests per second
      },
      {
        name: "medium",
        ttl: 60000, // 1 minute
        limit: parseInt(process.env.THROTTLE_MEDIUM_LIMIT || "300"), // Increased from 100 to 300 requests per minute
      },
      {
        name: "long",
        ttl: 900000, // 15 minutes
        limit: parseInt(process.env.THROTTLE_LONG_LIMIT || "3000"), // Increased from 1000 to 3000 requests per 15 minutes
      },
    ]),
    UserModule,
    PhaseParameterModule,
    TestParameterModule,
    RecipeParameterModule,
    UnitsModule,
    OpenApiModule,
    EnzymeConfigurationModule,
    SystemConfigurationModule,
    AuditModule,
    DaytonaModule,
    GrainCharacterModule,
    ExpressionEngineModule,
    FormulaLibraryModule,
    FormulaConfigModule,
    InstructionModule,
    EquipmentPhaseModule,
    OperationModule,
    ProcedureModule,
    RecipeModule,
    BomModule,
    ScheduleOrderQueueModule,
    UnitProcedureModule,
    RecipeGroupModule,
    ProductionOrderModule,
    ScheduleOrderModule,
    ItemModule,
    ItemGroupModule,
    CustomerModule,
    PurchaseOrderModule,
    SalesOrderModule,
    TestModule,
    AssetModule,
    ItemReceiptModule,
    LotModule,
    WhiskeyTypeModule,
    BomItemModule,
    BatchModule,
    VendorModule,
    InventoryModule,
    InventoryLogModule,
    InventoryTransferModule,
    UnitLookupModule,
    ProductionOrderBomItemModule,
    RecipeBomItemModule,
    MashingProtocolModule,
    MashingProtocolStepModule,
    RecipeBomModule,
    ProductionOrderRecipeInstanceModule,
    ScheduleOrderRecipeInstanceModule,
    SeparationEventModule,
    AdditiveActualModule,
    UnsConfigurationModule,
    UnsBrokerConfigurationModule,
    MashingProtocolStepActualModule,
    RecipeBomActualModule,
    MillingBinConfigurationModule,
    CommentModule,
    NotificationModule,
    DashboardModule,
    WidgetModule,
    BatchTimeSeriesDataModule,
    BatchMaterialConsumptionModule,
    BatchParameterConfigurationModule,
    BatchParameterValueModule,
    OperatorShiftModule,
    HealthModule,
    SchemaVersionModule,
    PrismaModule,
    SecretsManagerModule,
    SyncModule,
    NotificationModule,
    MqttModule,
    ProductionEventModule,
    BatchDeviationModule,
    StepExecutionModule,
    MashingExecutionModule,
    MqttDomainPublisherModule,
    MqttEventPublishRuleModule,
    ProductionMetricModule,
    YieldEstimationModule,
    FormulaAssistantModule,
    MashingStepParameterModule,
    ChangeoverModule,
    EquipmentStateModule,
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRootAsync({
      useClass: ServeStaticOptionsService,
    }),
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      useFactory: (configService: ConfigService) => {
        const playground = configService.get("GRAPHQL_PLAYGROUND");
        const introspection = configService.get("GRAPHQL_INTROSPECTION");
        const nodeEnv = configService.get("NODE_ENV");

        // Get CORS configuration from environment variables
        const corsOrigins = configService.get("CORS_ORIGINS");
        const corsCredentials =
          configService.get("CORS_CREDENTIALS", "true") === "true";
        const corsEnabled =
          configService.get("CORS_ENABLED", "true") === "true";

        // Parse origins from comma-separated string or use defaults
        const allowedOrigins = corsOrigins
          ? corsOrigins.split(",").map((origin: string) => origin.trim())
          : [
              "http://localhost:4000",
              "http://localhost:3000",
              "http://127.0.0.1:4000",
              "http://127.0.0.1:3000",
            ];

        return {
          autoSchemaFile: "schema.graphql",
          sortSchema: true,
          playground,
          introspection: playground || introspection,
          path: "/graphql",
          // Enable CORS in Apollo Server to handle preflight requests
          cors: corsEnabled
            ? {
                origin: allowedOrigins,
                credentials: corsCredentials,
                methods: ["GET", "POST", "OPTIONS"],
                allowedHeaders: [
                  "Content-Type",
                  "Authorization",
                  "apollo-require-preflight",
                  "x-apollo-operation-name",
                  "Accept",
                  "Origin",
                  "X-Requested-With",
                ],
              }
            : false,
          // Disable CSRF protection completely to avoid preflight issues
          csrfPrevention: false,
        };
      },
      inject: [ConfigService],
      imports: [ConfigModule],
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],

      useFactory: async (configService: ConfigService) => {
        const host = configService.get("REDIS_HOST");
        const port = configService.get("REDIS_PORT");
        const username = configService.get("REDIS_USERNAME");
        const password = configService.get("REDIS_PASSWORD");
        const ttl = configService.get("REDIS_TTL", 5000);

        return {
          store: await redisStore({
            host: host,
            port: port,
            username: username,
            password: password,
            ttl: ttl,
          }),
        };
      },

      inject: [ConfigService],
    }),
    // OpenTelemetry disabled for staging deployment (ARM compatibility issues)
    // OpenTelemetryModule.forRoot({
    //   serviceName: "whk-mes",
    //   spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter()),
    //   instrumentations: [
    //     new HttpInstrumentation({
    //       requestHook: (span, request) => {
    //         if (request.method)
    //           span.setAttribute("http.method", request.method);
    //       },
    //     }),
    //   ],

    //   traceAutoInjectors: [
    //     ControllerInjector,
    //     EventEmitterInjector,
    //     GraphQLResolverInjector,
    //     GuardInjector,
    //     PipeInjector,
    //   ],
    // }),
    // DevtoolsModule.register({
    //   http: process.env.NODE_ENV !== 'production'
    // }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditContextInterceptor,
    },
  ],
})
export class AppModule {}
