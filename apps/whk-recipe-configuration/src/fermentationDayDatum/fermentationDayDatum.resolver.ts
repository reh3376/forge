import * as graphql from "@nestjs/graphql";
import { ACGuard, InjectRolesBuilder, RolesBuilder, UseRoles } from "nest-access-control";
import * as gqlACGuard from "../auth/gqlAC.guard";
import { GqlDefaultAuthGuard } from "../auth/gqlDefaultAuth.guard";
import * as common from "@nestjs/common";
import { FermentationDayDatumResolverBase } from "./base/fermentationDayDatum.resolver.base";
import { FermentationDayDatum } from "./base/FermentationDayDatum";
import { FermentationDayDatumService } from "./fermentationDayDatum.service";

@common.UseGuards(GqlDefaultAuthGuard, gqlACGuard.GqlACGuard)
@graphql.Resolver(() => FermentationDayDatum)
export class FermentationDayDatumResolver extends FermentationDayDatumResolverBase {
  constructor(
    protected readonly service: FermentationDayDatumService,
    @InjectRolesBuilder()
    protected readonly rolesBuilder: RolesBuilder
  ) {
    super(service, rolesBuilder);
  }
}
