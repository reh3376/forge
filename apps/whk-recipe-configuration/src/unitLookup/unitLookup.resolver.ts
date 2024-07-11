import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { UnitLookupResolverBase } from "./base/unitLookup.resolver.base";
import { UnitLookup } from "./base/UnitLookup";
import { UnitLookupService } from "./unitLookup.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => UnitLookup)
export class UnitLookupResolver extends UnitLookupResolverBase {
  constructor(
    protected readonly service: UnitLookupService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
