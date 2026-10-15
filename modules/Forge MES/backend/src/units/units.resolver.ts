import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { UnitsResolverBase } from "./base/units.resolver.base";
import { Units } from "./base/Units";
import { UnitsService } from "./units.service";
import { InjectRolesBuilder } from "nest-access-control";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => Units)
export class UnitsResolver extends UnitsResolverBase {
  constructor(
    protected readonly service: UnitsService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
