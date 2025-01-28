import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
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
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
