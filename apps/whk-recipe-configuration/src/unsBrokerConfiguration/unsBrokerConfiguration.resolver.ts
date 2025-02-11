import * as graphql from "@nestjs/graphql";
import { ACGuard, InjectRolesBuilder, RolesBuilder, UseRoles } from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { UnsBrokerConfigurationResolverBase } from "./base/unsBrokerConfiguration.resolver.base";
import { UnsBrokerConfiguration } from "./base/UnsBrokerConfiguration";
import { UnsBrokerConfigurationService } from "./unsBrokerConfiguration.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => UnsBrokerConfiguration)
export class UnsBrokerConfigurationResolver extends UnsBrokerConfigurationResolverBase {
  constructor(
    protected readonly service: UnsBrokerConfigurationService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
