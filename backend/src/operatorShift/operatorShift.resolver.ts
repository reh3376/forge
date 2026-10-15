import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { OperatorShiftResolverBase } from "./base/operatorShift.resolver.base";
import { OperatorShift } from "./base/OperatorShift";
import { OperatorShiftService } from "./operatorShift.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => OperatorShift)
export class OperatorShiftResolver extends OperatorShiftResolverBase {
  constructor(
    protected readonly service: OperatorShiftService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
