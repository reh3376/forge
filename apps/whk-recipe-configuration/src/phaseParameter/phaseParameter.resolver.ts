import * as graphql from "@nestjs/graphql";
import { ACGuard, InjectRolesBuilder, RolesBuilder, UseRoles } from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { PhaseParameterResolverBase } from "./base/phaseParameter.resolver.base";
import { PhaseParameter } from "./base/PhaseParameter";
import { PhaseParameterService } from "./phaseParameter.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => PhaseParameter)
export class PhaseParameterResolver extends PhaseParameterResolverBase {
  constructor(
    protected readonly service: PhaseParameterService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
