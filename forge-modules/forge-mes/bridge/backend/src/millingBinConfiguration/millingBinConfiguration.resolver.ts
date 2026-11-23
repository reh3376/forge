import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { MillingBinConfigurationResolverBase } from "./base/millingBinConfiguration.resolver.base";
import { MillingBinConfiguration } from "./base/MillingBinConfiguration";
import { MillingBinConfigurationService } from "./millingBinConfiguration.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => MillingBinConfiguration)
export class MillingBinConfigurationResolver extends MillingBinConfigurationResolverBase {
  constructor(
    protected readonly service: MillingBinConfigurationService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
