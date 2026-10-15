import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { BatchTimeSeriesDataResolverBase } from "./base/batchTimeSeriesData.resolver.base";
import { BatchTimeSeriesData } from "./base/BatchTimeSeriesData";
import { BatchTimeSeriesDataService } from "./batchTimeSeriesData.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => BatchTimeSeriesData)
export class BatchTimeSeriesDataResolver extends BatchTimeSeriesDataResolverBase {
  constructor(
    protected readonly service: BatchTimeSeriesDataService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
