import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { RecipeBomActualResolverBase } from "./base/recipeBomActual.resolver.base";
import { RecipeBomActual } from "./base/RecipeBomActual";
import { RecipeBomActualService } from "./recipeBomActual.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => RecipeBomActual)
export class RecipeBomActualResolver extends RecipeBomActualResolverBase {
  constructor(
    protected readonly service: RecipeBomActualService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
