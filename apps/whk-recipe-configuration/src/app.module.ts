import { Module } from "@nestjs/common";

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
import { CacheModule } from "@nestjs/cache-manager";
import { redisStore } from "cache-manager-ioredis-yet";
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
import { ProductionScheduleModule } from "./productionSchedule/productionSchedule.module";
import { AccountModule } from "./account/account.module";
import { PurchaseOrderModule } from "./purchaseOrder/purchaseOrder.module";
import { SalesOrderModule } from "./salesOrder/salesOrder.module";
import { TestModule } from "./test/test.module";
import { AssetModule } from "./asset/asset.module";
import { ItemReceiptModule } from "./itemReceipt/itemReceipt.module";
import { LotModule } from "./lot/lot.module";
import { BomItemModule } from "./bomItem/bomItem.module";
import { UnitModule } from "./unit/unit.module";
import { ProductionOrderUnitProcedureModule } from "./productionOrderUnitProcedure/productionOrderUnitProcedure.module";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { SecretsManagerModule } from "./providers/secrets/secretsManager.module";
import { ServeStaticModule } from "@nestjs/serve-static";
import { ServeStaticOptionsService } from "./serveStaticOptions.service";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { GraphQLModule } from "@nestjs/graphql";
import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";

import { LoggerModule } from "./logger/logger.module";

import { ACLModule } from "./auth/acl.module";
import { AuthModule } from "./auth/auth.module";

@Module({
  controllers: [],
  imports: [
    ACLModule,
    AuthModule,
    LoggerModule,
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
    ProductionScheduleModule,
    AccountModule,
    PurchaseOrderModule,
    SalesOrderModule,
    TestModule,
    AssetModule,
    ItemReceiptModule,
    LotModule,
    BomItemModule,
    UnitModule,
    ProductionOrderUnitProcedureModule,
    HealthModule,
    PrismaModule,
    SecretsManagerModule,
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
  ],
  providers: [],
})
export class AppModule {}
