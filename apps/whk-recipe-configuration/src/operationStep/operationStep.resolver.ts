import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { OperationStepResolverBase } from "./base/operationStep.resolver.base";
import { OperationStep } from "./base/OperationStep";
import { OperationStepService } from "./operationStep.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => OperationStep)
export class OperationStepResolver extends OperationStepResolverBase {
  constructor(
    protected readonly service: OperationStepService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
