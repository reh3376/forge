import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { BatchMaterialConsumptionResolverBase } from "./base/batchMaterialConsumption.resolver.base";
import { BatchMaterialConsumption } from "./base/BatchMaterialConsumption";
import { BatchMaterialConsumptionService } from "./batchMaterialConsumption.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => BatchMaterialConsumption)
export class BatchMaterialConsumptionResolver extends BatchMaterialConsumptionResolverBase {
  constructor(
    protected readonly service: BatchMaterialConsumptionService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
