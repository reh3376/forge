import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { BatchParameterConfigurationResolverBase } from "./base/batchParameterConfiguration.resolver.base";
import { BatchParameterConfiguration } from "./base/BatchParameterConfiguration";
import { BatchParameterConfigurationService } from "./batchParameterConfiguration.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => BatchParameterConfiguration)
export class BatchParameterConfigurationResolver extends BatchParameterConfigurationResolverBase {
  constructor(
    protected readonly service: BatchParameterConfigurationService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
