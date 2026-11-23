import * as graphql from "@nestjs/graphql";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { EnzymeConfigurationResolverBase } from "./base/enzymeConfiguration.resolver.base";
import { EnzymeConfiguration } from "./base/EnzymeConfiguration";
import { EnzymeConfigurationService } from "./enzymeConfiguration.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => EnzymeConfiguration)
export class EnzymeConfigurationResolver extends EnzymeConfigurationResolverBase {
  constructor(
    protected readonly service: EnzymeConfigurationService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
