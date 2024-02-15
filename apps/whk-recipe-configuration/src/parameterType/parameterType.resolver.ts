import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { ParameterTypeResolverBase } from "./base/parameterType.resolver.base";
import { ParameterType } from "./base/ParameterType";
import { ParameterTypeService } from "./parameterType.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => ParameterType)
export class ParameterTypeResolver extends ParameterTypeResolverBase {
  constructor(
    protected readonly service: ParameterTypeService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
