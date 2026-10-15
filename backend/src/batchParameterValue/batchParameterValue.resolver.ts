import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { BatchParameterValueResolverBase } from "./base/batchParameterValue.resolver.base";
import { BatchParameterValue } from "./base/BatchParameterValue";
import { BatchParameterValueService } from "./batchParameterValue.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => BatchParameterValue)
export class BatchParameterValueResolver extends BatchParameterValueResolverBase {
  constructor(
    protected readonly service: BatchParameterValueService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
