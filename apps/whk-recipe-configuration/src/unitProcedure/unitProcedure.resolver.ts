import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { UnitProcedureResolverBase } from "./base/unitProcedure.resolver.base";
import { UnitProcedure } from "./base/UnitProcedure";
import { UnitProcedureService } from "./unitProcedure.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => UnitProcedure)
export class UnitProcedureResolver extends UnitProcedureResolverBase {
  constructor(
    protected readonly service: UnitProcedureService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
