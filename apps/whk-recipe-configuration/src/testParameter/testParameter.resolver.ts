import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { TestParameterResolverBase } from "./base/testParameter.resolver.base";
import { TestParameter } from "./base/TestParameter";
import { TestParameterService } from "./testParameter.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => TestParameter)
export class TestParameterResolver extends TestParameterResolverBase {
  constructor(
    protected readonly service: TestParameterService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
