import * as graphql from "@nestjs/graphql";
import { ACGuard, InjectRolesBuilder, RolesBuilder, UseRoles } from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { AdditiveActualResolverBase } from "./base/additiveActual.resolver.base";
import { AdditiveActual } from "./base/AdditiveActual";
import { AdditiveActualService } from "./additiveActual.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => AdditiveActual)
export class AdditiveActualResolver extends AdditiveActualResolverBase {
  constructor(
    protected readonly service: AdditiveActualService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
