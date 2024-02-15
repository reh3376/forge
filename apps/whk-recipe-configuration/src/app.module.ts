import { Module } from "@nestjs/common";
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
import { ProductionOrderQueueModule } from "./productionOrderQueue/productionOrderQueue.module";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { SecretsManagerModule } from "./providers/secrets/secretsManager.module";
import { MqttModule } from "./kafka/mqtt.module";
import { KafkaModule } from "./kafka/kafka.module";
import { ServeStaticModule } from "@nestjs/serve-static";
import { ServeStaticOptionsService } from "./serveStaticOptions.service";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { GraphQLModule } from "@nestjs/graphql";
import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";

import { ACLModule } from "./auth/acl.module";
import { AuthModule } from "./auth/auth.module";

@Module({
  controllers: [],
  imports: [
    KafkaModule,
    ACLModule,
    AuthModule,
    MqttModule,
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
    ProductionOrderQueueModule,
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
  ],
  providers: [],
})
export class AppModule {}
