import * as graphql from "@nestjs/graphql";
import {
  ACGuard,
  InjectRolesBuilder,
  RolesBuilder,
  UseRoles,
} from "nest-access-control";
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
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
