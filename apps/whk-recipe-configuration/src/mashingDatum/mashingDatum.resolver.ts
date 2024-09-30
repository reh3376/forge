import * as graphql from "@nestjs/graphql";
import * as nestAccessControl from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { MashingDatumResolverBase } from "./base/mashingDatum.resolver.base";
import { MashingDatum } from "./base/MashingDatum";
import { MashingDatumService } from "./mashingDatum.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => MashingDatum)
export class MashingDatumResolver extends MashingDatumResolverBase {
  constructor(
    protected readonly service: MashingDatumService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
