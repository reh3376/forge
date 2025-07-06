import { Module } from "@nestjs/common";
import { CacheModule } from "@nestjs/cache-manager";
import { redisStore } from "cache-manager-ioredis-yet";

import {
  OpenTelemetryModule,
  PipeInjector,
  ControllerInjector,
  EventEmitterInjector,
  GraphQLResolverInjector,
  GuardInjector,
} from "@amplication/opentelemetry-nestjs";

import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { RabbitMQModule } from "./rabbitmq/rabbitmq.module";
import { UserModule } from "./user/user.module";
import { PhaseParameterModule } from "./phaseParameter/phaseParameter.module";
import { TestParameterModule } from "./testParameter/testParameter.module";
import { RecipeParameterModule } from "./recipeParameter/recipeParameter.module";
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
import { BomItemModule } from "./bomItem/bomItem.module";
import { UnitModule } from "./unit/unit.module";
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
import { AdditiveActualModule } from "./additiveActual/additiveActual.module";
import { UnsConfigurationModule } from "./unsConfiguration/unsConfiguration.module";
import { UnsBrokerConfigurationModule } from "./unsBrokerConfiguration/unsBrokerConfiguration.module";
import { MashingProtocolStepActualModule } from "./mashingProtocolStepActual/mashingProtocolStepActual.module";
import { RecipeBomActualModule } from "./recipeBomActual/recipeBomActual.module";
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

import { ACLModule } from "./auth/acl.module";
import { AuthModule } from "./auth/auth.module";
import { SyncModule } from "./sync/sync.module";

import { LoggerModule } from "./logger/logger.module";

import { DevtoolsModule } from "@nestjs/devtools-integration";

@Module({
  controllers: [],
  imports: [
    StorageModule,
    RabbitMQModule,
    LoggerModule,
    ACLModule,
    AuthModule,
    UserModule,
    PhaseParameterModule,
    TestParameterModule,
    RecipeParameterModule,
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
    BomItemModule,
    UnitModule,
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
    AdditiveActualModule,
    UnsConfigurationModule,
    UnsBrokerConfigurationModule,
    MashingProtocolStepActualModule,
    RecipeBomActualModule,
    HealthModule,
    SchemaVersionModule,
    PrismaModule,
    SecretsManagerModule,
    SyncModule,
    NotificationModule,
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRootAsync({
      useClass: ServeStaticOptionsService,
    }),
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      useFactory: (configService: ConfigService) => {
        const playground = configService.get("GRAPHQL_PLAYGROUND");
        const introspection = configService.get("GRAPHQL_INTROSPECTION");
        return {
          autoSchemaFile: "schema.graphql",
          sortSchema: true,
          playground,
          introspection: playground || introspection,
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
    OpenTelemetryModule.forRoot({
      serviceName: "whk-mes",
      spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter()),
      instrumentations: [
        new HttpInstrumentation({
          requestHook: (span, request) => {
            if (request.method)
              span.setAttribute("http.method", request.method);
          },
        }),
      ],

      traceAutoInjectors: [
        ControllerInjector,
        EventEmitterInjector,
        GraphQLResolverInjector,
        GuardInjector,
        PipeInjector,
      ],
    }),
    // DevtoolsModule.register({
    //   http: process.env.NODE_ENV !== 'production'
    // }),
  ],
  providers: [],
})
export class AppModule {}
