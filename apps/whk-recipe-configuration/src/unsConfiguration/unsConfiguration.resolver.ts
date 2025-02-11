import * as graphql from "@nestjs/graphql";
import { ACGuard, InjectRolesBuilder, RolesBuilder, UseRoles } from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { UnsConfigurationResolverBase } from "./base/unsConfiguration.resolver.base";
import { UnsConfiguration } from "./base/UnsConfiguration";
import { UnsConfigurationService } from "./unsConfiguration.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => UnsConfiguration)
export class UnsConfigurationResolver extends UnsConfigurationResolverBase {
  constructor(
    protected readonly service: UnsConfigurationService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
